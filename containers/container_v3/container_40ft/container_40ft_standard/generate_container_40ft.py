#!/usr/bin/env python3
"""
PortIQ — 40 FT Standard Dry Container Generator (ISO 42G1)
==========================================================
Built from the 20 FT v3 components: identical cross-section (2.35 x 2.39 m internal),
coordinate system, node names & hierarchy, door assembly, hardware, materials, PBR maps,
wooden floor maps and marking artwork. Only the length and length-dependent details
differ:

  * internal length 12.030 m -> external 12.190 m (ISO 40 ft standard height, NOT high cube), same 80 mm end frames
  * no forklift pockets (not fitted on 40 ft boxes), 16 lashing points per rail
  * cross-members, corrugations and floor UVs repeat at the same pitch / texel density
  * side & owner decals keep the 20 ft decal size (5.46 x 2.10 m) and texture density;
    ID + slogan at the door end, owner logo centred on the wall

Inherited 20 FT v3 features:

  * Continuous, stretch-free UVs: corrugated walls/roof use arc-length UVs along the
    profile (one shared texel density, no per-facet 0..1 patches); every other surface
    uses world-planar UVs at the same density.
  * Watertight rounded-bevel boxes with smooth edge normals (v2 chamfers left 8 corner
    holes per box) on castings, posts, rails, door frames, ribs and hardware.
  * 28-segment capped, edge-bevelled cylinders for rods, hinge pins and handles
    (v2: 12 segments, caps silently dropped as degenerate quads).
  * Painted steel is now dielectric (metallic ~0.02, roughness 0.58-0.72); hardware is
    galvanised metal (metallic ~0.92, roughness 0.28-0.45) with its own maps.
  * Rear-door decal conforms to the pressed door ribs (v2 floated 4.5-8.5 mm off).
  * CSC plate sits on the door skin between two ribs instead of bridging one.
  * Lashing points on the bottom and top side rails (interior connection points).

Floor_Surface uses the same legacy box/UV code as the 20 ft (same wood texel density) and
the GLB embeds the same wood images byte-for-byte; validate_40ft.py proves it.
The painted-steel, interior (#626C67) and hardware maps are the 20 ft v3 files, unchanged.

Outputs:
  container_40ft_standard.glb          web runtime (2K/1K JPEG maps, runtime decals)
  master/container_40ft_standard_master.glb   master (lossless PNG 2K maps, 4K decals)
  container_40ft_report.json           dimensions, hierarchy, per-node stats

Usage:
  python generate_markings.py && python generate_container_40ft.py   (PBR maps are the 20 ft v3 files, copied unchanged)
"""
import hashlib
import io
import json
import math
import os
import struct

import numpy as np
from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PBR_DIR = os.path.join(SCRIPT_DIR, "textures")
PBR_RUNTIME_DIR = os.path.join(PBR_DIR, "runtime")
MARK_DIR = os.path.join(SCRIPT_DIR, "markings", "textures")

SPEC_40FT = {
    "name": "container_40ft_standard",
    "int_length": 12.030, "int_width": 2.350, "int_height": 2.390,
    "rear_frame_depth": 0.080, "front_wall_depth": 0.080, "side_wall_thick": 0.045,
    "floor_assembly_depth": 0.145, "wood_floor_thick": 0.028, "roof_assembly_thick": 0.055,
    "door_open_width": 2.340, "door_open_height": 2.280, "door_open_angle_deg": 200.0,
    "side_corr_pitch": 0.278, "roof_corr_pitch": 0.210, "front_corr_pitch": 0.230,
    "casting_x": 0.178, "casting_y": 0.118, "casting_z": 0.162,
    "forklift_pockets": False, "lashing_per_rail": 16,
    # decal footprints along X (same 5.46 m width as the 20 ft so artwork & texel density match)
    "side_decal_x": (0.22, 5.68), "owner_decal_x": (2.05, 7.51),
}

TILE_PAINT = 1.6     # metres per texture tile, painted steel (2048 px -> 1280 px/m)
TILE_HW = 0.25       # metres per tile, hardware (1024 px -> 4096 px/m)
CYL_SEGS = 28        # close-up hardware smoothness


def hex_to_linear_rgba(hex_str, alpha=1.0):
    h = hex_str.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [alpha]


# name, factors, textures, normal scale / occlusion strength, uv tile
MATERIALS = [
    {"name": "Mat_Exterior_Green", "baseColorFactor": [1, 1, 1, 1], "metallicFactor": 1.0, "roughnessFactor": 1.0,
     "tex": {"albedo": "ext_albedo", "orm": "ext_orm", "normal": "ext_normal"}, "normal_scale": 1.0, "ao_strength": 1.0, "tile": TILE_PAINT},
    # same paint, darker batch on heavier structural members
    {"name": "Mat_Structural_Dark", "baseColorFactor": [0.60, 0.66, 0.66, 1], "metallicFactor": 1.0, "roughnessFactor": 1.0,
     "tex": {"albedo": "ext_albedo", "orm": "ext_orm", "normal": "ext_normal"}, "normal_scale": 1.0, "ao_strength": 1.0, "tile": TILE_PAINT},
    {"name": "Mat_Interior_Wall", "baseColorFactor": [1, 1, 1, 1], "metallicFactor": 1.0, "roughnessFactor": 1.0,
     "tex": {"albedo": "int_albedo", "orm": "int_orm", "normal": "int_normal"}, "normal_scale": 1.0, "ao_strength": 1.0, "tile": TILE_PAINT},
    # UNCHANGED from v2 (factors, textures, scale 0.65, strength 0.85)
    {"name": "Mat_Wood_Floor", "baseColorFactor": [1.0, 1.0, 1.0, 1.0], "metallicFactor": 1.0, "roughnessFactor": 1.0,
     "tex": {"albedo": "wood_albedo", "mr": "wood_mr", "normal": "wood_normal", "ao": "wood_ao"}, "normal_scale": 0.65, "ao_strength": 0.85, "tile": None},
    {"name": "Mat_Hardware_Steel", "baseColorFactor": [1, 1, 1, 1], "metallicFactor": 1.0, "roughnessFactor": 1.0,
     "tex": {"albedo": "hw_albedo", "orm": "hw_orm", "normal": "hw_normal"}, "normal_scale": 1.0, "ao_strength": 1.0, "tile": TILE_HW},
    {"name": "Mat_Rubber_Gasket", "baseColorFactor": hex_to_linear_rgba("#1A1F1D"), "metallicFactor": 0.0, "roughnessFactor": 0.88,
     "tex": {"normal": "ext_normal"}, "normal_scale": 0.4, "tile": TILE_PAINT},
    {"name": "Mat_CSC_Steel", "baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0.9, "roughnessFactor": 0.85,
     "tex": {"albedo": "hw_albedo", "orm": "hw_orm", "normal": "hw_normal"}, "normal_scale": 0.5, "ao_strength": 1.0, "tile": TILE_HW},
    {"name": "Mat_Decal_Side_Panel", "baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0.0, "roughnessFactor": 0.62,
     "tex": {"albedo": "decal_side_panel"}, "alphaMode": "BLEND"},
    {"name": "Mat_Decal_Side_Owner", "baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0.0, "roughnessFactor": 0.62,
     "tex": {"albedo": "decal_side_owner"}, "alphaMode": "BLEND"},
    {"name": "Mat_Decal_Rear_Doors", "baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0.0, "roughnessFactor": 0.62,
     "tex": {"albedo": "decal_rear_doors"}, "alphaMode": "BLEND"},
    {"name": "Mat_Decal_CSC_Plate", "baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0.55, "roughnessFactor": 0.40,
     "tex": {"albedo": "decal_csc_plate"}, "alphaMode": "OPAQUE"},
]
MAT_IDX = {m["name"]: i for i, m in enumerate(MATERIALS)}


def mat_tile(mat_name):
    return MATERIALS[MAT_IDX[mat_name]].get("tile") or TILE_PAINT


def rot_y(theta, pivot):
    """v2-compatible rotation about +Y through `pivot` (matches node quaternion convention)."""
    c, s = math.cos(theta), math.sin(theta)
    piv = np.asarray(pivot, np.float64)

    def xf(p, n):
        p = np.atleast_2d(p).astype(np.float64)
        n = np.atleast_2d(n).astype(np.float64)
        pr = np.stack([piv[0] + p[:, 0] * c + p[:, 2] * s, piv[1] + p[:, 1], piv[2] - p[:, 0] * s + p[:, 2] * c], -1)
        nr = np.stack([n[:, 0] * c + n[:, 2] * s, n[:, 1], -n[:, 0] * s + n[:, 2] * c], -1)
        return pr, nr
    return xf


