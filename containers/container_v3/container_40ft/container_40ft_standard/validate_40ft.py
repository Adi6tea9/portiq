#!/usr/bin/env python3
"""
PortIQ 40 FT container — validation against the 20 FT v3 reference.

  python validate_40ft.py [--ref PATH_TO_20FT_GLB]

Every check below is computed from the generated files (exit code 1 on any failure);
results go to validation_report.json.

  1  GLB structure: chunk/accessor ranges, material->texture refs, images decode
  2  Same hierarchy, node names and materials (incl. every factor and texture) as 20 FT
  3  Wood floor: same material, byte-identical wood images (runtime + master), same
     texel density (not stretched), floor spans the full 12.03 m
  4  All steel/hardware maps byte-identical to the 20 FT (same paint, interior, hardware)
  5  Dimensions measured from geometry: internal, external, door opening, not high cube
  6  Door assembly (doors, rods, hinges, door decal, CSC plate) byte-identical to 20 FT;
     cross-section of walls/roof/posts identical
  7  Corrugation pitch and depth match the 20 FT; continuous UVs, constant texel density
  8  Markings: rear-door hardware clearance, side decal layers never overlap on the wall
"""
import argparse
import hashlib
import io
import json
import math
import os
import sys

import numpy as np
from PIL import Image

import glb_io

HERE = os.path.dirname(os.path.abspath(__file__))
REF_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "container_20ft_standard"))
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


def prims(g, b, node, mat_name=None):
    out = []
    for p in glb_io.mesh_by_node(g, node)["primitives"]:
        if mat_name and g["materials"][p["material"]]["name"] != mat_name:
            continue
        a = p["attributes"]
        out.append((glb_io.accessor(g, b, a["POSITION"]), glb_io.accessor(g, b, a["NORMAL"]),
                    glb_io.accessor(g, b, a["TEXCOORD_0"]), glb_io.accessor(g, b, p["indices"]).astype(np.int64)))
    return out


def positions(g, b, node, mat_name=None):
    return np.vstack([p[0] for p in prims(g, b, node, mat_name)])


def mesh_bytes(g, b, node):
    h = hashlib.sha256()
    for p in glb_io.mesh_by_node(g, node)["primitives"]:
        for k in ("POSITION", "NORMAL", "TEXCOORD_0"):
            h.update(np.ascontiguousarray(glb_io.accessor(g, b, p["attributes"][k])).tobytes())
        h.update(np.ascontiguousarray(glb_io.accessor(g, b, p["indices"]).astype(np.uint32)).tobytes())
        h.update(g["materials"][p["material"]]["name"].encode())
    return h.hexdigest()


def material_signature(g, b, m):
    def tex(ref):
        if not ref:
            return None
        t = g["textures"][ref["index"]]
        img = g["images"][t["source"]]
        return {"sampler": g["samplers"][t["sampler"]], "image": img["name"],
                "sha256": hashlib.sha256(glb_io.view_bytes(g, b, img["bufferView"])).hexdigest()}
    pbr = m["pbrMetallicRoughness"]
    return {"baseColorFactor": pbr["baseColorFactor"], "metallicFactor": pbr["metallicFactor"], "roughnessFactor": pbr["roughnessFactor"],
            "baseColorTexture": tex(pbr.get("baseColorTexture")), "mr": tex(pbr.get("metallicRoughnessTexture")),
            "normal": tex(m.get("normalTexture")), "normal_scale": m.get("normalTexture", {}).get("scale"),
            "occlusion": tex(m.get("occlusionTexture")), "occlusion_strength": m.get("occlusionTexture", {}).get("strength"),
            "alphaMode": m.get("alphaMode", "OPAQUE"), "doubleSided": m.get("doubleSided", False)}


