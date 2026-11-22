# PortIQ — 40 FT Standard Dry Container (ISO 42G1)

This is the companion asset to the upgraded 20 FT model in `../../container_20ft_standard`. It was built with the same parametric generator and the same components, so the two look like products of the same manufacturer. It was not made by stretching the 20 FT GLB. The geometry is regenerated at 40 FT length: the corrugations, cross-members and lashing points repeat at the same physical pitch, and the floor texture tiles at the same scale.

The 20 FT files were not modified.

## Specifications (measured from the generated geometry)

| | Value |
|---|---|
| Internal clear L × W × H | **12.030 × 2.350 × 2.390 m** |
| Internal volume | 67.57 m³ |
| External L × W × H | **12.190 × 2.440 × 2.590 m** (standard height, **not** high cube; high cube would be 2.896 m) |
| Rear door clear opening W × H | 2.340 × 2.280 m |
| Doors | Separate left/right nodes, open 200° (same pivots as the 20 FT) |
| Size/type code | 42G1 |
| Coordinates | Right-handed, Y-up, metres. Origin is the internal bottom-left corner at the door threshold. X 0→12.030 (length), Y 0→2.390 (height), Z 0→2.350 (width). Identical to the 20 FT |

All values are configurable in `SPEC_40FT` at the top of `generate_container_40ft.py`. The weights in `markings/markings.json` are demonstration values (labelled "CONFIGURABLE DEMO WEIGHTS" on the doors), not certified figures. The CSC plate says "DEMO / SAMPLE ONLY — NOT CERTIFIED".

## What was reused from the 20 FT and what changed

**Reused unchanged:**
- **Geometry code** (MeshBuilder):
  - rounded-bevel boxes, 28-segment capped cylinders
  - corrugated walls and roof with continuous arc-length UVs (1.6 m per tile)
  - the door assembly with rods, handles, hinges and gaskets
  - the stepped door decal and the CSC plate
  - lashing points, oval casting apertures
  - the floor box code, GLB export, closed-door variant
- **All PBR maps**, byte-identical copies:
  - painted steel #123D2E, structural #0D3025
  - interior grey-green #626C67 (the colour the 20 FT uses now)
  - galvanised hardware
  - the wooden floor
- **All 11 materials:** names, factors, normal/AO strengths and samplers.
- **Marking pipeline:** the same layout, typography, colours and texture resolutions.
- **Supporting scripts:** the Blender project/render script, the GLB reader and `viewer.html`.

**40 FT-specific changes:**
- Internal length 12.030 m. The side walls have 43 corrugations at a 0.280 m pitch (the 20 FT has 21 at 0.281 m), with the same 40 mm depth.
- No forklift pockets, since real 40 FT boxes don't have them.
- 16 lashing points per rail instead of 8.
- The side and owner decals keep the 20 FT decal size (5.46 × 2.10 m), so the lettering is just as sharp. The ID and slogan sit at the door end and the PortIQ logo is centred on the wall. The right wall mirrors this, as on the 20 FT.
- Markings: PRTQU 000401 **1** (ISO 6346 check digit computed), 42G1, 40 FT demo weights (tare 3,750 kg, payload 26,730 kg, 67.6 m³), and CSC ID `PRTQ-DEMO-40FT-001`. `nominal_length` in `markings.json` drives the "STANDARD 40FT DRY CARGO" line.
- **Bottom side rails now run the full length to the corner castings.** The 20 FT, inherited from v2, has a gap of about 10 cm at each bottom corner where the floor edge shows. It is fixed here; see Known issues.

## Files

```text
container_40ft_standard/
├── container_40ft_standard.glb        # WEB RUNTIME — 8.07 MB, 72.6k tris, 20 mesh nodes
├── container_40ft_report.json         # measured dimensions, hierarchy, per-node stats, image hashes
├── validation_report.json             # validate_40ft.py output (16/16 pass)
├── generate_container_40ft.py         # parametric generator (spec at the top)
├── generate_markings.py               # markings.json -> SVG -> master + runtime PNGs
├── generate_pbr_textures.py           # same as 20 FT (maps are already present; only rerun to change them)
├── build_blender_project.py           # master GLB -> .blend + Cycles previews
├── validate_40ft.py                   # checks against the 20 FT reference
├── glb_io.py  viewer.html             # GLB reader / three.js check viewer
├── master/
│   ├── container_40ft_standard.blend          # EDITABLE BLENDER MASTER (textures packed, studio + cameras)
│   ├── container_40ft_standard_master.glb     # lossless 2K maps, 4K markings
│   └── variants/…_doors0.glb                  # closed-door build used only for the rear-marking close-ups
├── textures/            # master PNG maps (2K steel/interior/wood, 1K hardware) + runtime/ JPEGs
├── markings/            # markings.json, side_panel.svg, side_owner.svg, rear_doors.svg, csc_plate.svg
│   └── textures/{master,runtime}/side_panel.png, side_owner.png, rear_doors.png, csc_plate.png
└── previews/            # 2560×1440, Cycles + OpenImageDenoise, AgX
    ├── preview_40ft_front.png  preview_40ft_side_cutaway.png  preview_40ft_perspective.png
    ├── preview_40ft_side.png
    ├── preview_40ft_closeup_exterior_material.png  preview_40ft_closeup_corner_casting.png
    ├── preview_40ft_closeup_side_markings.png  preview_40ft_closeup_side_id.png
    └── preview_40ft_closeup_rear_door_markings.png  preview_40ft_closeup_rear_door_csc.png
```

