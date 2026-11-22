#!/usr/bin/env python3
"""
PortIQ Shipping Container — Editable Markings Generator (v3)
============================================================
Reads `markings/markings.json`, generates editable SVG artwork files, and
rasterizes them into transparent PNG textures:

  markings/textures/master/   close-up masters (side & owner 4096x2048,
                              rear doors 4096x4096, CSC plate 2048x1360)
  markings/textures/runtime/  web runtime copies embedded in the GLB
                              (4096x2048, 4096x2048, 2048x2048, 1024x680)

The SVG layout coordinates (viewBox) are identical to v2, so the decal meshes and
their UVs do not change; only the raster resolution goes up. Transparent pixels get
their colour bled from neighbouring ink so GPU filtering/mipmaps never produce dark
fringes around lettering.

Usage:
  python generate_markings.py            # Update SVGs from markings.json + render PNGs
  python generate_markings.py --from-svg # Skip JSON->SVG step; render directly from edited SVGs
"""
import argparse
import json
import os
import re
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape as xml_escape
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MARKINGS_DIR = os.path.join(SCRIPT_DIR, "markings")
TEX_DIR = os.path.join(MARKINGS_DIR, "textures")
MASTER_DIR = os.path.join(TEX_DIR, "master")
RUNTIME_DIR = os.path.join(TEX_DIR, "runtime")
JSON_PATH = os.path.join(MARKINGS_DIR, "markings.json")

# name -> (viewBox w, h, master w, h, runtime w, h)
SIZES = {
    "side_panel": (2048, 1024, 4096, 2048, 4096, 2048),
    "side_owner": (2048, 1024, 4096, 2048, 4096, 2048),
    "rear_doors": (2048, 2048, 4096, 4096, 2048, 2048),
    "csc_plate":  (1024, 680,  2048, 1360, 1024, 680),
}


def svg_open(name):
    vw, vh, mw, mh, _, _ = SIZES[name]
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{mw}" height="{mh}" viewBox="0 0 {vw} {vh}">'

FONT_CANDIDATES = {
    "condensed": [
        "/usr/share/fonts/truetype/liberation/LiberationSansNarrow-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf",
        "/usr/share/fonts/opentype/urw-base35/NimbusSansNarrow-Bold.otf",
        "C:/Windows/Fonts/arialnb.ttf",
        "C:/Windows/Fonts/bahnschrift.ttf",
        "C:/Windows/Fonts/impact.ttf",
    ],
    "bold": [
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/opentype/urw-base35/NimbusSans-Bold.otf",
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/segoeuib.ttf",
    ],
    "mono": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf",
        "C:/Windows/Fonts/consolab.ttf",
        "C:/Windows/Fonts/courbd.ttf",
    ],
}

def load_font(style="condensed", size=48):
    for path in FONT_CANDIDATES.get(style, FONT_CANDIDATES["bold"]):
        if os.path.exists(path):
            return ImageFont.truetype(path, int(round(size)))
    for group in FONT_CANDIDATES.values():
        for path in group:
            if os.path.exists(path):
                return ImageFont.truetype(path, int(round(size)))
    return ImageFont.load_default()

def parse_color(col_str, opacity=1.0):
    if not col_str or col_str.lower() == "none":
        return None
    col_str = col_str.strip()
    if col_str.startswith("#"):
        h = col_str.lstrip("#")
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        a = int(round(max(0.0, min(1.0, float(opacity))) * 255))
        return (r, g, b, a)
    return (240, 244, 242, int(round(float(opacity) * 255)))