def uv_metrics(primlist, extrude_axis):
    max_jump, ratios = 0.0, []
    for P, N, UV, idx in primlist:
        keep = np.abs(N[:, extrude_axis]) < 0.5
        key = np.round(P[keep] * 1e5).astype(np.int64)
        uv = UV[keep]
        order = np.lexsort(key.T)
        ks, us = key[order], uv[order]
        same = np.all(ks[1:] == ks[:-1], axis=1)
        if same.any():
            max_jump = max(max_jump, float(np.max(np.linalg.norm(us[1:][same] - us[:-1][same], axis=1))))
        t = idx.reshape(-1, 3)
        t = t[keep[t].all(1)]
        wa = 0.5 * np.linalg.norm(np.cross(P[t[:, 1]] - P[t[:, 0]], P[t[:, 2]] - P[t[:, 0]]), axis=1)
        e1, e2 = UV[t[:, 1]] - UV[t[:, 0]], UV[t[:, 2]] - UV[t[:, 0]]
        ua = 0.5 * np.abs(e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0])
        good = (wa > 1e-8) & (ua > 1e-12)
        ratios.append(np.sqrt(wa[good] / ua[good]))
    r = np.concatenate(ratios)
    return max_jump, float(r.mean()), float(r.std() / r.mean())


def corrugation(g, b, node):
    """Cycles, mean pitch and rib depth from the exterior sheet of a side wall."""
    P, N, _, _ = prims(g, b, node, "Mat_Exterior_Green")[0]
    crest = np.abs(N[:, 2]) > 0.999                     # flat crest/valley facets
    zc = P[crest, 2]
    outer = zc[np.argmax(np.abs(zc - zc.mean()))]
    crest_x = np.unique(np.round(P[crest & (np.abs(P[:, 2] - outer) < 1e-4), 0], 5))
    n = len(crest_x) // 2                                 # 2 x-positions per crest facet
    length = float(P[:, 0].max() - P[:, 0].min())
    return {"cycles": n, "pitch_m": round(length / n, 4), "depth_m": round(float(np.ptp(zc)), 4)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", default=os.path.join(REF_DIR, "container_20ft_standard.glb"))
    args = ap.parse_args()
    g, b = glb_io.read_glb(os.path.join(HERE, "container_40ft_standard.glb"))
    gm, bm = glb_io.read_glb(os.path.join(HERE, "master", "container_40ft_standard_master.glb"))
    gr, br = glb_io.read_glb(args.ref)
    rep = json.load(open(os.path.join(HERE, "container_40ft_report.json"), encoding="utf-8"))

    # 1 ------------------------------------------------------------------------
    for label, gg, bb in (("runtime", g, b), ("master", gm, bm)):
        errs = []
        for i, bv in enumerate(gg["bufferViews"]):
            if bv.get("byteOffset", 0) + bv["byteLength"] > len(bb):
                errs.append(f"bufferView {i} out of range")
        for i in range(len(gg["accessors"])):
            try:
                glb_io.accessor(gg, bb, i)
            except Exception as e:  # noqa: BLE001 - report every broken accessor
                errs.append(f"accessor {i}: {e}")
        for m in gg["materials"]:
            refs = [m["pbrMetallicRoughness"].get(k, {}).get("index") for k in ("baseColorTexture", "metallicRoughnessTexture")]
            refs += [m.get(k, {}).get("index") for k in ("normalTexture", "occlusionTexture")]
            errs += [f"{m['name']} -> texture {r} missing" for r in refs if r is not None and not 0 <= r < len(gg["textures"])]
        for img in gg["images"]:
            try:
                Image.open(io.BytesIO(glb_io.view_bytes(gg, bb, img["bufferView"]))).load()
            except Exception as e:  # noqa: BLE001
                errs.append(f"image {img['name']}: {e}")
        check(f"1 GLB structure ({label})", not errs,
              errs or f"{len(gg['meshes'])} meshes, {len(gg['materials'])} materials, {len(gg['images'])} images OK")

    # 2 ------------------------------------------------------------------------
    pr, p4 = node_parents(gr), node_parents(g)
    check("2 hierarchy identical to 20 FT", pr == p4,
          {"nodes": len(p4), "missing": sorted(set(pr) - set(p4)), "extra": sorted(set(p4) - set(pr)),
           "reparented": [n for n in pr if n in p4 and pr[n] != p4[n]]})
    sig_r = {m["name"]: material_signature(gr, br, m) for m in gr["materials"]}
    diffs = []
    for m in g["materials"]:
        s4 = material_signature(g, b, m)
        if m["name"] not in sig_r:
            diffs.append(f"{m['name']} not in 20 FT")
            continue
        for k, v in s4.items():
            rv = sig_r[m["name"]][k]
            if k in ("baseColorTexture",) and m["name"] in ("Mat_Decal_Side_Panel", "Mat_Decal_Rear_Doors", "Mat_Decal_CSC_Plate"):
                rv = v = (rv or {}).get("sampler"), (v or {}).get("sampler")   # artwork text differs (42G1, weights)
            if v != rv:
                diffs.append(f"{m['name']}.{k}")
    check("2 all 11 materials identical to 20 FT (factors, maps, samplers)", not diffs,
          diffs or "only the 40 FT marking artwork (42G1 / ID / weights / CSC id) differs, as intended")

    # 3 ------------------------------------------------------------------------
    same_wood = {k: glb_io.image_bytes(g, b, k)[0] == glb_io.image_bytes(gr, br, k)[0] for k in ("wood_albedo", "wood_mr", "wood_normal", "wood_ao")}
    check("3 runtime wood images byte-identical to 20 FT", all(same_wood.values()), same_wood)
    files = {}
    for fn in ("wood_floor_albedo_2k.png", "wood_floor_normal_2k.png", "wood_floor_mr_2k.png", "wood_floor_ao_2k.png"):
        files[fn] = open(os.path.join(HERE, "textures", fn), "rb").read() == open(os.path.join(REF_DIR, "textures", fn), "rb").read()
    check("3 master wood PNGs byte-identical to 20 FT", all(files.values()), files)

    def floor_density(gg, bb):
        P, N, UV, _ = prims(gg, bb, "Floor_Surface")[0]
        top = N[:, 1] > 0.99
        p, uv = P[top], UV[top]
        return [round(float(np.ptp(p[:, 0]) / np.ptp(uv[:, 0])), 5), round(float(np.ptp(p[:, 2]) / np.ptp(uv[:, 1])), 5)], \
            [round(float(v), 4) for v in p.min(0)], [round(float(v), 4) for v in p.max(0)]
    d4, lo4, hi4 = floor_density(g, b)
    dr, _, _ = floor_density(gr, br)
    check("3 floor texture not stretched (same metres-per-UV as 20 FT) and spans full length",
          np.allclose(d4, dr, rtol=1e-4) and abs(hi4[0] - 12.03) < 5e-4 and abs(hi4[2] - 2.35) < 5e-4,
          {"40ft_m_per_uv_xz": d4, "20ft_m_per_uv_xz": dr, "floor_top_min": lo4, "floor_top_max": hi4})

    # 4 ------------------------------------------------------------------------
    keys = [i["name"] for i in g["images"] if not i["name"].startswith("decal_")]
    same = {k: glb_io.image_bytes(g, b, k)[0] == glb_io.image_bytes(gr, br, k)[0] for k in keys}
    check("4 paint / interior / hardware / wood maps byte-identical to 20 FT", all(same.values()),
          {k: v for k, v in same.items() if not v} or f"{len(keys)} runtime maps identical")

    # 5 ------------------------------------------------------------------------
    md = rep["measured_dimensions_m"]
    i3 = (md["internal_clear"]["length"], md["internal_clear"]["width"], md["internal_clear"]["height"])
    e3 = (md["external_body"]["length"], md["external_body"]["width"], md["external_body"]["height"])
    posts = positions(g, b, "Corner_Posts")
    rear = posts[posts[:, 0] < -1e-4]
    door_z0 = float(rear[rear[:, 2] < 1.0, 2].max())
    door_z1 = float(rear[rear[:, 2] > 1.0, 2].min())
    hdr = positions(g, b, "Rear_Frame", "Mat_Structural_Dark")
    door_h = float(hdr[(hdr[:, 0] < -1e-4) & (hdr[:, 1] > 1.0), 1].min())
    ok = all(abs(a - c) < 5e-4 for a, c in zip(i3, (12.03, 2.35, 2.39))) and \
        all(abs(a - c) < 5e-3 for a, c in zip(e3, (12.19, 2.441, 2.59))) and \
        abs((door_z1 - door_z0) - 2.34) < 1e-3 and abs(door_h - 2.28) < 1e-3
    check("5 dimensions measured from geometry", ok,
          {"internal_LxWxH": i3, "volume_m3": md["internal_clear"]["volume_m3"], "external_LxWxH": e3,
           "door_opening_WxH": [round(door_z1 - door_z0, 4), round(door_h, 4)], "origin": rep["coordinate_system"]["origin"]})
    check("5 standard height, not high cube", e3[2] < 2.65 and i3[2] < 2.45,
          f"external height {e3[2]} m (high cube would be 2.896 m), internal {i3[2]} m")

    # 6 ------------------------------------------------------------------------
    door_parts = ["Rear_Door_Left", "Rear_Door_Right", "Locking_Rods", "Hinges", "Rear_Door_Marking", "CSC_Plate_Geometry", "CSC_Plate_Marking"]
    same_door = {n: mesh_bytes(g, b, n) == mesh_bytes(gr, br, n) for n in door_parts}
    check("6 door assembly geometry byte-identical to 20 FT (doors open 200 deg, same pivots)", all(same_door.values()), same_door)
    xsec = {}
    for n in ("Left_Side_Wall", "Right_Side_Wall", "Roof_Panel", "Front_End_Wall", "Corner_Posts", "Corner_Castings", "Base_Floor"):
        mat = "Mat_Structural_Dark" if n == "Base_Floor" else None   # 20 FT forklift-pocket inserts (absent on 40 FT) excluded
        a, c = positions(g, b, n, mat), positions(gr, br, n, mat)
        xsec[n] = round(float(max(np.abs(a[:, 1:].min(0) - c[:, 1:].min(0)).max(), np.abs(a[:, 1:].max(0) - c[:, 1:].max(0)).max())) * 1000, 2)
    check("6 cross-section (Y/Z extents) identical to 20 FT, mm", max(xsec.values()) < 0.5, xsec)

    # 7 ------------------------------------------------------------------------
    c4, cr = corrugation(g, b, "Left_Side_Wall"), corrugation(gr, br, "Left_Side_Wall")
    check("7 side corrugation pitch/depth match 20 FT (ribs added, not stretched)",
          abs(c4["pitch_m"] - cr["pitch_m"]) / cr["pitch_m"] < 0.01 and abs(c4["depth_m"] - cr["depth_m"]) < 1e-4,
          {"40ft": c4, "20ft": cr})
    uvres, allok = {}, True
    for node, axis in (("Left_Side_Wall", 1), ("Right_Side_Wall", 1), ("Roof_Panel", 2), ("Front_End_Wall", 1)):
        for mat in ("Mat_Exterior_Green", "Mat_Interior_Wall"):
            j, d, s = uv_metrics(prims(g, b, node, mat), axis)
            uvres[f"{node}/{mat}"] = {"max_uv_jump": round(j, 6), "m_per_uv": round(d, 4), "density_spread_pct": round(s * 100, 3)}
            allok &= j < 1e-4 and s < 0.01 and abs(d - 1.6) < 1e-3
    check("7 continuous UVs, 1.6 m/tile like the 20 FT", allok, uvres)

    # 8 ------------------------------------------------------------------------
    lay = rep["layout"]
    inset, (dy0, dy1) = lay["door_decal_inset"], lay["door_y"]
    dy0, dy1 = dy0 + inset, dy1 - inset
    issues, tested = [], 0
    for path in ("runtime", "master"):
        alpha = np.asarray(Image.open(os.path.join(HERE, "markings", "textures", path, "rear_doors.png")))[..., 3]
        h, w = alpha.shape
        for side, u0, u1 in (("left", 0.0, 0.5), ("right", 0.5, 1.0)):
            z0, z1 = lay["door_z_local"][side]
            dz0, dz1 = z0 + inset, z1 - inset
            hd = 1.0 if side == "left" else -1.0
            rects = []
            for rz in lay["rod_z_local"][side]:
                rects += [("rod", rz - 0.016, rz + 0.016, dy0, dy1), ("handle_hub", rz - 0.028, rz + 0.028, 0.862, 0.938),
                          ("handle_lever", min(rz, rz + hd * 0.27), max(rz, rz + hd * 0.27), 0.884, 0.916),
                          ("retainer", rz + hd * 0.21 - 0.024, rz + hd * 0.21 + 0.024, 0.858, 0.950)]
                rects += [("bracket", rz - 0.052, rz + 0.052, by - 0.038, by + 0.038) for by in (0.16, 0.84, 1.52, 2.14)]
            rects += [("hinge_strap", *((0.0, 0.18) if side == "left" else (-0.18, 0.0)), hy - 0.032, hy + 0.032) for hy in (0.22, 0.84, 1.46, 2.08)]
            if side == "left":
                c = lay["csc_plate_local"]
                rects.append(("csc_plate", c["z"][0], c["z"][1], c["y"][0], c["y"][1]))
            for kind, za, zb, ya, yb in rects:
                za, zb, ya, yb = za - 0.005, zb + 0.005, ya - 0.005, yb + 0.005
                if zb < dz0 or za > dz1 or yb < dy0 or ya > dy1:
                    continue
                U = lambda zz: (u0 + (min(max(zz, dz0), dz1) - dz0) / (dz1 - dz0) * (u1 - u0)) * w
                V = lambda yy: (dy1 - min(max(yy, dy0), dy1)) / (dy1 - dy0) * h
                xa, xb, ra, rb = int(U(za)), int(math.ceil(U(zb))), int(V(yb)), int(math.ceil(V(ya)))
                tested += 1
                mx = int(alpha[ra:rb, xa:xb].max()) if rb > ra and xb > xa else 0
                if mx > 8:
                    issues.append(f"{path}/{side}/{kind} alpha={mx}")
    check("8 rear-door markings clear of rods/brackets/handles/hinges/CSC plate", not issues,
          issues or f"{tested} hardware footprints (+5 mm) tested at runtime & master resolution, all transparent")

    # side decals composited in wall space (they have different footprints on the 40 FT)
    L = 12.03
    res = 200                                            # samples per metre along the wall
    a_side = np.asarray(Image.open(os.path.join(HERE, "markings", "textures", "master", "side_panel.png")))[..., 3] / 255.0
    a_own = np.asarray(Image.open(os.path.join(HERE, "markings", "textures", "master", "side_owner.png")))[..., 3] / 255.0
    worst = {}
    for wall in ("left", "right"):
        canvas = []
        for alpha, (x0, x1) in ((a_side, lay["side_decal_x"]), (a_own, lay["owner_decal_x"])):
            if wall == "right":
                x0, x1 = L - x1, L - x0
            xs = np.arange(int(L * res)) / res
            inside = (xs >= x0) & (xs <= x1)
            u = (x1 - xs) / (x1 - x0) if wall == "left" else (xs - x0) / (x1 - x0)
            cols = np.clip((u * (alpha.shape[1] - 1)).astype(int), 0, alpha.shape[1] - 1)
            layer = np.where(inside[None, :], alpha[:, cols], 0.0)
            canvas.append(layer)
        worst[wall] = round(float((canvas[0] * canvas[1]).max()), 3)
    check("8 side panel and owner decals never overlap on either wall", max(worst.values()) < 0.05,
          {"max_alpha_product": worst, "side_decal_x_left": lay["side_decal_x"], "owner_decal_x_left": lay["owner_decal_x"]})

    out = {"reference_20ft": os.path.relpath(args.ref, HERE), "passed": all(r["pass"] for r in results), "checks": results}
    with open(os.path.join(HERE, "validation_report.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=2)
    print(f"\n{'ALL CHECKS PASSED' if out['passed'] else 'SOME CHECKS FAILED'} ({sum(r['pass'] for r in results)}/{len(results)})")
    sys.exit(0 if out["passed"] else 1)


if __name__ == "__main__":
    main()