def planar_uv(p, n, tile):
    """World/local planar UV on the dominant normal axis, right-handed per face side."""
    p = np.atleast_2d(p)
    n = np.atleast_2d(n)
    ax = np.argmax(np.abs(n), axis=1)
    sg = np.sign(n[np.arange(len(n)), ax])
    sg[sg == 0] = 1
    u = np.where(ax == 0, -sg * p[:, 2], np.where(ax == 1, p[:, 0], sg * p[:, 0]))
    v = np.where(ax == 1, -sg * p[:, 2], p[:, 1])
    return np.stack([u, -v], -1) / tile   # -v: glTF image v runs downward


# =============================================================================
# MESH BUILDER
# =============================================================================
class MeshBuilder:
    def __init__(self, name):
        self.name = name
        self.parts = {}

    def add_mesh(self, mat_name, verts, normals, uvs, indices):
        self.parts.setdefault(MAT_IDX[mat_name], []).append((
            np.asarray(verts, np.float32), np.asarray(normals, np.float32),
            np.asarray(uvs, np.float32), np.asarray(indices, np.uint32)))

    # ---- v2 legacy path: kept verbatim ONLY for Floor_Surface (byte-identical output) ----
    def _legacy_quad(self, mat_name, p0, p1, p2, p3, uv_scale=(0.5, 0.5)):
        p0, p1, p2, p3 = [np.array(p, dtype=np.float32) for p in (p0, p1, p2, p3)]
        e1, e2 = p1 - p0, p3 - p0
        norm = np.cross(e1, e2)
        length = np.linalg.norm(norm)
        if length < 1e-8:
            return
        norm /= length
        # float64 product then float32 store: reproduces v2's NumPy 1.x scalar promotion bit-for-bit
        u_len = float(np.linalg.norm(e1)) * uv_scale[0]
        v_len = float(np.linalg.norm(e2)) * uv_scale[1]
        uvs = np.array([[0, 0], [u_len, 0], [u_len, v_len], [0, v_len]], dtype=np.float32)
        verts = np.array([p0, p1, p2, p3], dtype=np.float32)
        self.add_mesh(mat_name, verts, np.tile(norm, (4, 1)), uvs, np.array([0, 1, 2, 0, 2, 3], dtype=np.uint32))

    def legacy_box(self, mat_name, x0, x1, y0, y1, z0, z1, uv_scale):
        q = self._legacy_quad
        q(mat_name, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], uv_scale)
        q(mat_name, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], uv_scale)
        q(mat_name, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], uv_scale)
        q(mat_name, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], uv_scale)
        q(mat_name, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], uv_scale)
        q(mat_name, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], uv_scale)

    # ---- v3 primitives ----
    def add_quad(self, mat_name, p0, p1, p2, p3, explicit_uvs=None, xform=None):
        P = np.array([p0, p1, p2, p3], np.float64)
        n = np.cross(P[1] - P[0], P[3] - P[0])
        ln = np.linalg.norm(n)
        if ln < 1e-12:
            return
        N = np.tile(n / ln, (4, 1))
        uv = np.asarray(explicit_uvs, np.float64) if explicit_uvs is not None else planar_uv(P, N, mat_tile(mat_name))
        if xform:
            P, N = xform(P, N)
        self.add_mesh(mat_name, P, N, uv, [0, 1, 2, 0, 2, 3])

    def add_polygon(self, mat_name, pts, xform=None):
        """Convex planar polygon as a triangle fan (winding gives the normal)."""
        P = np.asarray(pts, np.float64)
        n = np.cross(P[1] - P[0], P[2] - P[0])
        n /= np.linalg.norm(n)
        N = np.tile(n, (len(P), 1))
        uv = planar_uv(P, N, mat_tile(mat_name))
        if xform:
            P, N = xform(P, N)
        idx = [[0, i, i + 1] for i in range(1, len(P) - 1)]
        self.add_mesh(mat_name, P, N, uv, np.ravel(idx))

    def add_box(self, mat_name, x0, x1, y0, y1, z0, z1, xform=None):
        q = lambda a, b, c, d: self.add_quad(mat_name, a, b, c, d, xform=xform)
        q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0])
        q([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1])
        q([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1])
        q([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0])
        q([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0])
        q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1])

    def add_rounded_box(self, mat_name, x0, x1, y0, y1, z0, z1, r=0.005, seg=2, xform=None):
        """Watertight box with quarter-round edges and spherical corners.
        Flat faces keep flat normals; edges get smooth normals (weighted-normal look)."""
        lo = np.array([x0, y0, z0], np.float64)
        hi = np.array([x1, y1, z1], np.float64)
        r = float(min(r, 0.49 * np.min(hi - lo)))
        if r < 1e-4:
            return self.add_box(mat_name, x0, x1, y0, y1, z0, z1, xform=xform)
        t = np.tan(np.linspace(0, np.pi / 4, seg + 1))       # equal-angle edge subdivision

        def axis_vals(a):
            return np.concatenate([lo[a] + r - r * t[::-1], hi[a] - r + r * t])

        tile = mat_tile(mat_name)
        for ax in range(3):
            a1, a2 = [a for a in range(3) if a != ax]
            g1, g2 = np.meshgrid(axis_vals(a1), axis_vals(a2), indexing="ij")
            for side, val in ((-1, lo[ax]), (1, hi[ax])):
                P = np.zeros(g1.shape + (3,))
                P[..., ax], P[..., a1], P[..., a2] = val, g1, g2
                P = P.reshape(-1, 3)
                inner = np.clip(P, lo + r, hi - r)
                d = P - inner
                N = d / np.linalg.norm(d, axis=1, keepdims=True)
                P = inner + N * r
                n1, n2 = g1.shape
                i = np.arange(n1 - 1)[:, None] * n2 + np.arange(n2 - 1)[None, :]
                q = np.stack([i, i + n2, i + n2 + 1, i + 1], -1).reshape(-1, 4)
                # orient outward: compare a quad's geometric normal with the face axis
                e = np.cross(P[q[:, 1]] - P[q[:, 0]], P[q[:, 3]] - P[q[:, 0]])
                if np.sum(e[:, ax]) * side < 0:
                    q = q[:, ::-1]
                tris = np.concatenate([q[:, [0, 1, 2]], q[:, [0, 2, 3]]])
                face_n = np.zeros_like(N)
                face_n[:, ax] = side
                uv = planar_uv(P, face_n, tile)
                Pw, Nw = (xform(P, N) if xform else (P, N))
                self.add_mesh(mat_name, Pw, Nw, uv, tris.ravel())

    def add_cylinder(self, mat_name, p0, p1, radius, segs=CYL_SEGS, bevel=None, caps=True, xform=None):
        """Smooth-shaded cylinder between p0 and p1 with bevelled rims and flat caps."""
        p0, p1 = np.asarray(p0, np.float64), np.asarray(p1, np.float64)
        axis = p1 - p0
        length = np.linalg.norm(axis)
        a = axis / length
        ref = np.array([0.0, 1.0, 0.0]) if abs(a[1]) < 0.9 else np.array([1.0, 0.0, 0.0])
        bu = np.cross(a, ref); bu /= np.linalg.norm(bu)
        bw = np.cross(a, bu)
        b = min(bevel if bevel is not None else radius * 0.18, length * 0.25, radius * 0.4)
        ang = np.linspace(0, 2 * np.pi, segs + 1)               # seam duplicated for continuous UVs
        radial = np.cos(ang)[:, None] * bu + np.sin(ang)[:, None] * bw
        tile = mat_tile(mat_name)
        # rings: (axial offset, radius, normal axial weight)
        rings = [(0.0, radius - b, -0.7), (b, radius, 0.0), (length - b, radius, 0.0), (length, radius - b, 0.7)] if b > 1e-5 \
            else [(0.0, radius, 0.0), (length, radius, 0.0)]
        P, N, UV = [], [], []
        for off, rr, w in rings:
            P.append(p0 + a * off + radial * rr)
            n = radial * (1 - abs(w)) + a * w
            N.append(n / np.linalg.norm(n, axis=1, keepdims=True))
            UV.append(np.stack([ang * radius / tile, np.full_like(ang, -off / tile)], -1))
        P, N, UV = np.concatenate(P), np.concatenate(N), np.concatenate(UV)
        m = segs + 1
        idx = []
        for k in range(len(rings) - 1):
            i = np.arange(segs) + k * m
            idx.append(np.stack([i, i + 1, i + m + 1, i, i + m + 1, i + m], -1))
        idx = np.concatenate(idx).ravel()
        # winding check: outward normal vs geometric
        e = np.cross(P[idx[1]] - P[idx[0]], P[idx[2]] - P[idx[0]])
        if np.dot(e, N[idx[0]]) < 0:
            idx = idx.reshape(-1, 3)[:, ::-1].ravel()
        Pw, Nw = (xform(P, N) if xform else (P, N))
        self.add_mesh(mat_name, Pw, Nw, UV, idx)
        if caps:
            for end, sgn, rr in ((p0, -1.0, rings[0][1]), (p1, 1.0, rings[-1][1])):
                ring = end + radial[:-1] * rr
                pts = ring if sgn > 0 else ring[::-1]
                # fan orientation: ensure normal = sgn * a
                if np.dot(np.cross(pts[1] - pts[0], pts[2] - pts[0]), a * sgn) < 0:
                    pts = pts[::-1]
                self.add_polygon(mat_name, pts, xform=xform)

    def add_profile_surface(self, mat_name, P0, E, normal_hint, tile=None):
        """Extrude polyline P0 (N,3) along vector E. Flat-shaded facets (hard corrugation
        edges) with ONE continuous arc-length UV parameterisation across the panel."""
        P0 = np.asarray(P0, np.float64)
        E = np.asarray(E, np.float64)
        P1 = P0 + E
        tile = tile or mat_tile(mat_name)
        hint = np.asarray(normal_hint, np.float64)
        seg = np.diff(P0, axis=0)
        s = np.concatenate([[0.0], np.cumsum(np.linalg.norm(seg, axis=1))])
        Eh = E / np.linalg.norm(E)
        T = (P0[-1] - P0[0]) / np.linalg.norm(P0[-1] - P0[0])
        usign = 1.0 if np.dot(np.cross(T, Eh), hint) > 0 else -1.0
        t0 = P0 @ Eh
        t1 = P1 @ Eh
        n = len(P0) - 1
        a, b = P0[:-1], P0[1:]
        c, d = P1[1:], P1[:-1]
        fn = np.cross(b - a, d - a)
        fn /= np.linalg.norm(fn, axis=1, keepdims=True)
        flip = (fn @ hint) < 0
        fn[flip] *= -1
        verts = np.stack([a, b, c, d], 1)
        u = np.stack([s[:-1], s[1:], s[1:], s[:-1]], 1) * usign
        v = np.stack([t0[:-1], t0[1:], t1[1:], t1[:-1]], 1)
        uv = np.stack([u, -v], -1) / tile
        base = (np.arange(n) * 4)[:, None]
        tri = np.where(flip[:, None], np.array([0, 2, 1, 0, 3, 2]), np.array([0, 1, 2, 0, 2, 3])) + base
        self.add_mesh(mat_name, verts.reshape(-1, 3), np.repeat(fn, 4, 0), uv.reshape(-1, 2), tri.ravel())

    @staticmethod
    def corrugation_profile(a0, a1, b_inner, b_outer, pitch, wall_t, cycle_pts):
        """v2 trapezoid sampler (identical numbers): returns (as, bs_in, bs_out)."""
        n_cycles = max(1, int(round((a1 - a0) / pitch)))
        p = (a1 - a0) / n_cycles
        sign = 1.0 if b_outer > b_inner else -1.0
        A, Bi, Bo = [], [], []
        for c in range(n_cycles):
            for uf, df in cycle_pts:
                A.append(a0 + c * p + uf * p)
                bi = b_inner + df * (b_outer - b_inner - sign * wall_t)
                Bi.append(bi)
                Bo.append(bi + sign * wall_t)
        A.append(a1); Bi.append(b_inner); Bo.append(b_inner + sign * wall_t)
        return np.array(A), np.array(Bi), np.array(Bo)

    def build_primitives(self):
        prims = []
        for mid, chunks in sorted(self.parts.items()):
            vs, ns, ts, idxs, off = [], [], [], [], 0
            for v, n, t, idx in chunks:
                vs.append(v); ns.append(n); ts.append(t); idxs.append(idx + off)
                off += len(v)
            prims.append({"material": mid, "positions": np.vstack(vs).astype(np.float32),
                          "normals": np.vstack(ns).astype(np.float32), "uvs": np.vstack(ts).astype(np.float32),
                          "indices": np.concatenate(idxs).astype(np.uint32)})
        return prims


