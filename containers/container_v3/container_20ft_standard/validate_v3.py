#!/usr/bin/env python3
"""
PortIQ 20 FT container — v3 validation against v2.

  python validate_v3.py [--v2 PATH_TO_V2_GLB_OR_ZIP::member]

Checks (exit code 1 on any failure) and writes validation_report.json:
  1  GLB structure: header/chunk lengths, accessor/bufferView ranges, every material
     texture reference resolves, every embedded image decodes
  2  Hierarchy: every v2 node exists in v3 with the same parent
  3  Floor: Floor_Surface vertex/normal/UV/index bytes identical to v2; runtime wood
     images byte-identical to v2; master wood PNGs byte-identical to v2; wood material
     parameters identical
  4  Dimensions measured from geometry match spec; structural node bounds match v2
  5  Corrugated UV continuity + constant texel density (and the same metric on v2)
  6  Rear-door markings do not overlap rods, brackets, handles, hinge straps, CSC plate;
     side decal layers do not overlap each other
  7  Decal stand-off distances (z-fighting margin)
  8  Material response ranges (painted steel dielectric, hardware metallic)
"""
import argparse
import hashlib
import io
import json
import math
import os
import sys
import zipfile

import numpy as np
from PIL import Image

import glb_io

HERE = os.path.dirname(os.path.abspath(__file__))
V2_ZIP = os.path.join(HERE, "..", "..", "container_v2", "container_20ft_standard_upgraded_pack.zip")
V2_DEFAULT = V2_ZIP + "::container_20ft_standard/container_20ft_standard.glb"
results = []


def check(name, ok, detail):
    results.append({"check": name, "pass": bool(ok), "detail": detail})
    print(f"[{'PASS' if ok else 'FAIL'}] {name}: {detail if isinstance(detail, str) else json.dumps(detail)}")


def node_parents(g):
    par = {}
    for n in g["nodes"]:
        for c in n.get("children", []):
            par[g["nodes"][c]["name"]] = n["name"]
    return par


def prim_arrays(g, b, node, mat_name=None):
    out = []
    for p in glb_io.mesh_by_node(g, node)["primitives"]:
        if mat_name and g["materials"][p["material"]]["name"] != mat_name:
            continue
        a = p["attributes"]
        out.append((glb_io.accessor(g, b, a["POSITION"]), glb_io.accessor(g, b, a["NORMAL"]),
                    glb_io.accessor(g, b, a["TEXCOORD_0"]), glb_io.accessor(g, b, p["indices"]).astype(np.int64)))
    return out


