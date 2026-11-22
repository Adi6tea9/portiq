#!/usr/bin/env python3
"""
PortIQ 20 FT Container — v3 PBR Texture Generator (painted steel, interior, hardware)
====================================================================================
Writes tileable 2K master PBR maps into `textures/`:

  steel_ext_*_2k.png   Painted exterior, PortIQ Deep Forest Green #123D2E (dielectric paint)
  steel_int_*_2k.png   Muted grey-green interior satin paint (#626C67)
  steel_hw_*_1k.png    Galvanised hardware steel (metallic)

Each set has albedo / normal / mr (glTF: G=roughness, B=metallic) / ao and a packed
ORM map (R=AO, G=roughness, B=metallic) used by the runtime GLB.

The wooden floor maps (wood_floor_*_2k.png) are carried over byte-for-byte from v2
and are NEVER written by this script.

Texel density contract with generate_container.py: one texture tile = TILE_M metres.
"""
import os
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
from scipy.spatial import cKDTree

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(SCRIPT_DIR, "textures")
PROTECTED_PREFIX = "wood_floor_"


# ---------------------------------------------------------------------------
# Tileable noise helpers
# ---------------------------------------------------------------------------
def tileable_noise(size, freq, seed):
    """Band-limited, perfectly tileable noise (FFT-filtered white noise), unit std."""
    rng = np.random.default_rng(seed)
    white = rng.normal(0.0, 1.0, (size, size)).astype(np.float32)
    f = np.fft.fftfreq(size)[:, None] ** 2 + np.fft.fftfreq(size)[None, :] ** 2
    f = np.sqrt(f) * size  # cycles per tile
    # Gaussian band around `freq` cycles/tile (low-pass when freq is small)
    filt = np.exp(-0.5 * ((f - freq) / max(1.0, freq * 0.6)) ** 2)
    out = np.real(np.fft.ifft2(np.fft.fft2(white) * filt)).astype(np.float32)
    out -= out.mean()
    return out / (out.std() + 1e-8)


def fbm(size, freqs, weights, seed):
    acc = np.zeros((size, size), np.float32)
    for i, (fq, w) in enumerate(zip(freqs, weights)):
        acc += tileable_noise(size, fq, seed + i * 7919) * w
    return acc / (np.sqrt(sum(w * w for w in weights)) + 1e-8)


