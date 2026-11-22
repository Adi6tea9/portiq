#!/usr/bin/env python3
"""
PortIQ 40 FT container — editable Blender master project + Cycles preview renders (v3)
=====================================================================================
Run with Blender 4.2 LTS or newer:

  blender --background --python build_blender_project.py -- [options]

    --glb PATH        GLB to import (default: master/container_40ft_standard_master.glb)
    --out-blend PATH  where to save the .blend (default: master/container_40ft_standard.blend;
                      'none' to skip saving)
    --renders LIST    comma list of shots or 'all' (default) or 'none'
    --scale PCT       render resolution percentage (default 100 -> 2560x1440)
    --samples N       max Cycles samples (default 384, adaptive + OpenImageDenoise)
    --prefix STR      output filename prefix in previews/ (default preview_40ft_)
    --variant NAME    'open' (default) or 'closed': which shot set 'all' renders

Scene: Cycles (GPU when available), AgX colour management, Blender's bundled studio
HDRI for reflections, three soft area lights, shadow-catcher ground composited over a
neutral studio backdrop. The container hierarchy from the GLB is kept as-is under
Container_Root; lights/cameras/ground live in a separate 'Render_Setup' collection.
Blender is Z-up: glTF (x, y, z) -> Blender (x, -z, y). Shots are defined in glTF coords.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))


def arg(name, default):
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return argv[argv.index(name) + 1] if name in argv else default


GLB = arg("--glb", os.path.join(HERE, "master", "container_40ft_standard_master.glb"))
OUT_BLEND = arg("--out-blend", os.path.join(HERE, "master", "container_40ft_standard.blend"))
RENDERS = arg("--renders", "all")
SCALE = int(arg("--scale", "100"))
SAMPLES = int(arg("--samples", "384"))
PREFIX = arg("--prefix", "preview_40ft_")
VARIANT = arg("--variant", "open")      # 'closed' when --glb is the doors-closed variant
PREVIEW_DIR = os.path.join(HERE, "previews")


def g2b(x, y, z):
    return Vector((x, -z, y))


# shot: camera position & target in glTF coords (metres), focal length mm, hidden nodes
SHOTS = {
    "perspective": {"cam": (-8.6, 3.5, -12.0), "target": (5.0, 0.9, 0.8), "lens": 42},
    "front": {"cam": (-9.2, 1.45, 1.175), "target": (2.0, 1.15, 1.175), "lens": 38},
    "side": {"cam": (6.015, 1.25, -21.5), "target": (6.015, 1.2, 1.175), "lens": 50},
    "side_cutaway": {"cam": (6.015, 1.6, -16.5), "target": (6.015, 1.05, 1.175), "lens": 40,
                     "hide": ["Left_Side_Wall", "Exterior_Marking_Side_Left", "Exterior_Marking_Owner_Left"]},
    "closeup_side_markings": {"cam": (5.3, 1.55, -2.9), "target": (6.1, 1.45, 0.0), "lens": 45},
    "closeup_side_id": {"cam": (1.9, 1.9, -2.6), "target": (1.45, 1.82, 0.0), "lens": 45},
    "closeup_exterior_material": {"cam": (10.68, 2.05, -1.05), "target": (11.88, 2.2, -0.05), "lens": 50},
    "closeup_corner_casting": {"cam": (12.85, 0.32, -0.95), "target": (12.02, -0.06, 0.02), "lens": 50},
    # closed-door pose (variant GLB built by `generate_container_40ft.py --door-angle 0`): at the default
    # 200 deg the door exteriors face the side walls, so the rear markings are shot with doors shut
    "closeup_rear_door_markings": {"cam": (-4.3, 1.40, 0.15), "target": (-0.09, 1.16, 1.175), "lens": 38, "variant": "closed"},
    "closeup_rear_door_csc": {"cam": (-1.15, 0.72, 0.28), "target": (-0.09, 0.47, 0.64), "lens": 50, "variant": "closed"},
}


def reset_and_import():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB, merge_vertices=False, import_shading="NORMALS")
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.unit_settings.scale_length = 1.0
    for img in bpy.data.images:          # keep everything self-contained in the .blend
        if img.source == "FILE" and not img.packed_file:
            img.pack()


def tune_materials():
    """Small renderer-side touches that keep the glTF material values intact."""
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        for n in mat.node_tree.nodes:
            if n.type == "TEX_IMAGE":
                n.interpolation = "Cubic" if mat.name.startswith("Mat_Decal") else "Linear"


def setup_render_scene():
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    device = "CPU"
    for backend in ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL"):
        try:
            prefs.compute_device_type = backend
            prefs.refresh_devices()
            gpus = [d for d in prefs.devices if d.type == backend]
            if gpus:
                for d in prefs.devices:
                    d.use = d.type == backend
                device = "GPU"
                print(f"[render] using {backend}: {[d.name for d in gpus]}")
                break
        except TypeError:
            continue
    sc.cycles.device = device
    sc.cycles.samples = SAMPLES
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.008
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.cycles.max_bounces = 10
    sc.cycles.glossy_bounces = 6
    sc.cycles.transparent_max_bounces = 16
    sc.cycles.blur_glossy = 0.5
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.render.resolution_x, sc.render.resolution_y = 2560, 1440
    sc.render.resolution_percentage = SCALE
    sc.render.filter_size = 1.2                      # pixel filter (anti-aliasing)
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.render.image_settings.color_depth = "8"
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    sc.view_settings.exposure = 0.0
    sc.display_settings.display_device = "sRGB"

    col = bpy.data.collections.new("Render_Setup")
    sc.collection.children.link(col)

    # World: bundled studio HDRI (reflections & ambient), neutral to camera rays
    world = bpy.data.worlds.new("Studio_World")
    sc.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    hdri = os.path.join(bpy.utils.resource_path("LOCAL"), "datafiles", "studiolights", "world", "studio.exr")
    env.image = bpy.data.images.load(hdri)
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Rotation"].default_value[2] = math.radians(115)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 0.55
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(tc.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], env.inputs["Vector"])
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])

    def area(name, loc_g, target_g, size, energy, color):
        ld = bpy.data.lights.new(name, "AREA")
        ld.shape = "RECTANGLE"
        ld.size, ld.size_y = size
        ld.energy = energy
        ld.color = color
        ob = bpy.data.objects.new(name, ld)
        col.objects.link(ob)
        ob.location = g2b(*loc_g)
        d = g2b(*target_g) - ob.location
        ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        return ob

    area("Key_Light", (-3.0, 8.5, -9.0), (5.7, 0.8, 1.0), (7.0, 4.5), 2600, (1.0, 0.97, 0.93))
    area("Fill_Light", (15.6, 4.0, -6.0), (5.7, 1.0, 1.0), (7.0, 5.0), 520, (0.92, 0.96, 1.0))
    area("Top_Soft", (6.0, 9.0, 1.2), (6.0, 0.0, 1.2), (14.0, 5.0), 1050, (1.0, 1.0, 1.0))
    area("Rim_Light", (-4.0, 4.0, 7.5), (5.7, 1.0, 1.2), (5.0, 3.0), 380, (0.95, 0.97, 1.0))

    # Shadow-catcher ground at the casting bottoms (y = -0.145)
    bpy.ops.mesh.primitive_plane_add(size=120, location=g2b(6.0, -0.145, 1.2))
    ground = bpy.context.active_object
    ground.name = "Ground_ShadowCatcher"
    ground.is_shadow_catcher = True
    for c in ground.users_collection:
        c.objects.unlink(ground)
    col.objects.link(ground)

    # Compositor: denoised render over a soft studio backdrop
    sc.use_nodes = True
    ct = sc.node_tree
    ct.nodes.clear()
    rl = ct.nodes.new("CompositorNodeRLayers")
    rgb = ct.nodes.new("CompositorNodeRGB")
    rgb.outputs[0].default_value = (0.74, 0.76, 0.78, 1.0)     # linear -> light neutral grey after AgX
    over = ct.nodes.new("CompositorNodeAlphaOver")
    comp = ct.nodes.new("CompositorNodeComposite")
    ct.links.new(rgb.outputs[0], over.inputs[1])
    ct.links.new(rl.outputs["Image"], over.inputs[2])
    ct.links.new(over.outputs[0], comp.inputs["Image"])

    cams = {}
    for name, s in SHOTS.items():
        cd = bpy.data.cameras.new(f"CAM_{name}")
        cd.lens = s["lens"]
        cd.sensor_width = 36
        cd.clip_start = 0.02
        ob = bpy.data.objects.new(f"CAM_{name}", cd)
        col.objects.link(ob)
        ob.location = g2b(*s["cam"])
        ob.rotation_euler = (g2b(*s["target"]) - ob.location).to_track_quat("-Z", "Y").to_euler()
        cams[name] = ob
    sc.camera = cams["perspective"]
    return cams


def set_hidden(names, hidden):
    for n in names:
        ob = bpy.data.objects.get(n)
        if ob:
            ob.hide_render = hidden
            ob.hide_viewport = hidden


def render(cams, shots):
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    sc = bpy.context.scene
    for name in shots:
        s = SHOTS[name]
        set_hidden(s.get("hide", []), True)
        sc.camera = cams[name]
        sc.render.filepath = os.path.join(PREVIEW_DIR, f"{PREFIX}{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"[render] {sc.render.filepath}")
        set_hidden(s.get("hide", []), False)
    sc.camera = cams["perspective"]


def main():
    reset_and_import()
    tune_materials()
    cams = setup_render_scene()
    if OUT_BLEND.lower() != "none":
        os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, compress=True)
        print(f"[OK] saved {OUT_BLEND}")
    if RENDERS != "none":
        shots = [n for n, s in SHOTS.items() if s.get("variant", "open") == VARIANT] if RENDERS == "all" else RENDERS.split(",")
        render(cams, shots)


main()