## Rebuild

Needs Python 3.10+ with `numpy pillow scipy`, and Blender 4.2 LTS+ for the `.blend` and renders.

```bash
python generate_markings.py                 # after editing markings/markings.json
python generate_container_40ft.py           # runtime + master GLB + report
python validate_40ft.py                     # must print ALL CHECKS PASSED
blender --background --python build_blender_project.py
python generate_container_40ft.py --door-angle 0
blender --background --python build_blender_project.py -- --glb master/variants/container_40ft_standard_master_doors0.glb --variant closed --out-blend none
```

## Hierarchy (identical names and parents to the 20 FT)

| Parent / node | Triangles | Materials |
|---|---:|---|
| Base_Floor | 11,096 | Structural_Dark, Interior_Wall, Hardware_Steel |
| Floor_Surface | 12 | Wood_Floor |
| Corner_Castings | 2,784 | Structural_Dark, Rubber_Gasket |
| Corner_Posts | 11,660 | Structural_Dark, Interior_Wall, Hardware_Steel |
| Rear_Frame | 4,884 | Structural_Dark, Hardware_Steel, Rubber_Gasket |
| Left_Side_Wall / Right_Side_Wall | 1,720 / 1,720 | Exterior_Green, Interior_Wall |
| Roof_Panel | 2,280 | Exterior_Green, Interior_Wall |
| Front_End_Wall | 200 | Exterior_Green, Interior_Wall |
| Rear_Door_Left / Rear_Door_Right | 4,656 / 4,656 | Exterior_Green, Structural_Dark, Interior_Wall, Rubber_Gasket |
| Locking_Rods | 14,832 | Structural_Dark, Hardware_Steel |
| Hinges | 10,656 | Structural_Dark, Hardware_Steel |
| Exterior_Marking_Decals / Exterior_Marking_Side / _Side_Left, _Side_Right | 198 each | Decal_Side_Panel |
| Exterior_Marking_Decals / Exterior_Marking_Owner / _Owner_Left, _Owner_Right | 196 each | Decal_Side_Owner |
| Door_Marking_Decals / Rear_Door_Marking | 212 | Decal_Rear_Doors |
| CSC_Plate / CSC_Plate_Geometry, CSC_Plate_Marking | 476, 2 | CSC_Steel, Decal_CSC_Plate |
| **Total** | **72,634** | 11 materials, 17 images |

Each side wall, the roof, each rear door, `Exterior_Marking_Decals`, `Door_Marking_Decals` and `CSC_Plate` is a separate node that can be hidden on its own. `viewer.html` (three.js r160) has toggles for them. The toggles were exercised on the 20 FT, which has the same node structure; on the 40 FT only the load was checked.

## Validation (`validate_40ft.py`, all computed from the files)

16/16 pass:
- GLB structure (runtime and master)
- Hierarchy and all 11 materials identical to the 20 FT
- Runtime and master wood images byte-identical, and the floor UV scale identical (2.941 / 2.381 m per UV), so the floor is not stretched
- All 13 non-marking maps byte-identical
- Dimensions as specified, not a high cube
- Door assembly geometry byte-identical to the 20 FT
- Cross-section identical (0.0 mm difference)
- Corrugation pitch and depth match
- UVs continuous (zero jump, 1.6 m per tile)
- 78 door-hardware footprints clear of markings
- Side decal layers never overlap on either wall

The runtime GLB was also loaded in three.js: 11 materials, no missing textures, no console errors.

## Using it on the website

It works the same way as the 20 FT: standard glTF 2.0 with no extensions. Set `texture.anisotropy` to the maximum on the decal maps, and use AgX or ACES tone mapping plus an environment map. GPU texture memory is about 240 MB uncompressed, the same as the 20 FT. Both containers share every steel and wood map, so loading both in one scene can share those textures.

## Known issues

- **Inherited from v2/20 FT, left as-is:** `Locking_Rods`, `Hinges`, `Rear_Door_Marking` and `CSC_Plate` are baked at the 200° open pose. Rotating only the door nodes leaves them behind.
- **20 FT defects found while building this (20 FT files untouched, as requested):**
  1. The bottom side rails stop about 10 cm short of the corner castings, so the floor edge is visible at all four bottom corners. Fixed in this 40 FT.
  2. The 20 FT ID check digit is `0` but ISO 6346 gives `6` for PRTQU 000201.
- No gooseneck tunnel. Many 40 FT boxes have one, but it wasn't in the brief.