def build_side_panel_svg(cfg):
    cid = cfg["container_id"]
    owner_code = xml_escape(f"{cid['owner_code']}{cid.get('equipment_category', 'U')}")
    serial = xml_escape(str(cid["serial_number"]))
    check = xml_escape(str(cid["check_digit"]))
    size_code = xml_escape(str(cfg["size_type_code"]))
    custom_msg = xml_escape(str(cfg.get("custom_side_text", "")).upper())
    ink = xml_escape(cfg["owner_operator"].get("accent_color", "#EEF2F0"))
    bar = xml_escape(cfg["owner_operator"].get("brand_accent_bar", "#CDAA7B"))

    # Upper-right quadrant strictly x >= 1220 (zero overlap with Owner Logo in x <= 1080)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
{svg_open("side_panel")}
  <!-- Transparent background; all text elements remain directly editable -->
  <g id="ISO_Identification_Block">
    <text x="1220" y="185" font-family="condensed" font-size="96" font-weight="bold" fill="{ink}" letter-spacing="3">{owner_code}  {serial}</text>
    <rect x="1875" y="102" width="92" height="102" fill="none" stroke="{ink}" stroke-width="7"/>
    <text x="1921" y="184" font-family="condensed" font-size="92" font-weight="bold" fill="{ink}" text-anchor="middle">{check}</text>

    <text x="1220" y="305" font-family="condensed" font-size="92" font-weight="bold" fill="{ink}" letter-spacing="5">{size_code}</text>
    <rect x="1500" y="236" width="210" height="64" fill="none" stroke="{bar}" stroke-width="5"/>
    <text x="1605" y="282" font-family="mono" font-size="36" font-weight="bold" fill="{bar}" text-anchor="middle">DEMO ID</text>
  </g>

  <g id="Custom_Side_Message">
    <line x1="80" y1="745" x2="1968" y2="745" stroke="{bar}" stroke-width="6" opacity="0.88"/>
    <text x="80" y="852" font-family="condensed" font-size="88" font-weight="bold" fill="{ink}" letter-spacing="5">{custom_msg}</text>
    <text x="80" y="916" font-family="mono" font-size="28" font-weight="bold" fill="{ink}" opacity="0.74" letter-spacing="3">FICTIONAL DEMO ASSET  |  STANDARD 20FT DRY CARGO  |  ISO {size_code}</text>
  </g>
</svg>
"""

def build_side_owner_svg(cfg):
    brand = xml_escape(str(cfg["owner_operator"].get("brand_name", "PORTIQ")).upper())
    subtitle = xml_escape(str(cfg["owner_operator"].get("operator_subtitle", "LOGISTICS VISUALIZATION DEMO")).upper())
    ink = xml_escape(cfg["owner_operator"].get("accent_color", "#EEF2F0"))
    bar = xml_escape(cfg["owner_operator"].get("brand_accent_bar", "#CDAA7B"))

    # Confined strictly to left-center zone x in [80..1080] -> crisp margin before ISO ID block at x=1220
    return f"""<?xml version="1.0" encoding="UTF-8"?>
{svg_open("side_owner")}
  <!-- Transparent background; Owner/Operator branding decal -->
  <g id="Owner_Logo_Mark">
    <rect x="90" y="330" width="200" height="200" fill="none" stroke="{ink}" stroke-width="16"/>
    <rect x="122" y="362" width="136" height="136" fill="none" stroke="{bar}" stroke-width="9"/>
    <line x1="156" y1="362" x2="156" y2="498" stroke="{ink}" stroke-width="9"/>
    <line x1="190" y1="362" x2="190" y2="498" stroke="{ink}" stroke-width="9"/>
    <line x1="224" y1="362" x2="224" y2="498" stroke="{ink}" stroke-width="9"/>
  </g>

  <g id="Owner_Wordmark">
    <text x="336" y="486" font-family="bold" font-size="184" font-weight="bold" fill="{ink}" letter-spacing="10">{brand}</text>
    <rect x="340" y="516" width="690" height="10" fill="{bar}"/>
    <text x="340" y="582" font-family="condensed" font-size="44" font-weight="bold" fill="{ink}" opacity="0.90" letter-spacing="6">{subtitle}</text>
  </g>
