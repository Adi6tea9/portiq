# PortIQ — 20 FT Standard Dry Container · v3 (Quality Pass 2)

A refinement of the v2 asset, not a redesign. Dimensions, coordinate system, node names and hierarchy, door pivots and the 200° open pose, the marking architecture and the **wooden floor** are all preserved. `validate_v3.py` checks each of these against the v2 GLB.

## What changed vs v2

| Area | v2 | v3 |
|---|---|---|
| Corrugated UVs | Each facet got its own 0..1-style UV patch, so UVs jump at every corrugation edge | One continuous arc-length UV per panel surface, 1.6 m per tile on walls, roof, front wall and interior. Max UV jump 0.0, texel-density spread 0.0 % |
| Other surfaces | Each face starts at UV (0,0) | World-planar UVs at the same texel density; door UVs are computed in door space, so the texture moves with the door |
| Exterior paint | Metallic map 0.20–0.80 (mean 0.28), which looked plastic/metallic | Dielectric paint: metallic 0.02, roughness 0.57–0.72 (p5–p95). Orange-peel normal, faint mottling and streaks, a few tiny chips. #123D2E base |
| Interior | Albedo only, shared exterior normal/AO | Own albedo + ORM + normal: flat-satin muted grey-green #626C67 (roughness 0.60–0.75, so rib edges don't glint), cargo scuffs, metallic ≈0.05. Lashing points on the floor-level and top side rails; pressed stiffeners on the door liners |
| Hardware | Flat grey factor-only material | Galvanised-steel maps: metallic ≈0.92, roughness 0.25–0.44, spangle normal |
| Bevels | Chamfered boxes with 8 open corner holes each | Watertight rounded-bevel boxes, smooth edge normals with flat faces (weighted-normal look) |
| Cylinders | 12 segments, caps silently dropped (open tubes) | 28 segments, bevelled rims, real caps; bolt heads on brackets and hinges |
| Rear-door decal | Flat quad floating 4.5–8.5 mm off the door | Stepped onto the pressed ribs, 1.2 mm stand-off; same footprint and UVs |
| CSC plate | Bridged a door rib, floated 5.5 mm | Sits on the skin between ribs 1 and 2, with rivets matching the artwork's corner circles |
| Casting apertures | Rectangles | Oval ISO-1161-style apertures on the side, end and top/bottom faces |
| Marking textures | 2048 masters only, dark fringe risk | Masters 4096×2048 / 4096×4096 / 2048×1360. Runtime: side and owner 4096×2048 (2× v2 resolution, sharp at 1.5 m in a browser), rear doors 2048², CSC 1024×680. Alpha-bled edges (no halos) |
| Wood floor | — | **Unchanged**: geometry, UVs, indices, material values, master PNGs and runtime JPEG bytes are identical to v2 |

## Files

```text
container_20ft_standard/
├── container_20ft_standard.glb          # WEB RUNTIME (7.55 MB, 60k tris, 20 mesh nodes)
├── container_20ft_report.json           # measured dimensions, hierarchy, per-node stats, image hashes
├── validation_report.json               # output of validate_v3.py (16/16 pass)
├── viewer.html                          # three.js check viewer with wall/roof/marking toggles
├── generate_pbr_textures.py             # steel exterior / interior / hardware maps (never touches wood)
├── generate_markings.py                 # markings.json -> SVG -> master + runtime PNGs
├── generate_container.py                # geometry + runtime GLB + master GLB + report
├── build_blender_project.py             # imports master GLB -> .blend, Cycles previews
├── validate_v3.py                       # v2-vs-v3 validation
├── glb_io.py                            # tiny GLB reader used by the two scripts above
├── master/
│   ├── container_20ft_standard.blend        # EDITABLE BLENDER SOURCE (textures packed, render setup)
│   └── container_20ft_standard_master.glb   # master GLB: lossless 2K maps, 4K markings
├── textures/                            # MASTER maps (PNG)
│   ├── steel_ext_{albedo,normal,mr,ao,orm}_2k.png
│   ├── steel_int_{albedo,normal,mr,ao,orm}_2k.png
│   ├── steel_hw_{albedo,normal,mr,ao,orm}_1k.png
│   ├── wood_floor_*_2k.png              # byte-identical copies of v2
│   └── runtime/                         # WEB maps (JPEG) as embedded in the runtime GLB
│       ├── steel_ext_*_2k.jpg, steel_int_albedo_2k.jpg, steel_int_{orm,normal}_1k.jpg, steel_hw_*_1k.jpg
│       └── v2_wood_*_1k.jpg             # the exact JPEG bytes from the v2 GLB
├── markings/
│   ├── markings.json  side_panel.svg  side_owner.svg  rear_doors.svg  csc_plate.svg
│   └── textures/{master,runtime}/*.png
└── previews/  (2560×1440, Cycles, OpenImageDenoise, AgX)
    ├── preview_20ft_front.png  preview_20ft_side.png  preview_20ft_perspective.png
    ├── preview_20ft_side_cutaway.png  preview_20ft_closeup_side_markings.png
    ├── preview_20ft_closeup_exterior_material.png
    ├── preview_20ft_closeup_rear_door_markings.png  preview_20ft_closeup_rear_door_csc.png
    └── compare_v2_perspective.png  compare_v2_closeup_exterior_material.png   # v2 under the same setup
```

ORM maps pack AO into R, roughness into G and metallic into B, so the runtime GLB uses one image for both `metallicRoughnessTexture` and `occlusionTexture`.