def height_to_normal(h, strength):
    """Heightmap -> glTF (OpenGL, +Y up) tangent-space normal map, wrap-around gradients."""
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5 * strength
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5 * strength
    n = np.stack([-dx, dy, np.ones_like(h)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return np.clip((n * 0.5 + 0.5) * 255.0 + 0.5, 0, 255).astype(np.uint8)


def sparse_blobs(size, count, r_min, r_max, seed, irregular=0.55):
    """Tileable mask of small irregular blobs (paint chips / scuffs), values 0..1."""
    rng = np.random.default_rng(seed)
    mask = np.zeros((size, size), np.float32)
    warp = tileable_noise(size, size / 24.0, seed + 1)
    for _ in range(count):
        cx, cy = rng.uniform(0, size, 2)
        r = rng.uniform(r_min, r_max)
        ext = int(r * 2.2) + 2
        ys = (np.arange(int(cy) - ext, int(cy) + ext + 1)) % size
        xs = (np.arange(int(cx) - ext, int(cx) + ext + 1)) % size
        yy, xx = np.meshgrid(np.arange(-ext, ext + 1), np.arange(-ext, ext + 1), indexing="ij")
        d = np.sqrt((xx + (cx % 1)) ** 2 + ((yy + (cy % 1)) * rng.uniform(0.6, 1.4)) ** 2)
        local_warp = warp[np.ix_(ys, xs)] * irregular * r
        blob = np.clip((r + local_warp - d) / 1.2, 0.0, 1.0)
        mask[np.ix_(ys, xs)] = np.maximum(mask[np.ix_(ys, xs)], blob)
    return mask


def linear_scuffs(size, count, length, seed, horizontal_bias=0.85):
    """Tileable thin scratch/scuff lines (mostly horizontal for cargo contact)."""
    rng = np.random.default_rng(seed)
    mask = np.zeros((size, size), np.float32)
    for _ in range(count):
        x0, y0 = rng.uniform(0, size, 2)
        ln = rng.uniform(length * 0.3, length)
        ang = rng.normal(0.0, 0.08) if rng.random() < horizontal_bias else rng.uniform(0, np.pi)
        n = int(ln)
        xs = (x0 + np.linspace(0, ln * np.cos(ang), n)).astype(np.int64) % size
        ys = (y0 + np.linspace(0, ln * np.sin(ang), n)).astype(np.int64) % size
        mask[ys, xs] = np.maximum(mask[ys, xs], rng.uniform(0.3, 1.0))
    return np.clip(gaussian_filter(mask, 0.6, mode="wrap") * 2.2, 0.0, 1.0)


def save_rgb(arr, name):
    Image.fromarray(np.clip(arr + 0.5, 0, 255).astype(np.uint8), "RGB").save(os.path.join(OUT_DIR, name), optimize=True)


def save_set(prefix, suffix, albedo, rough, metal, ao, height, n_strength):
    assert not prefix.startswith(PROTECTED_PREFIX), "refusing to overwrite wood floor maps"
    save_rgb(albedo, f"{prefix}_albedo_{suffix}.png")
    zeros = np.zeros_like(rough)
    save_rgb(np.stack([zeros, rough, metal], -1) * 255.0, f"{prefix}_mr_{suffix}.png")
    save_rgb(np.repeat(ao[..., None], 3, -1) * 255.0, f"{prefix}_ao_{suffix}.png")
    save_rgb(np.stack([ao, rough, metal], -1) * 255.0, f"{prefix}_orm_{suffix}.png")
    Image.fromarray(height_to_normal(height, n_strength), "RGB").save(os.path.join(OUT_DIR, f"{prefix}_normal_{suffix}.png"), optimize=True)
    print(f"  [OK] {prefix}_*_{suffix}  rough {rough.min():.2f}-{rough.max():.2f}  metal {metal.min():.2f}-{metal.max():.2f}  ao {ao.min():.2f}-{ao.max():.2f}")


# ---------------------------------------------------------------------------
# 1. Exterior painted steel — Deep Forest Green #123D2E, mostly dielectric
# ---------------------------------------------------------------------------
def generate_exterior(size=2048):
    print(f"Exterior painted steel {size}px ...")
    macro = fbm(size, (2, 5, 11), (0.6, 0.3, 0.15), seed=11)        # paint batch / sun fade mottling
    mid = fbm(size, (24, 48), (0.6, 0.4), seed=23)                  # roller / spray density
    peel = fbm(size, (220, 420), (0.65, 0.35), seed=37)             # orange-peel micro texture
    dents = fbm(size, (3, 6), (0.7, 0.3), seed=41)                  # very shallow panel waviness
    # Faint vertical weathering streaks (tileable both ways)
    col = tileable_noise(size, 60, seed=53)[0:1, :]
    streak = np.broadcast_to(col, (size, size)) * np.clip(0.5 + 0.5 * tileable_noise(size, 3, seed=59), 0, 1)
    chips = sparse_blobs(size, 22, 1.2, 3.6, seed=61)               # rare tiny paint chips (1-3 mm)
    chip_halo = np.clip(gaussian_filter(chips, 4.0, mode="wrap") * 2.5, 0, 1) * (1 - chips)
    scuffs = linear_scuffs(size, 26, 160, seed=67, horizontal_bias=0.6) * 0.35

    base = np.array([18.0, 61.0, 46.0], np.float32)                 # sRGB #123D2E
    shade = 1.0 + macro * 0.035 + mid * 0.012 - streak * 0.018
    albedo = base[None, None, :] * shade[..., None]
    # sun-faded areas drift slightly toward a chalkier, less saturated green
    fade = np.clip(macro * 0.5 + 0.1, 0, 1)[..., None] * 0.06
    albedo = albedo * (1 - fade) + np.array([46.0, 70.0, 60.0]) * fade
    # light scuffs: slightly lighter, chalky paint (not bare metal)
    albedo = albedo * (1 - scuffs[..., None] * 0.35) + np.array([60.0, 84.0, 74.0]) * scuffs[..., None] * 0.35
    # faint brown oxide bloom around chips, then primer/steel inside chips
    albedo = albedo * (1 - chip_halo[..., None] * 0.18) + np.array([58.0, 44.0, 32.0]) * chip_halo[..., None] * 0.18
    albedo = albedo * (1 - chips[..., None] * 0.85) + np.array([52.0, 50.0, 46.0]) * chips[..., None] * 0.85

    rough = 0.645 + macro * 0.035 + mid * 0.015 + peel * 0.012 + streak * 0.02 + scuffs * 0.05
    rough = rough * (1 - chips) + 0.42 * chips
    rough = np.clip(rough, 0.40, 0.76)
    metal = np.clip(0.02 + chips * 0.55, 0.0, 0.6)                  # paint is dielectric
    ao = np.clip(1.0 - chip_halo * 0.05 - chips * 0.10 - np.clip(-dents, 0, 3) * 0.012, 0.85, 1.0)
    height = peel * 0.06 + dents * 0.10 + mid * 0.015 - chips * 0.6
    save_set("steel_ext", "2k", albedo, rough, metal, ao, height, n_strength=1.6)


# ---------------------------------------------------------------------------
# 2. Interior satin paint — muted grey-green #626C67
# ---------------------------------------------------------------------------
def generate_interior(size=2048):
    print(f"Interior satin steel {size}px ...")
    macro = fbm(size, (2, 6, 13), (0.6, 0.3, 0.15), seed=111)
    mid = fbm(size, (30, 64), (0.6, 0.4), seed=123)
    peel = fbm(size, (240, 460), (0.6, 0.4), seed=137)
    dents = fbm(size, (4, 8), (0.7, 0.3), seed=141)
    scuffs = linear_scuffs(size, 120, 260, seed=151, horizontal_bias=0.9)   # cargo contact marks
    rubs = np.clip(gaussian_filter(linear_scuffs(size, 40, 400, seed=157), 3.0, mode="wrap") * 3.0, 0, 1)

    base = np.array([98.0, 108.0, 103.0], np.float32)   # #626C67 muted grey-green
    shade = 1.0 + macro * 0.022 + mid * 0.012
    albedo = base[None, None, :] * shade[..., None]
    albedo = albedo * (1 - rubs[..., None] * 0.12) + np.array([76.0, 82.0, 78.0]) * rubs[..., None] * 0.12
    albedo = albedo * (1 - scuffs[..., None] * 0.45) + np.array([140.0, 146.0, 142.0]) * scuffs[..., None] * 0.45

    rough = np.clip(0.67 + macro * 0.04 + mid * 0.02 + rubs * 0.04 - scuffs * 0.14, 0.48, 0.80)   # flat satin: no glinting rib edges
    metal = np.clip(0.05 + scuffs * 0.50 + macro * 0.01, 0.0, 0.6)   # satin paint, bare-steel scuffs
    ao = np.clip(1.0 - rubs * 0.05 - np.clip(-dents, 0, 3) * 0.02, 0.85, 1.0)
    height = peel * 0.05 + dents * 0.14 - scuffs * 0.30
    save_set("steel_int", "2k", albedo, rough, metal, ao, height, n_strength=1.6)


# ---------------------------------------------------------------------------
# 3. Galvanised hardware steel (rods, cams, hinges, handles)
# ---------------------------------------------------------------------------
def generate_hardware(size=1024):
    print(f"Galvanised hardware steel {size}px ...")
    rng = np.random.default_rng(211)
    seeds = rng.uniform(0, size, (420, 2))
    yy, xx = np.mgrid[0:size, 0:size]
    pts = np.stack([yy.ravel(), xx.ravel()], -1).astype(np.float64)
    dist, idx = cKDTree(seeds, boxsize=size).query(pts, k=2)
    cell = idx[:, 0].reshape(size, size)
    edge = np.clip(1.0 - (dist[:, 1] - dist[:, 0]).reshape(size, size) / 2.0, 0, 1)  # spangle boundaries
    cell_val = rng.normal(0, 1, len(seeds)).astype(np.float32)[cell]
    macro = fbm(size, (3, 8), (0.7, 0.3), seed=223)
    brush = gaussian_filter(rng.normal(0, 1, (size, size)).astype(np.float32), (0.5, 18), mode="wrap")
    brush /= brush.std() + 1e-8

    base = np.array([166.0, 172.0, 174.0], np.float32)
    shade = 1.0 + cell_val * 0.035 + macro * 0.04 - edge * 0.05
    albedo = base[None, None, :] * shade[..., None]
    rough = np.clip(0.34 + cell_val * 0.04 + macro * 0.04 + edge * 0.05 + brush * 0.01, 0.24, 0.46)
    metal = np.clip(0.92 + macro * 0.02 - edge * 0.04, 0.8, 1.0)
    ao = np.clip(1.0 - edge * 0.06 - np.clip(-macro, 0, 3) * 0.02, 0.85, 1.0)
    height = cell_val * 0.05 - edge * 0.25 + brush * 0.03
    save_set("steel_hw", "1k", albedo, rough, metal, ao, height, n_strength=1.4)


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    generate_exterior(2048)
    generate_interior(2048)
    generate_hardware(1024)