</svg>
"""

def build_rear_doors_svg(cfg):
    cid = cfg["container_id"]
    owner_code = xml_escape(f"{cid['owner_code']}{cid.get('equipment_category', 'U')}")
    serial = xml_escape(str(cid["serial_number"]))
    check = xml_escape(str(cid["check_digit"]))
    size_code = xml_escape(str(cfg["size_type_code"]))
    w = cfg["weights_and_capacity"]
    brand = xml_escape(str(cfg["owner_operator"].get("brand_name", "PORTIQ")).upper())
    rear_msg = xml_escape(str(cfg.get("custom_rear_text", "")).upper())
    ink = xml_escape(cfg["owner_operator"].get("accent_color", "#EEF2F0"))
    bar = xml_escape(cfg["owner_operator"].get("brand_accent_bar", "#CDAA7B"))
    warn_y = "#E2B93B"
    warn_k = "#141A18"

    # Clear unobstructed center bay between vertical locking rods:
    #   Left door  clear bay: x in [210..810]  (center = 510)
    #   Right door clear bay: x in [1235..1835] (center = 1535)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
{svg_open("rear_doors")}
  <!-- LEFT REAR DOOR CENTER BAY (x: 210..810, 100% clear of locking rods) -->
  <g id="Left_Door_Markings">
    <text x="510" y="255" font-family="bold" font-size="108" font-weight="bold" fill="{ink}" text-anchor="middle" letter-spacing="8">{brand}</text>
    <rect x="260" y="286" width="500" height="8" fill="{bar}"/>
    <text x="510" y="346" font-family="condensed" font-size="33" font-weight="bold" fill="{ink}" text-anchor="middle" opacity="0.90" letter-spacing="2">{rear_msg}</text>

    <!-- Handling & Warning Triangle (Yellow/Black Industrial Caution) -->
    <polygon points="320,650 420,825 220,825" fill="{warn_y}" stroke="{warn_k}" stroke-width="8"/>
    <rect x="311" y="705" width="18" height="66" fill="{warn_k}"/>
    <rect x="311" y="784" width="18" height="19" fill="{warn_k}"/>

    <text x="455" y="715" font-family="condensed" font-size="44" font-weight="bold" fill="{warn_y}" letter-spacing="2">CAUTION</text>
    <text x="455" y="768" font-family="condensed" font-size="32" font-weight="bold" fill="{ink}">CHECK LOCKING RODS</text>
    <text x="455" y="814" font-family="condensed" font-size="32" font-weight="bold" fill="{ink}">BEFORE OPENING</text>
  </g>

  <!-- RIGHT REAR DOOR CENTER BAY (x: 1235..1835, 100% clear of locking rods) -->
  <g id="Right_Door_ISO_Header">
    <text x="1235" y="215" font-family="condensed" font-size="68" font-weight="bold" fill="{ink}" letter-spacing="2">{owner_code}  {serial}</text>
    <rect x="1745" y="148" width="76" height="82" fill="none" stroke="{ink}" stroke-width="6"/>
    <text x="1783" y="214" font-family="condensed" font-size="68" font-weight="bold" fill="{ink}" text-anchor="middle">{check}</text>

    <text x="1235" y="320" font-family="condensed" font-size="72" font-weight="bold" fill="{ink}" letter-spacing="4">{size_code}</text>
    <rect x="1480" y="264" width="175" height="52" fill="none" stroke="{bar}" stroke-width="5"/>
    <text x="1568" y="302" font-family="mono" font-size="30" font-weight="bold" fill="{bar}" text-anchor="middle">DEMO ID</text>
    <line x1="1235" y1="365" x2="1825" y2="365" stroke="{ink}" stroke-width="4" opacity="0.65"/>
  </g>

  <g id="Right_Door_Specifications">
    <text x="1235" y="460" font-family="condensed" font-size="38" font-weight="bold" fill="{bar}" letter-spacing="1">MAX. GROSS</text>
    <text x="1515" y="460" font-family="mono" font-size="38" font-weight="bold" fill="{ink}">{xml_escape(w['max_gross_kg'])}</text>
    <text x="1515" y="512" font-family="mono" font-size="35" font-weight="bold" fill="{ink}" opacity="0.90">{xml_escape(w['max_gross_lb'])}</text>

    <text x="1235" y="625" font-family="condensed" font-size="38" font-weight="bold" fill="{bar}" letter-spacing="1">TARE</text>
    <text x="1515" y="625" font-family="mono" font-size="38" font-weight="bold" fill="{ink}">{xml_escape(w['tare_kg'])}</text>
    <text x="1515" y="677" font-family="mono" font-size="35" font-weight="bold" fill="{ink}" opacity="0.90">{xml_escape(w['tare_lb'])}</text>

    <text x="1235" y="790" font-family="condensed" font-size="38" font-weight="bold" fill="{bar}" letter-spacing="1">NET / PAYLOAD</text>
    <text x="1515" y="790" font-family="mono" font-size="38" font-weight="bold" fill="{ink}">{xml_escape(w['payload_kg'])}</text>
    <text x="1515" y="842" font-family="mono" font-size="35" font-weight="bold" fill="{ink}" opacity="0.90">{xml_escape(w['payload_lb'])}</text>

    <text x="1235" y="955" font-family="condensed" font-size="38" font-weight="bold" fill="{bar}" letter-spacing="1">CU. CAP.</text>
    <text x="1515" y="955" font-family="mono" font-size="38" font-weight="bold" fill="{ink}">{xml_escape(w['cube_m3'])}</text>
    <text x="1515" y="1007" font-family="mono" font-size="35" font-weight="bold" fill="{ink}" opacity="0.90">{xml_escape(w['cube_ft3'])}</text>

    <line x1="1235" y1="1065" x2="1825" y2="1065" stroke="{ink}" stroke-width="4" opacity="0.5"/>
    <text x="1530" y="1122" font-family="mono" font-size="25" font-weight="bold" fill="{ink}" text-anchor="middle" opacity="0.78">CONFIGURABLE DEMO WEIGHTS</text>
  </g>
</svg>
"""