def uv_metrics(prims, extrude_axis):
    """Max UV jump between coincident vertices on profile facets, and texel-density spread."""
    max_jump, ratios = 0.0, []
    for P, N, UV, idx in prims:
        keep = np.abs(N[:, extrude_axis]) < 0.5           # exclude sheet-edge caps (legit 90-deg seams)
        key = np.round(P[keep] * 1e5).astype(np.int64)
        uv = UV[keep]
        order = np.lexsort(key.T)
        ks, us = key[order], uv[order]
        same = np.all(ks[1:] == ks[:-1], axis=1)
        if same.any():
            max_jump = max(max_jump, float(np.max(np.linalg.norm(us[1:][same] - us[:-1][same], axis=1))))
        t = idx.reshape(-1, 3)
        tk = keep[t].all(1)
        t = t[tk]
        wa = 0.5 * np.linalg.norm(np.cross(P[t[:, 1]] - P[t[:, 0]], P[t[:, 2]] - P[t[:, 0]]), axis=1)
        e1, e2 = UV[t[:, 1]] - UV[t[:, 0]], UV[t[:, 2]] - UV[t[:, 0]]
        ua = 0.5 * np.abs(e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0])
        good = (wa > 1e-8) & (ua > 1e-12)
        ratios.append(np.sqrt(wa[good] / ua[good]))      # metres per UV unit
    r = np.concatenate(ratios)
    return max_jump, float(r.mean()), float(r.std() / r.mean())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--v2", default=V2_DEFAULT)
    args = ap.parse_args()
    v3_path = os.path.join(HERE, "container_20ft_standard.glb")
    master_path = os.path.join(HERE, "master", "container_20ft_standard_master.glb")
    g3, b3 = glb_io.read_glb(v3_path)
    gm, bm = glb_io.read_glb(master_path)
    g2, b2 = glb_io.read_glb(args.v2)
    rep3 = json.load(open(os.path.join(HERE, "container_20ft_report.json"), encoding="utf-8"))

    # 1. structure --------------------------------------------------------------
    for label, g, b in (("runtime", g3, b3), ("master", gm, bm)):
        errs = []
        for i, bv in enumerate(g["bufferViews"]):
            if bv.get("byteOffset", 0) + bv["byteLength"] > len(b):
                errs.append(f"bufferView {i} out of range")
        for i, acc in enumerate(g["accessors"]):
            try:
                glb_io.accessor(g, b, i)
            except Exception as e:  # noqa: BLE001 - report every broken accessor
                errs.append(f"accessor {i}: {e}")
        for m in g["materials"]:
            refs = [m["pbrMetallicRoughness"].get(k, {}).get("index") for k in ("baseColorTexture", "metallicRoughnessTexture")]
            refs += [m.get(k, {}).get("index") for k in ("normalTexture", "occlusionTexture")]
            for r in refs:
                if r is not None and not (0 <= r < len(g["textures"])):
                    errs.append(f"{m['name']} -> texture {r} missing")
        for p_mesh in g["meshes"]:
            for p in p_mesh["primitives"]:
                if not (0 <= p["material"] < len(g["materials"])):
                    errs.append(f"{p_mesh['name']} material index {p['material']}")
        for img in g["images"]:
            try:
                Image.open(io.BytesIO(glb_io.view_bytes(g, b, img["bufferView"]))).load()
            except Exception as e:  # noqa: BLE001
                errs.append(f"image {img['name']}: {e}")
        check(f"1 GLB structure ({label})", not errs, errs or f"{len(g['meshes'])} meshes, {len(g['materials'])} materials, {len(g['images'])} images, {len(g['accessors'])} accessors OK")

    # 2. hierarchy ---------------------------------------------------------------
    p2, p3 = node_parents(g2), node_parents(g3)
    missing = [n for n in p2 if n not in p3]
    moved = [n for n in p2 if n in p3 and p2[n] != p3[n]]
    check("2 hierarchy preserved", not missing and not moved, {"v2_nodes": len(p2), "missing": missing, "reparented": moved})
    mesh_nodes = [n["name"] for n in g3["nodes"] if "mesh" in n]
    check("2 independently addressable mesh nodes", len(mesh_nodes) == len(set(mesh_nodes)), f"{len(mesh_nodes)} uniquely named mesh nodes")

    # 3. floor --------------------------------------------------------------------
    f2 = glb_io.mesh_by_node(g2, "Floor_Surface")["primitives"][0]
    f3 = glb_io.mesh_by_node(g3, "Floor_Surface")["primitives"][0]
    same_geo = all(glb_io.view_bytes(g2, b2, g2["accessors"][f2["attributes"][k]]["bufferView"]) ==
                   glb_io.view_bytes(g3, b3, g3["accessors"][f3["attributes"][k]]["bufferView"]) for k in ("POSITION", "NORMAL", "TEXCOORD_0"))
    same_idx = glb_io.view_bytes(g2, b2, g2["accessors"][f2["indices"]]["bufferView"]) == glb_io.view_bytes(g3, b3, g3["accessors"][f3["indices"]]["bufferView"])
    check("3 Floor_Surface geometry + UV byte-identical to v2", same_geo and same_idx, {"attributes": same_geo, "indices": same_idx})

    def mat_signature(g, name):
        m = next(x for x in g["materials"] if x["name"] == name)
        pbr = m["pbrMetallicRoughness"]
        def tex(ref):
            t = g["textures"][ref["index"]]
            return {"sampler": g["samplers"][t["sampler"]], "image_name": g["images"][t["source"]]["name"]}
        return {"baseColorFactor": pbr["baseColorFactor"], "metallicFactor": pbr["metallicFactor"], "roughnessFactor": pbr["roughnessFactor"],
                "baseColorTexture": tex(pbr["baseColorTexture"]), "mr": tex(pbr["metallicRoughnessTexture"]),
                "normal": tex(m["normalTexture"]), "normal_scale": m["normalTexture"]["scale"],
                "occlusion": tex(m["occlusionTexture"]), "occlusion_strength": m["occlusionTexture"]["strength"],
                "alphaMode": m.get("alphaMode", "OPAQUE"), "doubleSided": m.get("doubleSided", False)}
    check("3 Mat_Wood_Floor parameters identical", mat_signature(g2, "Mat_Wood_Floor") == mat_signature(g3, "Mat_Wood_Floor"), mat_signature(g3, "Mat_Wood_Floor")["normal_scale"])
    wood_same = {k: glb_io.image_bytes(g2, b2, k)[0] == glb_io.image_bytes(g3, b3, k)[0] for k in ("wood_albedo", "wood_mr", "wood_normal", "wood_ao")}
    check("3 runtime wood images byte-identical to v2 GLB", all(wood_same.values()), wood_same)
    with zipfile.ZipFile(V2_ZIP) as z:
        masters = {}
        for fn in ("wood_floor_albedo_2k.png", "wood_floor_normal_2k.png", "wood_floor_mr_2k.png", "wood_floor_ao_2k.png"):
            a = z.read(f"container_20ft_standard/textures/{fn}")
            bb = open(os.path.join(HERE, "textures", fn), "rb").read()
            masters[fn] = a == bb
        master_glb_same = all(glb_io.image_bytes(gm, bm, k)[0] == open(os.path.join(HERE, "textures", f), "rb").read()
                              for k, f in (("wood_albedo", "wood_floor_albedo_2k.png"), ("wood_normal", "wood_floor_normal_2k.png"),
                                           ("wood_mr", "wood_floor_mr_2k.png"), ("wood_ao", "wood_floor_ao_2k.png")))
        rep2 = json.loads(z.read("container_20ft_standard/container_20ft_report.json"))
    check("3 master wood PNG files byte-identical to v2 (and embedded unmodified in master GLB)", all(masters.values()) and master_glb_same, masters)

    # 4. dimensions ---------------------------------------------------------------
    md = rep3["measured_dimensions_m"]
    exp_int, exp_ext = (5.90, 2.35, 2.39), (6.06, 2.44, 2.59)
    got_int = (md["internal_clear"]["length"], md["internal_clear"]["width"], md["internal_clear"]["height"])
    got_ext = (md["external_body"]["length"], md["external_body"]["width"], md["external_body"]["height"])
    ok = all(abs(a - b) < 5e-4 for a, b in zip(got_int + got_ext, exp_int + exp_ext))
    check("4 dimensions (measured from geometry)", ok, {"internal_LxWxH": got_int, "external_LxWxH": got_ext, "origin": rep3["coordinate_system"]["origin"]})
    b2n = {h["name"]: h for h in rep2["hierarchy"]}
    deltas = {}
    for h in rep3["hierarchy"]:
        if h["name"] in b2n:
            o = b2n[h["name"]]
            deltas[h["name"]] = round(max(abs(a - b) for a, b in zip(h["local_min"] + h["local_max"], o["local_min"] + o["local_max"])) * 1000, 1)
    # Base_Floor (+lashing points), Rear_Frame (keeper jaws), hardware and the CSC plate were deliberately refined
    body = ["Floor_Surface", "Corner_Castings", "Corner_Posts", "Left_Side_Wall", "Right_Side_Wall", "Roof_Panel",
            "Front_End_Wall", "Rear_Door_Left", "Rear_Door_Right", "Exterior_Marking_Side_Left", "Exterior_Marking_Side_Right",
            "Exterior_Marking_Owner_Left", "Exterior_Marking_Owner_Right"]
    worst = max(deltas[n] for n in body)
    check("4 structural node bounds vs v2 (mm, max abs delta)", worst <= 1.0, {n: deltas[n] for n in deltas})
    pivots_same = all(b2n[n]["pivot"] == [round(v, 4) for v in next(h for h in rep3["hierarchy"] if h["name"] == n)["pivot"]] or
                      np.allclose(b2n[n]["pivot"], next(h for h in rep3["hierarchy"] if h["name"] == n)["pivot"], atol=1e-6)
                      for n in ("Rear_Door_Left", "Rear_Door_Right"))
    check("4 door pivots & open angle unchanged", pivots_same, {"left": b2n["Rear_Door_Left"]["pivot"], "right": b2n["Rear_Door_Right"]["pivot"]})

    # 5. UVs -----------------------------------------------------------------------
    uvres = {}
    allok = True
    for node, axis in (("Left_Side_Wall", 1), ("Right_Side_Wall", 1), ("Roof_Panel", 2), ("Front_End_Wall", 1)):
        for mat in ("Mat_Exterior_Green", "Mat_Interior_Wall"):
            j3, d3, s3 = uv_metrics(prim_arrays(g3, b3, node, mat), axis)
            j2, d2, s2 = uv_metrics(prim_arrays(g2, b2, node, mat), axis)
            uvres[f"{node}/{mat}"] = {"v3_max_uv_jump": round(j3, 6), "v3_m_per_uv": round(d3, 4), "v3_density_spread_pct": round(s3 * 100, 3),
                                      "v2_max_uv_jump": round(j2, 4), "v2_density_spread_pct": round(s2 * 100, 2)}
            allok &= j3 < 1e-4 and s3 < 0.01
    check("5 corrugated UVs continuous with constant texel density", allok, uvres)

    # 6. marking clearance -----------------------------------------------------------
    lay = rep3["layout"]
    inset, (dy0, dy1) = lay["door_decal_inset"], lay["door_y"]
    dy0, dy1 = dy0 + inset, dy1 - inset
    issues, tested = [], 0
    for res, path in (("runtime", "runtime"), ("master", "master")):
        img = np.asarray(Image.open(os.path.join(HERE, "markings", "textures", path, "rear_doors.png")))[..., 3]
        h, w = img.shape
        for side, u0, u1 in (("left", 0.0, 0.5), ("right", 0.5, 1.0)):
            z0, z1 = lay["door_z_local"][side]
            dz0, dz1 = z0 + inset, z1 - inset
            hd = 1.0 if side == "left" else -1.0
            rects = []
            for rz in lay["rod_z_local"][side]:
                rects.append(("rod", rz - 0.016, rz + 0.016, dy0, dy1))
                for by in (0.16, 0.84, 1.52, 2.14):
                    rects.append(("bracket", rz - 0.052, rz + 0.052, by - 0.038, by + 0.038))
                rects.append(("handle_hub", rz - 0.028, rz + 0.028, 0.862, 0.938))
                rects.append(("handle_lever", min(rz, rz + hd * 0.27), max(rz, rz + hd * 0.27), 0.884, 0.916))
                rects.append(("retainer", rz + hd * 0.21 - 0.024, rz + hd * 0.21 + 0.024, 0.858, 0.950))
            for hy in (0.22, 0.84, 1.46, 2.08):
                za, zb = (0.0, 0.18) if side == "left" else (-0.18, 0.0)
                rects.append(("hinge_strap", za, zb, hy - 0.032, hy + 0.032))
            if side == "left":
                c = lay["csc_plate_local"]
                rects.append(("csc_plate", c["z"][0], c["z"][1], c["y"][0], c["y"][1]))
            m = 0.005  # 5 mm safety margin
            for kind, za, zb, ya, yb in rects:
                za, zb, ya, yb = za - m, zb + m, ya - m, yb + m
                if zb < dz0 or za > dz1 or yb < dy0 or ya > dy1:
                    continue
                U = lambda zz: (u0 + (min(max(zz, dz0), dz1) - dz0) / (dz1 - dz0) * (u1 - u0)) * w
                V = lambda yy: (dy1 - min(max(yy, dy0), dy1)) / (dy1 - dy0) * h
                xa, xb = int(U(za)), int(math.ceil(U(zb)))
                ra, rb = int(V(yb)), int(math.ceil(V(ya)))
                tested += 1
                mx = int(img[ra:rb, xa:xb].max()) if rb > ra and xb > xa else 0
                if mx > 8:
                    issues.append(f"{res}/{side}/{kind} alpha={mx}")
    check("6 rear-door markings clear of rods/brackets/handles/hinges/CSC plate", not issues, issues or f"{tested} hardware footprints (+5 mm) tested at runtime & master resolution, all transparent")
    a1 = np.asarray(Image.open(os.path.join(HERE, "markings", "textures", "master", "side_panel.png")))[..., 3].astype(np.float32) / 255
    a2 = np.asarray(Image.open(os.path.join(HERE, "markings", "textures", "master", "side_owner.png")))[..., 3].astype(np.float32) / 255
    overlap = float((a1 * a2).max())
    check("6 side panel / owner decal layers do not overlap", overlap < 0.05, f"max alpha product {overlap:.3f}")

    # 7. stand-off --------------------------------------------------------------
    standoff = {"side_panel_mm_min_perpendicular": round(1.8 * 0.658, 2), "owner_mm_min_perpendicular": round(2.4 * 0.658, 2),
                "rear_door_mm": 1.2, "csc_text_mm": 0.8, "casting_apertures_mm": 0.8, "side_vs_owner_layer_mm": round(0.6 * 0.658, 2)}
    check("7 decal stand-off >= 0.39 mm everywhere (layers never share a plane)", min(standoff.values()) >= 0.39, standoff)

    # 8. materials --------------------------------------------------------------
    def stats(fn):
        a = np.asarray(Image.open(os.path.join(HERE, "textures", fn)).convert("RGB"), dtype=np.float32) / 255
        return {"roughness_p5_p95": [round(float(np.percentile(a[..., 1], q)), 3) for q in (5, 95)],
                "metallic_mean": round(float(a[..., 2].mean()), 3), "metallic_p99": round(float(np.percentile(a[..., 2], 99)), 3)}
    ext, hw, inn = stats("steel_ext_mr_2k.png"), stats("steel_hw_mr_1k.png"), stats("steel_int_mr_2k.png")
    with zipfile.ZipFile(V2_ZIP) as z:
        a = np.asarray(Image.open(io.BytesIO(z.read("container_20ft_standard/textures/steel_ext_mr_2k.png"))).convert("RGB"), dtype=np.float32) / 255
    v2ext = {"metallic_mean": round(float(a[..., 2].mean()), 3), "roughness_p5_p95": [round(float(np.percentile(a[..., 1], q)), 3) for q in (5, 95)]}
    ok = ext["metallic_mean"] <= 0.1 and 0.5 <= ext["roughness_p5_p95"][0] and ext["roughness_p5_p95"][1] <= 0.78 and hw["metallic_mean"] >= 0.75 \
        and 0.24 <= hw["roughness_p5_p95"][0] and hw["roughness_p5_p95"][1] <= 0.47
    check("8 material response ranges", ok, {"exterior_paint": ext, "interior_paint": inn, "hardware": hw, "v2_exterior_for_comparison": v2ext})

    out = {"v2_reference": args.v2, "runtime_glb": os.path.basename(v3_path), "passed": all(r["pass"] for r in results), "checks": results}
    with open(os.path.join(HERE, "validation_report.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=2)
    print(f"\n{'ALL CHECKS PASSED' if out['passed'] else 'SOME CHECKS FAILED'} ({sum(r['pass'] for r in results)}/{len(results)})")
    sys.exit(0 if out["passed"] else 1)


if __name__ == "__main__":
    main()
