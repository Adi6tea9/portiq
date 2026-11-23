"""Server-side container packing, a port of ``apps/web/lib/load-planner/packing.ts``.

Greedy extreme-point heuristic: largest units first, walls built from the far end towards the
doors, each unit taking the free spot nearest the far wall, then lowest, then leftmost, turning
90 degrees when that fits better. A unit above the floor needs 75% of its footprint resting on
stackable cargo. Drums, fragile cargo and lines marked non-stackable never carry a load.
Deterministic: the same lines in the same order always give the same layout. Units are cm/kg.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, replace

from app.schemas.enums import CargoCategory

EPS = 1e-6
MIN_SUPPORT = 0.75
NEVER_STACKABLE = frozenset({CargoCategory.DRUM, CargoCategory.FRAGILE})


@dataclass(frozen=True)
class ContainerSpec:
    length: float
    width: float
    height: float
    max_payload_kg: float

    @property
    def volume_cm3(self) -> float:
        return self.length * self.width * self.height


# Internal dimensions and payloads match apps/web/lib/load-planner/config.ts.
CONTAINERS: dict[int, ContainerSpec] = {
    20: ContainerSpec(590, 235, 239, 28200),
    40: ContainerSpec(1203, 235, 239, 26700),
}


@dataclass(frozen=True)
class Line:
    """One cargo line; ``key`` is whatever the caller uses to recognise it (the item id)."""

    key: str
    category: CargoCategory
    length: float
    width: float
    height: float
    weight: float
    quantity: int
    stackable: bool = True

    @property
    def unit_volume(self) -> float:
        return self.length * self.width * self.height


@dataclass(frozen=True)
class Placement:
    key: str
    unit: int  # 1-based unit number within its line
    x: float
    y: float
    z: float
    length: float
    width: float
    height: float
    rotation_y: int


@dataclass(frozen=True)
class PackResult:
    placements: list[Placement]
    unplaced: list[tuple[str, int]]
    total_weight_kg: float

    def fits(self, container: ContainerSpec) -> bool:
        return not self.unplaced and self.total_weight_kg <= container.max_payload_kg + EPS


@dataclass(frozen=True)
class _Block:
    u: float
    y: float
    z: float
    len: float
    h: float
    w: float
    stackable: bool


def _intersects(a: _Block, b: _Block) -> bool:
    return (
        a.u < b.u + b.len - EPS
        and b.u < a.u + a.len - EPS
        and a.y < b.y + b.h - EPS
        and b.y < a.y + a.h - EPS
        and a.z < b.z + b.w - EPS
        and b.z < a.z + a.w - EPS
    )


def _supported_area(block: _Block, placed: Sequence[_Block]) -> float:
    area = 0.0
    for below in placed:
        if not below.stackable or abs(below.y + below.h - block.y) > EPS:
            continue
        du = min(block.u + block.len, below.u + below.len) - max(block.u, below.u)
        dz = min(block.z + block.w, below.z + below.w) - max(block.z, below.z)
        if du > EPS and dz > EPS:
            area += du * dz
    return area


def fits_orientation(container: ContainerSpec, length: float, width: float, height: float) -> bool:
    """True when one unit fits the empty container upright, as listed or turned 90 degrees."""
    if height > container.height + EPS:
        return False
    return any(
        a <= container.length + EPS and b <= container.width + EPS
        for a, b in ((length, width), (width, length))
    )


def pack(container: ContainerSpec, lines: Sequence[Line]) -> PackResult:
    units = [(line, n) for line in lines for n in range(1, max(0, line.quantity) + 1)]
    # Stable sort, like Array.prototype.sort, so ties keep the listed order.
    units.sort(key=lambda u: (-u[0].unit_volume, -u[0].weight))

    placed: list[_Block] = []
    placements: list[Placement] = []
    unplaced: list[tuple[str, int]] = []
    points: list[tuple[float, float, float]] = [(0.0, 0.0, 0.0)]
    total_weight = sum(line.weight * max(0, line.quantity) for line in lines)

    for line, n in units:
        stackable = line.stackable and line.category not in NEVER_STACKABLE
        orientations = [(line.length, line.width, 0)]
        if abs(line.length - line.width) > EPS:
            orientations.append((line.width, line.length, 90))

        chosen: tuple[_Block, int] | None = None
        for u, y, z in points:
            for length, width, rotation in orientations:
                block = _Block(u, y, z, length, line.height, width, stackable)
                if (
                    u + length > container.length + EPS
                    or y + line.height > container.height + EPS
                    or z + width > container.width + EPS
                    or any(_intersects(block, other) for other in placed)
                    or (
                        y > EPS
                        and _supported_area(block, placed) < MIN_SUPPORT * length * width - EPS
                    )
                ):
                    continue
                if chosen is None or _better(block, chosen[0]):
                    chosen = (block, rotation)

        if chosen is None:
            unplaced.append((line.key, n))
            continue

        block, rotation = chosen
        placed.append(block)
        points = [p for p in points if p != (block.u, block.y, block.z)]
        for nxt in (
            (block.u + block.len, block.y, block.z),
            (block.u, block.y + block.h, block.z),
            (block.u, block.y, block.z + block.w),
        ):
            if not any(sum(abs(a - b) for a, b in zip(p, nxt, strict=True)) < EPS for p in points):
                points.append(nxt)

        placements.append(
            Placement(
                key=line.key,
                unit=n,
                x=container.length - block.u - block.len,
                y=block.y,
                z=block.z,
                length=block.len,
                width=block.w,
                height=block.h,
                rotation_y=rotation,
            )
        )

    return PackResult(placements, unplaced, total_weight)


def _better(a: _Block, b: _Block) -> bool:
    """Nearer the far wall, then lower, then further left (EPS tolerant)."""
    if a.u < b.u - EPS:
        return True
    if abs(a.u - b.u) > EPS:
        return False
    if a.y < b.y - EPS:
        return True
    return abs(a.y - b.y) <= EPS and a.z < b.z - EPS


def fits_quantity(container: ContainerSpec, others: Sequence[Line], line: Line) -> int:
    """Largest quantity of ``line`` (up to its own) that packs alongside ``others``."""
    used_volume = sum(o.unit_volume * o.quantity for o in others)
    used_weight = sum(o.weight * o.quantity for o in others)
    hi = min(
        line.quantity,
        int((container.volume_cm3 - used_volume) // line.unit_volume) if line.unit_volume else 0,
        int((container.max_payload_kg - used_weight + EPS) // line.weight) if line.weight else 0,
    )
    if hi == line.quantity and pack(container, [*others, line]).fits(container):
        return hi
    lo = 0
    # shortcut: assumes fewer units never pack worse, true in practice for this greedy packer.
    while lo < hi:
        mid = (lo + hi + 1) // 2
        trial = replace(line, quantity=mid)
        if pack(container, [*others, trial]).fits(container):
            lo = mid
        else:
            hi = mid - 1
    return max(lo, 0)