def build_csc_plate_svg(cfg):
    c = cfg["csc_plate"]
    return f"""<?xml version="1.0" encoding="UTF-8"?>
{svg_open("csc_plate")}
  <rect x="8" y="8" width="1008" height="664" fill="#C9CFD1" stroke="#222826" stroke-width="10"/>
  <rect x="24" y="24" width="976" height="632" fill="none" stroke="#222826" stroke-width="4"/>

  <circle cx="52" cy="52" r="12" fill="#7B8385" stroke="#222826" stroke-width="3"/>
  <circle cx="972" cy="52" r="12" fill="#7B8385" stroke="#222826" stroke-width="3"/>
  <circle cx="52" cy="628" r="12" fill="#7B8385" stroke="#222826" stroke-width="3"/>
  <circle cx="972" cy="628" r="12" fill="#7B8385" stroke="#222826" stroke-width="3"/>

  <text x="512" y="96" font-family="bold" font-size="52" font-weight="bold" fill="#181E1C" text-anchor="middle" letter-spacing="4">{xml_escape(c['header'])}</text>
  <rect x="96" y="114" width="832" height="44" fill="#181E1C"/>
  <text x="512" y="147" font-family="mono" font-size="26" font-weight="bold" fill="#E2B93B" text-anchor="middle" letter-spacing="2">{xml_escape(c['demo_banner'])}</text>

  <line x1="48" y1="180" x2="976" y2="180" stroke="#222826" stroke-width="3"/>

  <text x="64" y="232" font-family="condensed" font-size="30" font-weight="bold" fill="#2B3330">APPROVAL REF:</text>
  <text x="410" y="232" font-family="mono" font-size="30" font-weight="bold" fill="#111614">{xml_escape(c['approval_ref'])}</text>

  <text x="64" y="294" font-family="condensed" font-size="30" font-weight="bold" fill="#2B3330">DATE MANUFACTURED:</text>
  <text x="410" y="294" font-family="mono" font-size="30" font-weight="bold" fill="#111614">{xml_escape(c['date_manufactured'])}</text>

  <text x="64" y="356" font-family="condensed" font-size="30" font-weight="bold" fill="#2B3330">IDENTIFICATION NO:</text>
  <text x="410" y="356" font-family="mono" font-size="30" font-weight="bold" fill="#111614">{xml_escape(c['identification_no'])}</text>

  <text x="64" y="418" font-family="condensed" font-size="30" font-weight="bold" fill="#2B3330">MAX GROSS WEIGHT:</text>
  <text x="410" y="418" font-family="mono" font-size="30" font-weight="bold" fill="#111614">{xml_escape(c['maximum_gross_weight'])}</text>

  <text x="64" y="480" font-family="condensed" font-size="30" font-weight="bold" fill="#2B3330">ALLOWABLE STACKING:</text>
  <text x="410" y="480" font-family="mono" font-size="30" font-weight="bold" fill="#111614">{xml_escape(c['allowable_stacking_weight'])}</text>

  <text x="64" y="542" font-family="condensed" font-size="30" font-weight="bold" fill="#2B3330">RACKING TEST LOAD:</text>
  <text x="410" y="542" font-family="mono" font-size="30" font-weight="bold" fill="#111614">{xml_escape(c['racking_test_load'])}</text>

  <line x1="48" y1="572" x2="976" y2="572" stroke="#222826" stroke-width="3"/>
  <text x="512" y="622" font-family="mono" font-size="28" font-weight="bold" fill="#181E1C" text-anchor="middle">{xml_escape(c['acep_program'])}</text>
</svg>
"""

