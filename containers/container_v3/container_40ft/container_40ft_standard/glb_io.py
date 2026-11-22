"""Minimal GLB reader shared by generate_container.py (v2 wood passthrough) and validate_v3.py."""
import json
import struct
import zipfile

import numpy as np

COMP = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def read_glb_bytes(data):
    magic, version, total = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67 and version == 2, "not a glTF 2.0 GLB"
    assert total == len(data), f"GLB header length {total} != file length {len(data)}"
    jlen, jtype = struct.unpack_from("<II", data, 12)
    assert jtype == 0x4E4F534A
    gltf = json.loads(data[20:20 + jlen])
    off = 20 + jlen
    blen, btype = struct.unpack_from("<II", data, off)
    assert btype == 0x004E4942
    return gltf, data[off + 8: off + 8 + blen]


def read_glb(path):
    """Path to a .glb, or 'archive.zip::member.glb'."""
    if "::" in path:
        zpath, member = path.split("::", 1)
        with zipfile.ZipFile(zpath) as z:
            return read_glb_bytes(z.read(member))
    with open(path, "rb") as f:
        return read_glb_bytes(f.read())


def view_bytes(gltf, binb, bv_index):
    bv = gltf["bufferViews"][bv_index]
    o = bv.get("byteOffset", 0)
    return binb[o:o + bv["byteLength"]]


def accessor(gltf, binb, acc_index):
    acc = gltf["accessors"][acc_index]
    raw = view_bytes(gltf, binb, acc["bufferView"])
    arr = np.frombuffer(raw, dtype=COMP[acc["componentType"]], count=acc["count"] * NCOMP[acc["type"]],
                        offset=acc.get("byteOffset", 0))
    return arr.reshape(acc["count"], NCOMP[acc["type"]]) if NCOMP[acc["type"]] > 1 else arr


def image_bytes(gltf, binb, name):
    for img in gltf["images"]:
        if img.get("name") == name:
            return view_bytes(gltf, binb, img["bufferView"]), img["mimeType"]
    raise KeyError(name)


def mesh_by_node(gltf, node_name):
    for n in gltf["nodes"]:
        if n.get("name") == node_name and "mesh" in n:
            return gltf["meshes"][n["mesh"]]
    raise KeyError(node_name)