SIDE_CYCLE = [(0.00, 0.0), (0.20, 0.0), (0.31, 1.0), (0.69, 1.0), (0.80, 0.0)]
ROOF_CYCLE = [(0.00, 0.0), (0.20, 0.0), (0.30, 1.0), (0.70, 1.0), (0.80, 0.0)]
FRONT_CYCLE = [(0.00, 0.0), (0.22, 0.0), (0.32, 1.0), (0.68, 1.0), (0.78, 0.0)]


def add_side_wall(mb, x0, x1, y0, y1, z_inner, z_outer, pitch, wall_t=0.005):
    xs, zi, zo = MeshBuilder.corrugation_profile(x0, x1, z_inner, z_outer, pitch, wall_t, SIDE_CYCLE)
    out = np.sign(z_outer - z_inner)
    E = [0, y1 - y0, 0]
    mb.add_profile_surface("Mat_Exterior_Green", np.stack([xs, np.full_like(xs, y0), zo], -1), E, [0, 0, out])
    mb.add_profile_surface("Mat_Interior_Wall", np.stack([xs, np.full_like(xs, y0), zi], -1), E, [0, 0, -out])
    for i in range(len(xs) - 1):   # sheet-edge caps (top & bottom), planar UVs
        xa, xb = xs[i], xs[i + 1]
        top = [[xa, y1, zi[i]], [xb, y1, zi[i + 1]], [xb, y1, zo[i + 1]], [xa, y1, zo[i]]]
        bot = [[xa, y0, zo[i]], [xb, y0, zo[i + 1]], [xb, y0, zi[i + 1]], [xa, y0, zi[i]]]
        for quad in (top, bot):
            if out > 0:
                quad = quad[::-1]
            mb.add_quad("Mat_Exterior_Green", *quad)
    return xs, zo


def add_roof(mb, x0, x1, z0, z1, y_inner, y_outer, pitch, wall_t=0.005):
    xs, yi, yo = MeshBuilder.corrugation_profile(x0, x1, y_inner, y_outer, pitch, wall_t, ROOF_CYCLE)
    E = [0, 0, z1 - z0]
    mb.add_profile_surface("Mat_Exterior_Green", np.stack([xs, yo, np.full_like(xs, z0)], -1), E, [0, 1, 0])
    mb.add_profile_surface("Mat_Interior_Wall", np.stack([xs, yi, np.full_like(xs, z0)], -1), E, [0, -1, 0])
    for i in range(len(xs) - 1):
        xa, xb = xs[i], xs[i + 1]
        mb.add_quad("Mat_Exterior_Green", [xb, yi[i + 1], z0], [xa, yi[i], z0], [xa, yo[i], z0], [xb, yo[i + 1], z0])
        mb.add_quad("Mat_Exterior_Green", [xa, yi[i], z1], [xb, yi[i + 1], z1], [xb, yo[i + 1], z1], [xa, yo[i], z1])


def add_front_wall(mb, z0, z1, y0, y1, x_inner, x_outer, pitch, wall_t=0.005):
    zs, xi, xo = MeshBuilder.corrugation_profile(z0, z1, x_inner, x_outer, pitch, wall_t, FRONT_CYCLE)
    E = [0, y1 - y0, 0]
    mb.add_profile_surface("Mat_Exterior_Green", np.stack([xo, np.full_like(zs, y0), zs], -1), E, [1, 0, 0])
    mb.add_profile_surface("Mat_Interior_Wall", np.stack([xi, np.full_like(zs, y0), zs], -1), E, [-1, 0, 0])


def add_conformed_side_decal(mb, mat_name, wall_x0, wall_x1, dec_x0, dec_x1, dec_y0, dec_y1,
                             z_inner, z_outer, pitch, wall_t=0.005, offset=0.0018, flip_side=False):
    """UNCHANGED v2 decal conformation (same vertices, same 0..1 UVs)."""
    xs, _, zs_out = MeshBuilder.corrugation_profile(wall_x0, wall_x1, z_inner, z_outer, pitch, wall_t, SIDE_CYCLE)
    sign = 1.0 if z_outer > z_inner else -1.0
    interp_z = lambda xv: float(np.interp(xv, xs, zs_out)) + sign * offset
    pts_x, pts_z = [dec_x0], [interp_z(dec_x0)]
    for x, z in zip(xs, zs_out):
        if dec_x0 < x < dec_x1:
            pts_x.append(x); pts_z.append(z + sign * offset)
    pts_x.append(dec_x1); pts_z.append(interp_z(dec_x1))
    span = dec_x1 - dec_x0
    for i in range(len(pts_x) - 1):
        xa, xb, za, zb = pts_x[i], pts_x[i + 1], pts_z[i], pts_z[i + 1]
        if not flip_side:
            ua, ub = (dec_x1 - xa) / span, (dec_x1 - xb) / span
            mb.add_quad(mat_name, [xb, dec_y0, zb], [xa, dec_y0, za], [xa, dec_y1, za], [xb, dec_y1, zb],
                        explicit_uvs=[[ub, 1.0], [ua, 1.0], [ua, 0.0], [ub, 0.0]])
        else:
            ua, ub = (xa - dec_x0) / span, (xb - dec_x0) / span
            mb.add_quad(mat_name, [xa, dec_y0, za], [xb, dec_y0, zb], [xb, dec_y1, zb], [xa, dec_y1, za],
                        explicit_uvs=[[ua, 1.0], [ub, 1.0], [ub, 0.0], [ua, 0.0]])