SUPERSAMPLE = 2  # PIL shapes are aliased; render at 2x and downsample with premultiplied Lanczos


def rasterize_svg_pure_python(svg_path):
    """Rasterize the SVG subset used here at its declared width/height (viewBox scaled)."""
    root = ET.parse(svg_path).getroot()
    w = int(float(root.attrib.get("width", 2048)))
    h = int(float(root.attrib.get("height", 1024)))
    vb = [float(v) for v in root.attrib.get("viewBox", f"0 0 {w} {h}").split()]
    k = (w / vb[2]) * SUPERSAMPLE
    img = Image.new("RGBA", (w * SUPERSAMPLE, h * SUPERSAMPLE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    def f(elem, key, default=0.0):
        return float(elem.attrib.get(key, default)) * k

    def sw_of(elem, default=1.0):
        return max(1, int(round(float(elem.attrib.get("stroke-width", default)) * k)))

    def strip_ns(tag):
        return tag.split("}", 1)[-1] if "}" in tag else tag

    def walk(elem):
        tag = strip_ns(elem.tag)
        op = float(elem.attrib.get("opacity", 1.0))

        if tag == "rect":
            x, y, rw, rh = f(elem, "x"), f(elem, "y"), f(elem, "width"), f(elem, "height")
            fill = parse_color(elem.attrib.get("fill", "none"), op)
            stroke = parse_color(elem.attrib.get("stroke", "none"), op)
            draw.rectangle([x, y, x + rw, y + rh], fill=fill, outline=stroke, width=sw_of(elem))

        elif tag == "line":
            stroke = parse_color(elem.attrib.get("stroke", "#FFFFFF"), op)
            if stroke:
                draw.line([f(elem, "x1"), f(elem, "y1"), f(elem, "x2"), f(elem, "y2")], fill=stroke, width=sw_of(elem, 2))

        elif tag == "circle":
            cx, cy, r = f(elem, "cx"), f(elem, "cy"), f(elem, "r", 4)
            fill = parse_color(elem.attrib.get("fill", "none"), op)
            stroke = parse_color(elem.attrib.get("stroke", "none"), op)
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill, outline=stroke, width=sw_of(elem))

        elif tag == "polygon":
            pts = []
            for pair in re.split(r"\s+", elem.attrib.get("points", "").strip()):
                if "," in pair:
                    px, py = pair.split(",", 1)
                    pts.append((float(px) * k, float(py) * k))
            fill = parse_color(elem.attrib.get("fill", "none"), op)
            stroke = parse_color(elem.attrib.get("stroke", "none"), op)
            if pts:
                draw.polygon(pts, fill=fill)
                if stroke:
                    draw.line(pts + [pts[0]], fill=stroke, width=sw_of(elem), joint="curve")

        elif tag == "text":
            txt = elem.text or ""
            x, y = f(elem, "x"), f(elem, "y")
            fsize = f(elem, "font-size", 48)
            ffam = elem.attrib.get("font-family", "condensed").lower()
            anchor = elem.attrib.get("text-anchor", "start").lower()
            spacing = f(elem, "letter-spacing", 0)
            fill = parse_color(elem.attrib.get("fill", "#FFFFFF"), op)
            font = load_font(ffam, fsize)
            if spacing > 0.1 and len(txt) > 1:
                widths = [draw.textlength(ch, font=font) for ch in txt]
                total_w = sum(widths) + spacing * (len(txt) - 1)
                cx = x - total_w / 2.0 if anchor == "middle" else (x - total_w if anchor == "end" else x)
                for ch, cw in zip(txt, widths):
                    draw.text((cx, y), ch, font=font, fill=fill, anchor="ls")
                    cx += cw + spacing
            else:
                pil_anchor = {"start": "ls", "middle": "ms", "end": "rs"}.get(anchor, "ls")
                draw.text((x, y), txt, font=font, fill=fill, anchor=pil_anchor)

        for child in elem:
            walk(child)

    walk(root)
    return resize_premultiplied(img, (w, h))


def resize_premultiplied(img, size):
    """Lanczos resize in premultiplied space so ink edges never darken or halo."""
    return img.convert("RGBa").resize(size, Image.LANCZOS).convert("RGBA")


def bleed_alpha(img):
    """Fill RGB of fully transparent texels with nearby ink colour (alpha untouched)."""
    arr = np.asarray(img, dtype=np.float32)
    a = arr[..., 3] / 255.0
    if a.min() > 0.999:
        return img
    rgb = arr[..., :3].copy()
    empty = a < (1.0 / 255.0)
    todo = empty.copy()
    prem = rgb * a[..., None]
    for sigma in (2, 6, 18, 54, 160):
        aa = gaussian_filter(a, sigma)
        sel = todo & (aa > 1e-4)
        if sel.any():
            for c in range(3):
                pc = gaussian_filter(prem[..., c], sigma)
                rgb[..., c][sel] = pc[sel] / aa[sel]
            todo &= ~sel
    if todo.any():
        rgb[todo] = (prem.sum((0, 1)) / max(a.sum(), 1e-6))
    out = np.concatenate([rgb, arr[..., 3:4]], -1)
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8), "RGBA")