## Rebuild

Needs Python 3.10+ with `numpy pillow scipy`, and Blender 4.2 LTS+ for the `.blend` and renders.

```bash
python generate_pbr_textures.py          # ~1 min; steel maps only
python generate_markings.py              # ~3 min; edit markings/markings.json first if needed
python generate_container.py             # runtime + master GLB + report
python validate_v3.py                    # must print ALL CHECKS PASSED
blender --background --python build_blender_project.py              # .blend + open-door previews
python generate_container.py --door-angle 0                         # closed-door variant (renders only)
blender --background --python build_blender_project.py -- --glb master/variants/container_20ft_standard_master_doors0.glb --variant closed --out-blend none
```

Editing markings works the same way as in v2. Change `markings/markings.json` (or edit an SVG and run `generate_markings.py --from-svg`), then run `generate_container.py`. The SVG `viewBox` coordinates are the v2 layout; only the `width`/`height` (raster size) went up. Keep them as they are.

## Coordinate system and hierarchy (unchanged)

Units are metres; right-handed, Y-up. The origin is the internal bottom-left corner at the rear door threshold. +X is length, +Y is height (floor top = 0) and +Z is width.

Measured from the generated geometry:
- **Internal:** 5.900 × 2.350 × 2.390 m (33.137 m³)
- **External painted-steel envelope:** 6.060 × 2.440 × 2.590 m

| Parent / node | v2 tris | v3 tris | materials |
|---|---:|---:|---|
| Base_Floor | 608 | 6,200 | Structural_Dark, Interior_Wall, Hardware_Steel, Rubber_Gasket |
| Floor_Surface | 12 | 12 | Wood_Floor (identical) |
| Corner_Castings | 320 | 2,784 | Structural_Dark, Rubber_Gasket |
| Corner_Posts | 324 | 7,180 | Structural_Dark, Interior_Wall, Hardware_Steel |
| Rear_Frame | 204 | 4,884 | Structural_Dark, Hardware_Steel, Rubber_Gasket |
| Left_Side_Wall / Right_Side_Wall | 840 / 840 | 840 / 840 | Exterior_Green, Interior_Wall |
| Roof_Panel | 1,120 | 1,120 | Exterior_Green, Interior_Wall |
| Front_End_Wall | 200 | 200 | Exterior_Green, Interior_Wall |
| Rear_Door_Left / Rear_Door_Right | 396 / 396 | 4,656 / 4,656 | Exterior_Green, Structural_Dark, Interior_Wall, Rubber_Gasket |
| Locking_Rods | 720 | 14,832 | Structural_Dark, Hardware_Steel |
| Hinges | 672 | 10,656 | Structural_Dark, Hardware_Steel |
| Exterior_Marking_Side / Owner (L+R, 4 nodes) | 4 × 198 | 4 × 198 | Decal_Side_Panel / Decal_Side_Owner |
| Door_Marking_Decals / Rear_Door_Marking | 4 | 212 | Decal_Rear_Doors |
| CSC_Plate / CSC_Plate_Geometry, CSC_Plate_Marking | 12, 2 | 476, 2 | CSC_Steel, Decal_CSC_Plate |
| **Total** | **7,462** | **60,342** | 11 materials, 17 images |

Most of the added triangles are in small hardware (rods, hinges, bolts). The large flat panels did not get any extra triangles. 60k triangles renders comfortably in WebGL.

Runtime toggles work as in v2. Hide `Left_Side_Wall` together with `Exterior_Marking_Side_Left` and `Exterior_Marking_Owner_Left` for a cutaway; hide `Roof_Panel` for top-down loading. `Exterior_Marking_Decals`, `Door_Marking_Decals` and `CSC_Plate` toggle as groups.

## Using it on the website

- Load `container_20ft_standard.glb` with three.js `GLTFLoader` (or R3F `useGLTF`, or Babylon). Everything is standard glTF 2.0 with no extensions, so no decoder setup is needed.
- For lettering that stays sharp at grazing angles, set `texture.anisotropy = renderer.capabilities.getMaxAnisotropy()` on the decal `map`s; `viewer.html` shows how.
- Use `renderer.toneMapping = THREE.AgXToneMapping` (or ACES) plus an environment map such as `RoomEnvironment` or an HDRI. PBR steel looks flat without one.
- GPU texture memory is about 240 MB with mipmaps (uncompressed RGBA). The two 4096×2048 side decals account for about 85 MB of that. If you target low-end phones, downscale `markings/textures/runtime/side_*.png` to 2048×1024 and rerun `generate_container.py`.

## Known limitations (inherited from v2, left as-is on purpose)

- `Locking_Rods`, `Hinges`, `Rear_Door_Marking` and `CSC_Plate` are baked in world space at the 200° open pose. Only `Rear_Door_Left` and `Rear_Door_Right` carry the hinge transform. If you animate the door nodes alone, the rods, decal and plate stay behind. Fixing this means splitting those nodes per door, which changes the hierarchy, so it was not done in a refinement pass. The closed-door close-ups use the generator's own `--door-angle 0` build of the same model instead.
- At 200° the door exteriors face the side walls, which is why the rear-markings previews use the closed-door build.
- Runtime textures are JPEG/PNG, which every glTF viewer supports. KTX2/Basis would need `gltf-transform` or `toktx`, which were not available here. Running `gltf-transform uastc` on the runtime GLB later is a drop-in step.