# =============================================================================
# CONTAINER ASSEMBLY
# =============================================================================
def build_container(spec):
    L, W, H = spec["int_length"], spec["int_width"], spec["int_height"]
    x_rear, x_front = -spec["rear_frame_depth"], L + spec["front_wall_depth"]
    y_bot, y_top = -spec["floor_assembly_depth"], H + spec["roof_assembly_thick"]
    z_left, z_right = -spec["side_wall_thick"], W + spec["side_wall_thick"]
    door_w, door_h = spec["door_open_width"], spec["door_open_height"]
    door_z0 = (W - door_w) / 2.0
    door_z1 = W - door_z0
    cx, cy, cz = spec["casting_x"], spec["casting_y"], spec["casting_z"]
    angle = math.radians(spec["door_open_angle_deg"])
    I = [0.0, 0.0, 0.0, 1.0]
    nodes = {}
    RB = "Mat_Structural_Dark"
    HW = "Mat_Hardware_Steel"
    GK = "Mat_Rubber_Gasket"

    # 1. Base_Floor -------------------------------------------------------------
    mb = MeshBuilder("Base_Floor")
    wood_t = spec["wood_floor_thick"]
    # bottom side rails run 0..L to meet the corner castings (v2/20 ft stopped ~10 cm short, leaving a gap)
    mb.add_rounded_box(RB, 0.0, L, y_bot, 0.0, z_left, 0.0, r=0.006)
    mb.add_rounded_box(RB, 0.0, L, y_bot, 0.0, W, z_right, r=0.006)
    mb.add_rounded_box(RB, L, x_front, y_bot, 0.0, z_left + cz, z_right - cz, r=0.006)
    mb.add_rounded_box(RB, x_rear, 0.0, y_bot, -0.006, z_left + cz, z_right - cz, r=0.005)
    for xm in np.linspace(0.15, L - 0.15, int(round(L / 0.305))):        # under-floor cross members
        mb.add_box(RB, xm - 0.020, xm + 0.020, y_bot + 0.015, -wood_t, 0.0, W)
        mb.add_box(RB, xm - 0.032, xm + 0.032, y_bot + 0.012, y_bot + 0.022, 0.0, W)
    for fx in ((L / 2 - 1.025, L / 2 + 1.025) if spec.get("forklift_pockets", True) else ()):   # forklift pockets
        for zf, sgn in ((z_left - 0.0006, -1), (z_right + 0.0006, 1)):
            pts = stadium(fx, y_bot + 0.0585, 0.175, 0.0465, zf, axis="z")
            mb.add_polygon(GK, pts if sgn > 0 else pts[::-1])
    for xl in np.linspace(0.45, L - 0.45, spec.get("lashing_per_rail", 8)):   # floor-level lashing points
        add_lashing_point(mb, xl, 0.045, 0.0, +1)
        add_lashing_point(mb, xl, 0.045, W, -1)
    nodes["Base_Floor"] = {"mesh": mb, "translation": [0.0, 0.0, 0.0], "rotation": I}

    # 2. Floor_Surface — v2 code path, untouched -------------------------------
    mb = MeshBuilder("Floor_Surface")
    mb.legacy_box("Mat_Wood_Floor", 0.000, L, -wood_t, 0.000, 0.000, W, uv_scale=(0.34, 0.42))
    nodes["Floor_Surface"] = {"mesh": mb, "translation": [0.0, 0.0, 0.0], "rotation": I}

    # 3. Corner_Castings ---------------------------------------------------------
    mb = MeshBuilder("Corner_Castings")
    for sx, x0, x1 in (("rear", x_rear, x_rear + cx), ("front", x_front - cx, x_front)):
        for y0, y1 in ((y_bot, y_bot + cy), (y_top - cy, y_top)):
            for sz, z0, z1 in (("left", z_left, z_left + cz), ("right", z_right - cz, z_right)):
                cx0 = x0 if sx == "rear" else max(L, x0)
                cx1 = min(0.0, x1) if sx == "rear" else x1
                mb.add_rounded_box(RB, cx0, cx1, y0, y1, z0, z1, r=0.009, seg=2)
                xm, ym, zm = (cx0 + cx1) / 2, (y0 + y1) / 2, (z0 + z1) / 2
                # oval ISO 1161 apertures (side + end face), 0.8 mm proud of the flat face
                if sz == "left":
                    mb.add_polygon(GK, stadium(xm, ym, 0.028, 0.026, z0 - 0.0008, axis="z")[::-1])
                else:
                    mb.add_polygon(GK, stadium(xm, ym, 0.028, 0.026, z1 + 0.0008, axis="z"))
                if sx == "rear":   # axis="x" outline faces -X by default
                    mb.add_polygon(GK, stadium(zm, ym, 0.034, 0.026, cx0 - 0.0008, axis="x"))
                else:
                    mb.add_polygon(GK, stadium(zm, ym, 0.034, 0.026, cx1 + 0.0008, axis="x")[::-1])
                # top/bottom face aperture
                yf = y1 + 0.0008 if y1 > H else y0 - 0.0008
                pts = stadium(xm, zm, 0.034, 0.024, yf, axis="y")
                mb.add_polygon(GK, pts if y1 > H else pts[::-1])
    nodes["Corner_Castings"] = {"mesh": mb, "translation": [0.0, 0.0, 0.0], "rotation": I}

    # 4. Corner_Posts (+ top rails, front header, top lashing points) -----------
    mb = MeshBuilder("Corner_Posts")
    yb, yt = y_bot + cy, y_top - cy
    for box in ((x_rear, 0.0, yb, yt, z_left, door_z0), (x_rear, 0.0, yb, yt, door_z1, z_right),
                (L, x_front, yb, yt, z_left, 0.0), (L, x_front, yb, yt, W, z_right),
                (L + 0.015, x_front, yb, yt, z_left, z_left + cz), (L + 0.015, x_front, yb, yt, z_right - cz, z_right),
                (0.0, L, H, y_top, z_left, 0.0), (0.0, L, H, y_top, W, z_right),
                (L, x_front, H, y_top, z_left + cz, z_right - cz)):
        mb.add_rounded_box(RB, *box, r=0.006)
    for xl in np.linspace(0.45, L - 0.45, spec.get("lashing_per_rail", 8)):
        add_lashing_point(mb, xl, H - 0.045, 0.0, +1)
        add_lashing_point(mb, xl, H - 0.045, W, -1)
    nodes["Corner_Posts"] = {"mesh": mb, "translation": [0.0, 0.0, 0.0], "rotation": I}

    # 5. Rear_Frame -------------------------------------------------------------
    mb = MeshBuilder("Rear_Frame")
    mb.add_rounded_box(RB, x_rear, 0.0, door_h, y_top, z_left + cz, z_right - cz, r=0.006)
    mb.add_box(RB, x_rear, 0.0, door_h, y_top - cy, door_z0, z_left + cz)
    mb.add_box(RB, x_rear, 0.0, door_h, y_top - cy, z_right - cz, door_z1)
    mb.add_rounded_box(HW, x_rear + 0.005, 0.0, -0.006, 0.0, door_z0, door_z1, r=0.0015, seg=1)   # sill wear plate
    mb.add_rounded_box(GK, -0.014, 0.0, 0.0, door_h, door_z0, door_z0 + 0.007, r=0.002, seg=1)
    mb.add_rounded_box(GK, -0.014, 0.0, 0.0, door_h, door_z1 - 0.007, door_z1, r=0.002, seg=1)
    mb.add_rounded_box(GK, -0.014, 0.0, door_h - 0.007, door_h, door_z0, door_z1, r=0.002, seg=1)
    for kz in (door_z0 + 0.18, door_z0 + 1.00, door_z1 - 1.00, door_z1 - 0.18):   # cam keepers
        for y0, y1 in ((door_h + 0.010, door_h + 0.048), (-0.048, -0.010)):
            mb.add_rounded_box(HW, x_rear - 0.014, x_rear + 0.005, y0, y1, kz - 0.032, kz + 0.032, r=0.004)
            mb.add_rounded_box(HW, x_rear - 0.020, x_rear - 0.012, y0 + 0.006, y1 - 0.006, kz - 0.040, kz - 0.030, r=0.002, seg=1)
            mb.add_rounded_box(HW, x_rear - 0.020, x_rear - 0.012, y0 + 0.006, y1 - 0.006, kz + 0.030, kz + 0.040, r=0.002, seg=1)
    nodes["Rear_Frame"] = {"mesh": mb, "translation": [0.0, 0.0, 0.0], "rotation": I}

    # 6-9. Corrugated panels -----------------------------------------------------
    mb = MeshBuilder("Left_Side_Wall")
    add_side_wall(mb, 0.0, L, 0.0, H, 0.0, z_left, spec["side_corr_pitch"])
    nodes["Left_Side_Wall"] = {"mesh": mb, "translation": [0.0, 0.0, 0.0], "rotation": I}
    mb = MeshBuilder("Right_Side_Wall")
    add_side_wall(mb, 0.0, L, 0.0, H, W, z_right, spec["side_corr_pitch"])
    nodes["Right_Side_Wall"] = {"mesh": mb, "translation": [0.0, 0.0, 0.0], "rotation": I}
    mb = MeshBuilder("Roof_Panel")
    add_roof(mb, 0.0, L, 0.0, W, H, y_top, spec["roof_corr_pitch"])
    nodes["Roof_Panel"] = {"mesh": mb, "translation": [0.0, 0.0, 0.0], "rotation": I}
    mb = MeshBuilder("Front_End_Wall")
    add_front_wall(mb, 0.0, W, 0.0, H, L, x_front - 0.015, spec["front_corr_pitch"])
    nodes["Front_End_Wall"] = {"mesh": mb, "translation": [0.0, 0.0, 0.0], "rotation": I}

    # 10-11. Rear doors (local coords; node rotation opens them) ----------------
    left_pivot = np.array([x_rear - 0.004, 0.0, z_left + 0.020])
    right_pivot = np.array([x_rear - 0.004, 0.0, z_right - 0.020])
    door_thick, fw = 0.050, 0.068
    door_y0, door_y1 = 0.004, door_h - 0.004
    half_gap, mid_z = 0.004, W / 2.0
    x_ext, x_int = 0.002, 0.002 + door_thick
    x_skin, x_rib = x_ext + 0.006, x_ext + 0.002        # outer faces (outward = -X local)
    rib_rows = None

    def door_z(is_left):
        if is_left:
            return door_z0 - left_pivot[2], (mid_z - half_gap) - left_pivot[2]
        return (mid_z + half_gap) - right_pivot[2], door_z1 - right_pivot[2]

    def build_door(name, is_left):
        nonlocal rib_rows
        m = MeshBuilder(name)
        z0, z1 = door_z(is_left)
        for box in ((door_y0, door_y0 + fw, z0, z1), (door_y1 - fw, door_y1, z0, z1),
                    (door_y0 + fw, door_y1 - fw, z0, z0 + fw), (door_y0 + fw, door_y1 - fw, z1 - fw, z1)):
            m.add_rounded_box(RB, x_ext, x_int, *box, r=0.006)
        for box in ((door_y0 - 0.004, door_y1 + 0.004, z0 - 0.005, z0), (door_y0 - 0.004, door_y1 + 0.004, z1, z1 + 0.005),
                    (door_y1, door_y1 + 0.005, z0, z1), (door_y0 - 0.005, door_y0, z0, z1)):
            m.add_rounded_box(GK, x_int - 0.010, x_int + 0.004, *box, r=0.002, seg=1)
        iy0, iy1, iz0, iz1 = door_y0 + fw, door_y1 - fw, z0 + fw, z1 - fw
        m.add_box("Mat_Interior_Wall", x_int - 0.008, x_int, iy0, iy1, iz0, iz1)
        m.add_box("Mat_Exterior_Green", x_skin, x_int - 0.008, iy0, iy1, iz0, iz1)
        rib_rows = [(iy0 + d, iy0 + d + 0.055) for d in (0.14, 0.52, 0.90, 1.28, 1.66)]
        for ry0, ry1 in rib_rows:
            m.add_rounded_box("Mat_Exterior_Green", x_rib, x_skin + 0.002, ry0, ry1, iz0 + 0.03, iz1 - 0.03, r=0.0028, seg=2)
            # matching pressed stiffener on the inner liner (inside face, +X local)
            m.add_rounded_box("Mat_Interior_Wall", x_int - 0.002, x_int + 0.004, ry0 - 0.01, ry1 + 0.01, iz0 + 0.03, iz1 - 0.03, r=0.0025, seg=2)
        return m

    rot_l = rot_y(-angle, left_pivot)
    rot_r = rot_y(+angle, right_pivot)
    nodes["Rear_Door_Left"] = {"mesh": build_door("Rear_Door_Left", True), "translation": left_pivot.tolist(),
                               "rotation": [0.0, math.sin(-angle / 2), 0.0, math.cos(-angle / 2)]}
    nodes["Rear_Door_Right"] = {"mesh": build_door("Rear_Door_Right", False), "translation": right_pivot.tolist(),
                                "rotation": [0.0, math.sin(angle / 2), 0.0, math.cos(angle / 2)]}

    # 12. Locking_Rods (world space, posed with the doors as in v2) -------------
    mb = MeshBuilder("Locking_Rods")
    rod_z = {True: [door_z(True)[0] + 0.18, door_z(True)[0] + 1.00],
             False: [door_z(False)[1] - 0.18, door_z(False)[1] - 1.00]}
    for is_left, xf in ((True, rot_l), (False, rot_r)):
        for rz in rod_z[is_left]:
            rx = -0.022
            mb.add_cylinder(HW, [rx, door_y0 - 0.024, rz], [rx, door_y1 + 0.024, rz], 0.016, xform=xf)
            for ya, yb in ((door_y1 + 0.004, door_y1 + 0.034), (door_y0 - 0.034, door_y0 - 0.004)):   # cams
                mb.add_rounded_box(HW, -0.044, 0.002, ya, yb, rz - 0.036, rz + 0.036, r=0.006, xform=xf)
                mb.add_cylinder(HW, [rx, ya - 0.002, rz], [rx, yb + 0.002, rz], 0.024, bevel=0.003, xform=xf)
            for by in (0.16, 0.84, 1.52, 2.14):                      # guide brackets
                mb.add_rounded_box(HW, -0.042, 0.004, by - 0.026, by + 0.026, rz - 0.038, rz + 0.038, r=0.005, seg=1, xform=xf)
                mb.add_rounded_box(RB, -0.004, x_rib, by - 0.038, by + 0.038, rz - 0.052, rz + 0.052, r=0.002, seg=1, xform=xf)
                for bz in (rz - 0.044, rz + 0.044):                  # bolt heads
                    mb.add_cylinder(HW, [-0.009, by, bz], [-0.003, by, bz], 0.006, segs=12, bevel=0.0015, xform=xf)
            hd = 1.0 if is_left else -1.0                            # handle hub, lever, grip, retainer
            mb.add_rounded_box(HW, -0.054, -0.006, 0.862, 0.938, rz - 0.028, rz + 0.028, r=0.008, xform=xf)
            mb.add_cylinder(HW, [-0.040, 0.900, rz], [-0.040, 0.900, rz + hd * 0.25], 0.012, xform=xf)
            mb.add_cylinder(HW, [-0.040, 0.900, rz + hd * 0.17], [-0.040, 0.900, rz + hd * 0.27], 0.0155, bevel=0.004, xform=xf)
            mb.add_rounded_box(RB, -0.034, x_rib, 0.858, 0.950, rz + hd * 0.21 - 0.024, rz + hd * 0.21 + 0.024, r=0.005, seg=1, xform=xf)
    nodes["Locking_Rods"] = {"mesh": mb, "translation": [0.0, 0.0, 0.0], "rotation": I}

    # 13. Hinges ------------------------------------------------------------------
    mb = MeshBuilder("Hinges")
    for is_left, pivot, xf in ((True, left_pivot, rot_l), (False, right_pivot, rot_r)):
        for hy in (0.22, 0.84, 1.46, 2.08):
            mb.add_cylinder(HW, [pivot[0], hy - 0.056, pivot[2]], [pivot[0], hy + 0.056, pivot[2]], 0.015, bevel=0.003)
            mb.add_cylinder(HW, [pivot[0], hy + 0.056, pivot[2]], [pivot[0], hy + 0.064, pivot[2]], 0.011, bevel=0.002)  # pin cap
            lz0, lz1 = (z_left, z_left + 0.046) if is_left else (z_right - 0.046, z_right)
            mb.add_rounded_box(RB, pivot[0] - 0.012, x_rear + 0.020, hy - 0.042, hy + 0.042, lz0, lz1, r=0.005)
            za, zb = (0.0, 0.18) if is_left else (-0.18, 0.0)
            mb.add_rounded_box(HW, -0.014, 0.004, hy - 0.032, hy + 0.032, za, zb, r=0.004, xform=xf)
            za, zb = (0.11, 0.15) if is_left else (-0.15, -0.11)
            mb.add_rounded_box(RB, -0.018, -0.010, hy - 0.016, hy + 0.016, za, zb, r=0.003, seg=1, xform=xf)
            for bz in ((0.06, 0.13) if is_left else (-0.06, -0.13)):
                mb.add_cylinder(HW, [-0.019, hy, bz], [-0.013, hy, bz], 0.0055, segs=12, bevel=0.0015, xform=xf)
    nodes["Hinges"] = {"mesh": mb, "translation": [0.0, 0.0, 0.0], "rotation": I}

    # 14. Markings -----------------------------------------------------------------
    side = {}
    decal_x = {"Side": spec.get("side_decal_x", (0.22, L - 0.22)), "Owner": spec.get("owner_decal_x", (0.22, L - 0.22))}
    for key, mat, off in (("Side", "Mat_Decal_Side_Panel", 0.0018), ("Owner", "Mat_Decal_Side_Owner", 0.0024)):
        for lr, zi, zo, flip in (("Left", 0.0, z_left, False), ("Right", W, z_right, True)):
            m = MeshBuilder(f"Exterior_Marking_{key}_{lr}")
            # the right wall reads mirrored (as on the 20 ft, its ID sits at the front end), so mirror the footprint too
            dx0, dx1 = decal_x[key] if lr == "Left" else (L - decal_x[key][1], L - decal_x[key][0])
            add_conformed_side_decal(m, mat, 0.0, L, dx0, dx1, 0.16, 2.26, zi, zo, spec["side_corr_pitch"],
                                     offset=off, flip_side=flip)
            side[(key, lr)] = m

    # Rear door decal: same footprint & UVs as v2, now stepped onto ribs (1.2 mm proud)
    mb_door = MeshBuilder("Rear_Door_Marking")
    lift = 0.0012
    for is_left, xf, u0, u1 in ((True, rot_l, 0.0, 0.5), (False, rot_r, 0.5, 1.0)):
        z0, z1 = door_z(is_left)
        dz0, dz1 = z0 + 0.085, z1 - 0.085
        dy0, dy1 = door_y0 + 0.085, door_y1 - 0.085
        iz0, iz1 = z0 + fw + 0.03, z1 - fw - 0.03                      # rib z extent
        add_stepped_door_decal(mb_door, "Mat_Decal_Rear_Doors", dz0, dz1, dy0, dy1, u0, u1,
                               rib_rows, iz0, iz1, x_skin - lift, x_rib - lift, lift, xf)

    # CSC plate: on the left door skin, between rib 1 and rib 2 (v2 bridged rib 2)
    mb_csc_geo = MeshBuilder("CSC_Plate_Geometry")
    mb_csc_mark = MeshBuilder("CSC_Plate_Marking")
    lz0, _ = door_z(True)
    pz0, pz1 = lz0 + 0.42, lz0 + 0.42 + 0.32
    py0 = (rib_rows[0][1] + rib_rows[1][0]) / 2 - 0.106
    py1 = py0 + 0.212
    plate_front = x_skin - 0.003
    mb_csc_geo.add_rounded_box("Mat_CSC_Steel", plate_front, x_skin, py0, py1, pz0, pz1, r=0.0012, seg=1, xform=rot_l)
    for rzz in (pz0 + 0.0162, pz1 - 0.0162):                        # rivets, aligned with the artwork's corner circles
        for ryy in (py0 + 0.0162, py1 - 0.0162):
            mb_csc_geo.add_cylinder("Mat_CSC_Steel", [plate_front - 0.0012, ryy, rzz], [plate_front + 0.0005, ryy, rzz],
                                    0.004, segs=12, bevel=0.0008, xform=rot_l)
    xd = plate_front - 0.0008
    mb_csc_mark.add_quad("Mat_Decal_CSC_Plate", [xd, py0, pz0], [xd, py0, pz1], [xd, py1, pz1], [xd, py1, pz0],
                         explicit_uvs=[[0, 1], [1, 1], [1, 0], [0, 0]], xform=rot_l)

    z = lambda m: {"mesh": m, "translation": [0.0, 0.0, 0.0], "rotation": I}
    nodes["Exterior_Marking_Decals"] = {"group": True, "children": {
        "Exterior_Marking_Side": {"group": True, "children": {
            "Exterior_Marking_Side_Left": z(side[("Side", "Left")]), "Exterior_Marking_Side_Right": z(side[("Side", "Right")])}},
        "Exterior_Marking_Owner": {"group": True, "children": {
            "Exterior_Marking_Owner_Left": z(side[("Owner", "Left")]), "Exterior_Marking_Owner_Right": z(side[("Owner", "Right")])}},
    }}
    nodes["Door_Marking_Decals"] = {"group": True, "children": {"Rear_Door_Marking": z(mb_door)}}
    nodes["CSC_Plate"] = {"group": True, "children": {"CSC_Plate_Geometry": z(mb_csc_geo), "CSC_Plate_Marking": z(mb_csc_mark)}}

    layout = {"rod_z_local": {"left": rod_z[True], "right": rod_z[False]}, "rib_rows": rib_rows,
              "csc_plate_local": {"y": [py0, py1], "z": [pz0, pz1]},
              "door_z_local": {"left": door_z(True), "right": door_z(False)},
              "door_y": [door_y0, door_y1], "door_decal_inset": 0.085,
              "pivots": {"left": left_pivot.tolist(), "right": right_pivot.tolist()},
              "side_decal_x": list(decal_x["Side"]), "owner_decal_x": list(decal_x["Owner"]), "decal_y": [0.16, 2.26]}
    return nodes, layout