def generate_all_markings(from_svg=False):
    os.makedirs(MASTER_DIR, exist_ok=True)
    os.makedirs(RUNTIME_DIR, exist_ok=True)
    svg_targets = [
        ("side_panel", build_side_panel_svg),
        ("side_owner", build_side_owner_svg),
        ("rear_doors", build_rear_doors_svg),
        ("csc_plate", build_csc_plate_svg),
    ]

    if not from_svg:
        with open(JSON_PATH, "r", encoding="utf-8") as fh:
            cfg = json.load(fh)
        for name, builder in svg_targets:
            with open(os.path.join(MARKINGS_DIR, f"{name}.svg"), "w", encoding="utf-8") as fh:
                fh.write(builder(cfg))

    for name, _ in svg_targets:
        master = rasterize_svg_pure_python(os.path.join(MARKINGS_DIR, f"{name}.svg"))
        _, _, mw, mh, rw, rh = SIZES[name]
        assert master.size == (mw, mh), f"{name}.svg must keep width/height {mw}x{mh}"
        runtime = bleed_alpha(resize_premultiplied(master, (rw, rh)))
        master = bleed_alpha(master)
        mp, rp = os.path.join(MASTER_DIR, f"{name}.png"), os.path.join(RUNTIME_DIR, f"{name}.png")
        master.save(mp, optimize=True)
        runtime.save(rp, optimize=True)
        print(f"  [OK] {name}.svg -> master {mw}x{mh} ({os.path.getsize(mp)/1024:6.1f} KB)  runtime {rw}x{rh} ({os.path.getsize(rp)/1024:6.1f} KB)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate editable container marking SVGs and PNG textures.")
    parser.add_argument("--from-svg", action="store_true", help="Rasterize directly from existing SVGs without overwriting them from markings.json.")
    args = parser.parse_args()
    generate_all_markings(from_svg=args.from_svg)