def stadium(c1, c2, half_len, half_h, plane, axis, n=8):
    """Oval (stadium) outline. axis='z': (x=c1,y=c2) in plane z; 'x': (z=c1,y=c2) in plane x; 'y': (x=c1,z=c2)."""
    r = half_h
    hl = max(half_len - r, 0.0)
    pts = []
    for cxo, a0 in ((hl, -np.pi / 2), (-hl, np.pi / 2)):
        for a in np.linspace(a0, a0 + np.pi, n + 1):
            pts.append((c1 + cxo + r * math.cos(a), c2 + r * math.sin(a)))
    pts = np.array(pts)
    if axis == "z":
        return np.stack([pts[:, 0], pts[:, 1], np.full(len(pts), plane)], -1)
    if axis == "x":
        return np.stack([np.full(len(pts), plane), pts[:, 1], pts[:, 0]], -1)
    return np.stack([pts[:, 0], np.full(len(pts), plane), pts[:, 1]], -1)[::-1]


def add_lashing_point(mb, x, y, z_wall, inward):
    """Welded lashing bracket + bar on the side rail; inward = +1 (left wall) / -1 (right)."""
    z0, z1 = sorted((z_wall + inward * 0.0005, z_wall + inward * 0.009))
    mb.add_rounded_box("Mat_Interior_Wall", x - 0.045, x + 0.045, y - 0.028, y + 0.028, z0, z1, r=0.003, seg=1)
    zp = z_wall + inward * 0.026
    for xp in (x - 0.030, x + 0.030):
        mb.add_cylinder("Mat_Hardware_Steel", [xp, y, z_wall + inward * 0.008], [xp, y, zp], 0.0065, segs=12, bevel=0, caps=False)
    mb.add_cylinder("Mat_Hardware_Steel", [x - 0.037, y, zp], [x + 0.037, y, zp], 0.0075, segs=16, bevel=0.0015)


def add_stepped_door_decal(mb, mat, dz0, dz1, dy0, dy1, u0, u1, rib_rows, rz0, rz1, x_skin_d, x_rib_d, lift, xf):
    """Decal grid over [dz0,dz1]x[dy0,dy1]: cells on ribs sit at x_rib_d, others at x_skin_d,
    joined by small step faces. UVs are the v2 linear mapping, so artwork is unchanged."""
    ys = sorted({dy0, dy1, *[v for r0, r1 in rib_rows for v in (r0 - lift, r1 + lift)]})
    ys = [y for y in ys if dy0 <= y <= dy1]
    zs = sorted({dz0, dz1, rz0 - lift, rz1 + lift})
    zs = [z for z in zs if dz0 <= z <= dz1]
    U = lambda zz: u0 + (zz - dz0) / (dz1 - dz0) * (u1 - u0)
    V = lambda yy: (dy1 - yy) / (dy1 - dy0)

    def on_rib(yc, zc):
        return rz0 < zc < rz1 and any(r0 < yc < r1 for r0, r1 in rib_rows)

    depth = {}
    for j in range(len(ys) - 1):
        for i in range(len(zs) - 1):
            ya, yb, za, zb = ys[j], ys[j + 1], zs[i], zs[i + 1]
            xd = x_rib_d if on_rib((ya + yb) / 2, (za + zb) / 2) else x_skin_d
            depth[(i, j)] = xd
            # faces outward (-X local): p0..p3 = (+Z) x (+Y) = -X
            mb.add_quad(mat, [xd, ya, za], [xd, ya, zb], [xd, yb, zb], [xd, yb, za],
                        explicit_uvs=[[U(za), V(ya)], [U(zb), V(ya)], [U(zb), V(yb)], [U(za), V(yb)]], xform=xf)
    # step faces between cells of different depth
    for (i, j), xd in depth.items():
        if (i, j + 1) in depth and depth[(i, j + 1)] != xd:           # horizontal step at y = ys[j+1]
            y, za, zb = ys[j + 1], zs[i], zs[i + 1]
            xa, xb = xd, depth[(i, j + 1)]
            quad = [[xa, y, za], [xb, y, za], [xb, y, zb], [xa, y, zb]]
            uv = [[U(za), V(y)], [U(za), V(y)], [U(zb), V(y)], [U(zb), V(y)]]
            n = np.cross(np.subtract(quad[1], quad[0]), np.subtract(quad[3], quad[0]))
            want = 1 if xa < xb else -1                              # face toward the lower cell when it is raised
            if np.sign(n[1]) != want:
                quad, uv = quad[::-1], uv[::-1]
            mb.add_quad(mat, *quad, explicit_uvs=uv, xform=xf)
        if (i + 1, j) in depth and depth[(i + 1, j)] != xd:           # vertical step at z = zs[i+1]
            zz, ya, yb = zs[i + 1], ys[j], ys[j + 1]
            xa, xb = xd, depth[(i + 1, j)]
            quad = [[xa, ya, zz], [xa, yb, zz], [xb, yb, zz], [xb, ya, zz]]
            uv = [[U(zz), V(ya)], [U(zz), V(yb)], [U(zz), V(yb)], [U(zz), V(ya)]]
            n = np.cross(np.subtract(quad[1], quad[0]), np.subtract(quad[3], quad[0]))
            want = 1 if xa < xb else -1
            if np.sign(n[2]) != want:
                quad, uv = quad[::-1], uv[::-1]
            mb.add_quad(mat, *quad, explicit_uvs=uv, xform=xf)


# =============================================================================
# TEXTURES & GLB EXPORT
# =============================================================================
def encode(img, fmt, quality=90):
    buf = io.BytesIO()
    if fmt == "JPEG":
        img.convert("RGB").save(buf, format="JPEG", quality=quality, optimize=True, subsampling=0 if quality >= 92 else 2)
        return buf.getvalue(), "image/jpeg"
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue(), "image/png"


def texture_registry(quality):
    """key -> (bytes, mime, sampler). Runtime images are also written to disk for delivery."""
    R = os.path.join
    reg = {}
    wood = {"wood_albedo": "wood_floor_albedo_2k.png", "wood_mr": "wood_floor_mr_2k.png",
            "wood_normal": "wood_floor_normal_2k.png", "wood_ao": "wood_floor_ao_2k.png"}
    for key, fn in wood.items():
        if quality == "master":   # original PNG files, byte-for-byte
            reg[key] = (open(R(PBR_DIR, fn), "rb").read(), "image/png", 0)
        else:                     # the exact JPEG bytes embedded in the v2 GLB
            reg[key] = (open(R(PBR_RUNTIME_DIR, f"v2_{key}_1k.jpg"), "rb").read(), "image/jpeg", 0)

    # (key, master file, runtime size, runtime format, jpeg quality)
    pbr = [("ext_albedo", "steel_ext_albedo_2k.png", 2048, "JPEG", 90), ("ext_orm", "steel_ext_orm_2k.png", 2048, "JPEG", 90),
           ("ext_normal", "steel_ext_normal_2k.png", 2048, "JPEG", 94),
           ("int_albedo", "steel_int_albedo_2k.png", 2048, "JPEG", 90), ("int_orm", "steel_int_orm_2k.png", 1024, "JPEG", 90),
           ("int_normal", "steel_int_normal_2k.png", 1024, "JPEG", 94),
           ("hw_albedo", "steel_hw_albedo_1k.png", 1024, "JPEG", 90), ("hw_orm", "steel_hw_orm_1k.png", 1024, "JPEG", 90),
           ("hw_normal", "steel_hw_normal_1k.png", 1024, "JPEG", 94)]
    os.makedirs(PBR_RUNTIME_DIR, exist_ok=True)
    for key, fn, size, fmt, q in pbr:
        src = R(PBR_DIR, fn)
        if quality == "master":
            reg[key] = (open(src, "rb").read(), "image/png", 0)
            continue
        img = Image.open(src).convert("RGB")
        if img.width != size:
            img = img.resize((size, size), Image.LANCZOS)
        data, mime = encode(img, fmt, q)
        with open(R(PBR_RUNTIME_DIR, fn.replace("_2k.png", "").replace("_1k.png", "") + f"_{size // 1024}k.jpg"), "wb") as fh:
            fh.write(data)
        reg[key] = (data, mime, 0)

    for key, fn in (("decal_side_panel", "side_panel.png"), ("decal_side_owner", "side_owner.png"),
                    ("decal_rear_doors", "rear_doors.png"), ("decal_csc_plate", "csc_plate.png")):
        src = R(MARK_DIR, "master" if quality == "master" else "runtime", fn)
        if not os.path.exists(src):
            raise FileNotFoundError(f"{src} missing — run generate_markings.py first")
        if key == "decal_csc_plate" and quality == "runtime":   # opaque plate -> JPEG
            data, mime = encode(Image.open(src), "JPEG", 92)
        else:
            data, mime = open(src, "rb").read(), "image/png"
        reg[key] = (data, mime, 1)
    return reg


def export_glb(nodes, output_path, quality, root_name="Container_Root"):
    bin_blob, buffer_views, accessors, meshes_gltf, nodes_gltf = bytearray(), [], [], [], []
    samplers = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497},
                {"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}]

    def append_bytes(data, target=None):
        while len(bin_blob) % 4:
            bin_blob.append(0)
        bv = {"buffer": 0, "byteOffset": len(bin_blob), "byteLength": len(data)}
        bin_blob.extend(data)
        if target is not None:
            bv["target"] = target
        buffer_views.append(bv)
        return len(buffer_views) - 1

    reg = texture_registry(quality)
    used = sorted({k for m in MATERIALS for k in m["tex"].values()}, key=list(reg).index)
    images, textures, tex_idx, image_report = [], [], {}, {}
    for key in used:
        data, mime, smp = reg[key]
        images.append({"bufferView": append_bytes(data), "mimeType": mime, "name": key})
        textures.append({"sampler": smp, "source": len(images) - 1, "name": key})
        tex_idx[key] = len(textures) - 1
        w, h = Image.open(io.BytesIO(data)).size
        image_report[key] = {"mime": mime, "size": [w, h], "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}

    materials = []
    for m in MATERIALS:
        t = m["tex"]
        pbr = {"baseColorFactor": m["baseColorFactor"], "metallicFactor": m["metallicFactor"], "roughnessFactor": m["roughnessFactor"]}
        if "albedo" in t:
            pbr["baseColorTexture"] = {"index": tex_idx[t["albedo"]]}
        if "orm" in t:
            pbr["metallicRoughnessTexture"] = {"index": tex_idx[t["orm"]]}
        if "mr" in t:
            pbr["metallicRoughnessTexture"] = {"index": tex_idx[t["mr"]]}
        mo = {"name": m["name"], "pbrMetallicRoughness": pbr, "doubleSided": False}
        if "normal" in t:
            mo["normalTexture"] = {"index": tex_idx[t["normal"]], "scale": m["normal_scale"]}
        if "orm" in t or "ao" in t:
            mo["occlusionTexture"] = {"index": tex_idx[t.get("orm") or t["ao"]], "strength": m["ao_strength"]}
        if "alphaMode" in m:
            mo["alphaMode"] = m["alphaMode"]
        materials.append(mo)

    root_children = []
    nodes_gltf.append({"name": root_name, "children": root_children})
    report = []

    def add_mesh_node(name, nd, parent):
        prims, gprims, tris, verts, allp = nd["mesh"].build_primitives(), [], 0, 0, []
        for p in prims:
            pos, nrm, uv, idx = p["positions"], p["normals"], p["uvs"], p["indices"]
            allp.append(pos); tris += len(idx) // 3; verts += len(pos)
            a = len(accessors)
            accessors.append({"bufferView": append_bytes(pos.tobytes(), 34962), "componentType": 5126, "count": len(pos),
                              "type": "VEC3", "min": pos.min(0).tolist(), "max": pos.max(0).tolist()})
            accessors.append({"bufferView": append_bytes(nrm.tobytes(), 34962), "componentType": 5126, "count": len(nrm), "type": "VEC3"})
            accessors.append({"bufferView": append_bytes(uv.tobytes(), 34962), "componentType": 5126, "count": len(uv), "type": "VEC2"})
            if len(pos) < 65536:
                idx_bytes, ctype = idx.astype(np.uint16).tobytes(), 5123
            else:
                idx_bytes, ctype = idx.tobytes(), 5125
            if name == "Floor_Surface":   # keep v2 index format for a byte-identical floor
                idx_bytes, ctype = idx.tobytes(), 5125
            accessors.append({"bufferView": append_bytes(idx_bytes, 34963), "componentType": ctype, "count": len(idx), "type": "SCALAR"})
            gprims.append({"attributes": {"POSITION": a, "NORMAL": a + 1, "TEXCOORD_0": a + 2}, "indices": a + 3,
                           "material": p["material"], "mode": 4})
        meshes_gltf.append({"name": name, "primitives": gprims})
        node = {"name": name, "mesh": len(meshes_gltf) - 1}
        if any(abs(v) > 1e-9 for v in nd["translation"]):
            node["translation"] = [float(v) for v in nd["translation"]]
        if any(abs(a - b) > 1e-9 for a, b in zip(nd["rotation"], [0, 0, 0, 1])):
            node["rotation"] = [float(v) for v in nd["rotation"]]
        nodes_gltf.append(node)
        st = np.vstack(allp)
        report.append({"name": name, "parent": parent, "vertices": verts, "triangles": tris,
                       "materials": [MATERIALS[p["material"]]["name"] for p in prims],
                       "pivot": [round(float(v), 4) for v in nd["translation"]],
                       "rotation_quat": [round(float(v), 6) for v in nd["rotation"]],
                       "local_min": [round(float(x), 4) for x in st.min(0)], "local_max": [round(float(x), 4) for x in st.max(0)]})
        return len(nodes_gltf) - 1

    def walk(d, children, parent):
        for n, nd in d.items():
            if nd.get("group"):
                kids = []
                nodes_gltf.append({"name": n, "children": kids})
                children.append(len(nodes_gltf) - 1)
                walk(nd["children"], kids, n)
            else:
                children.append(add_mesh_node(n, nd, parent))

    walk(nodes, root_children, root_name)
    while len(bin_blob) % 4:
        bin_blob.append(0)
    gltf = {"asset": {"version": "2.0", "generator": f"PortIQ Parametric ISO Container GLB Builder v3.0 ({quality})"},
            "scene": 0, "scenes": [{"name": "Scene", "nodes": [0]}], "nodes": nodes_gltf, "meshes": meshes_gltf,
            "materials": materials, "textures": textures, "images": images, "samplers": samplers,
            "accessors": accessors, "bufferViews": buffer_views, "buffers": [{"byteLength": len(bin_blob)}]}
    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    js += b" " * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(bin_blob)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(bin_blob), 0x004E4942) + bytes(bin_blob))
    return report, total, image_report


def measured_dimensions(nodes):
    """Dimensions measured from generated geometry (not restated from the spec)."""
    steel = {MAT_IDX["Mat_Structural_Dark"], MAT_IDX["Mat_Exterior_Green"]}

    def bounds(names):   # painted steel envelope only (hardware & gasket inserts excluded)
        pts = []
        for n in names:
            for p in nodes[n]["mesh"].build_primitives():
                if p["material"] in steel:
                    pts.append(p["positions"])
        P = np.vstack(pts)
        return P.min(0), P.max(0)
    body = ["Base_Floor", "Corner_Castings", "Corner_Posts", "Rear_Frame", "Left_Side_Wall", "Right_Side_Wall", "Roof_Panel", "Front_End_Wall"]
    lo, hi = bounds(body)
    roof = nodes["Roof_Panel"]["mesh"].parts[MAT_IDX["Mat_Interior_Wall"]]
    lw = nodes["Left_Side_Wall"]["mesh"].parts[MAT_IDX["Mat_Interior_Wall"]]
    rw = nodes["Right_Side_Wall"]["mesh"].parts[MAT_IDX["Mat_Interior_Wall"]]
    fr = nodes["Front_End_Wall"]["mesh"].parts[MAT_IDX["Mat_Interior_Wall"]]
    ceiling = min(float(c[0][:, 1].min()) for c in roof)
    zl = max(float(c[0][:, 2].max()) for c in lw)
    zr = min(float(c[0][:, 2].min()) for c in rw)
    xf = min(float(c[0][:, 0].min()) for c in fr)
    floor_top = float(np.vstack([p["positions"] for p in nodes["Floor_Surface"]["mesh"].build_primitives()])[:, 1].max())
    r = lambda v: round(float(v), 4)
    return {"internal_clear": {"length": r(xf - 0.0), "width": r(zr - zl), "height": r(ceiling - floor_top),
                               "volume_m3": round((xf) * (zr - zl) * (ceiling - floor_top), 3)},
            "external_body": {"length": r(hi[0] - lo[0]), "width": r(hi[2] - lo[2]), "height": r(hi[1] - lo[1])},
            "external_bounds_min": [r(v) for v in lo], "external_bounds_max": [r(v) for v in hi]}


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--door-angle", type=float, default=None,
                    help="build a posed variant (e.g. 0 = closed) into master/variants/ for presentation renders only")
    args = ap.parse_args()
    if args.door_angle is not None:
        spec = dict(SPEC_40FT, door_open_angle_deg=args.door_angle)
        nodes, _ = build_container(spec)
        out = os.path.join(SCRIPT_DIR, "master", "variants", f"{SPEC_40FT['name']}_master_doors{int(args.door_angle)}.glb")
        _, size, _ = export_glb(nodes, out, "master")
        print(f"variant {out} ({size / 1048576:.2f} MB)")
        return
    nodes, layout = build_container(SPEC_40FT)
    out_rt = os.path.join(SCRIPT_DIR, f"{SPEC_40FT['name']}.glb")
    out_ms = os.path.join(SCRIPT_DIR, "master", f"{SPEC_40FT['name']}_master.glb")
    rep, size_rt, img_rt = export_glb(nodes, out_rt, "runtime")
    _, size_ms, img_ms = export_glb(nodes, out_ms, "master")
    dims = measured_dimensions(nodes)
    tv, tt = sum(r["vertices"] for r in rep), sum(r["triangles"] for r in rep)
    full = {
        "asset_name": f"{SPEC_40FT['name']}.glb", "version": "40ft 1.0 (built from 20ft v3 components)",
        "format": "glTF 2.0 Binary (.glb)", "units": "metres",
        "coordinate_system": {"convention": "Right-handed Y-up", "origin": [0.0, 0.0, 0.0],
                              "origin_description": "Internal bottom-left corner at the loading-door threshold",
                              "axes": {"X": "Length 0.000 -> 12.030", "Y": "Height 0.000 (floor top) -> 2.390", "Z": "Width 0.000 -> 2.350"}},
        "specified_dimensions_m": {"internal_clear": {"length": 12.03, "width": 2.35, "height": 2.39, "volume_m3": 67.567},
                                   "external_body": {"length": 12.19, "width": 2.44, "height": 2.59},
                                   "rear_door_clear_opening": {"width": 2.34, "height": 2.28},
                                   "door_open_angle_deg": SPEC_40FT["door_open_angle_deg"]},
        "measured_dimensions_m": dims,
        "uv_texel_density": {"painted_steel_m_per_tile": TILE_PAINT, "hardware_m_per_tile": TILE_HW,
                             "corrugated_panels": "continuous arc-length UVs (one parameterisation per panel surface)"},
        "smoothing": {"cylinder_segments": CYL_SEGS, "rounded_bevel_segments": "2 on structure, 1 on small brackets", "corrugation": "hard edges (flat facets)"},
        "layout": layout,
        "totals": {"mesh_nodes": len(rep), "vertices": tv, "triangles": tt,
                   "runtime_glb_bytes": size_rt, "runtime_glb_mb": round(size_rt / 1048576, 2),
                   "master_glb_bytes": size_ms, "master_glb_mb": round(size_ms / 1048576, 2)},
        "runtime_images": img_rt, "master_images": img_ms, "hierarchy": rep,
    }
    with open(os.path.join(SCRIPT_DIR, "container_40ft_report.json"), "w", encoding="utf-8") as f:
        json.dump(full, f, indent=2)
    print(f"runtime {out_rt} {size_rt / 1048576:.2f} MB | master {size_ms / 1048576:.2f} MB | {tv} verts | {tt} tris | {len(rep)} mesh nodes")
    print("measured:", json.dumps(dims))


if __name__ == "__main__":
    main()
