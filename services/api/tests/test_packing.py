"""CG-022: the server packer (a port of apps/web/lib/load-planner/packing.ts)."""

from __future__ import annotations

from dataclasses import replace

from app.schemas.enums import CargoCategory
from app.services.packing import CONTAINERS, EPS, Line, Placement, fits_quantity, pack

C20, C40 = CONTAINERS[20], CONTAINERS[40]

# SAMPLE_CARGO from apps/web/lib/load-planner/config.ts, in cm; it fits both sizes.
SAMPLE = [
    Line("B1", CargoCategory.BOX, 60, 40, 40, 18, 40),
    Line("C1", CargoCategory.CRATE, 120, 100, 100, 260, 6),
    Line("P1", CargoCategory.PALLET, 120, 80, 60, 420, 6),
    Line("D1", CargoCategory.DRUM, 60, 60, 90, 190, 8),
]


def _overlap(a: Placement, b: Placement) -> bool:
    return (
        a.x < b.x + b.length - EPS
        and b.x < a.x + a.length - EPS
        and a.y < b.y + b.height - EPS
        and b.y < a.y + a.height - EPS
        and a.z < b.z + b.width - EPS
        and b.z < a.z + a.width - EPS
    )


def test_sample_cargo_fits_both_containers_without_overlap() -> None:
    for spec in (C20, C40):
        result = pack(spec, SAMPLE)
        assert result.unplaced == []
        assert result.fits(spec)
        assert len(result.placements) == 60
        for i, a in enumerate(result.placements):
            assert a.x >= -EPS and a.x + a.length <= spec.length + EPS
            assert a.z >= -EPS and a.z + a.width <= spec.width + EPS
            assert a.y + a.height <= spec.height + EPS
            assert not any(_overlap(a, b) for b in result.placements[i + 1 :])


def test_same_input_gives_the_same_layout() -> None:
    assert pack(C40, SAMPLE) == pack(C40, SAMPLE)


def test_largest_units_are_placed_first() -> None:
    result = pack(C40, SAMPLE)
    assert result.placements[0].key == "C1"


def test_a_unit_turns_90_degrees_when_only_that_fits() -> None:
    result = pack(C20, [Line("long", CargoCategory.CRATE, 200, 300, 50, 10, 1)])
    assert result.placements[0].rotation_y == 90
    assert (result.placements[0].length, result.placements[0].width) == (300, 200)


def test_drums_fragile_and_non_stackable_lines_never_carry_a_load() -> None:
    for line in (
        Line("drum", CargoCategory.DRUM, 60, 60, 90, 10, 300),
        Line("glass", CargoCategory.FRAGILE, 60, 60, 90, 10, 300),
        Line("box", CargoCategory.BOX, 60, 60, 90, 10, 300, stackable=False),
    ):
        result = pack(C20, [line])
        assert result.placements
        assert all(p.y == 0 for p in result.placements)
        assert result.unplaced


def test_stackable_boxes_are_stacked() -> None:
    result = pack(C20, [Line("box", CargoCategory.BOX, 60, 60, 90, 10, 300)])
    assert any(p.y > 0 for p in result.placements)


def test_payload_limit_makes_a_layout_not_fit() -> None:
    heavy = Line("ingot", CargoCategory.CRATE, 50, 50, 50, 15000, 2)
    result = pack(C20, [heavy])
    assert result.unplaced == []
    assert not result.fits(C20)
    assert fits_quantity(C20, [], heavy) == 1


def test_fits_quantity_is_the_largest_quantity_that_packs() -> None:
    crate = Line("crate", CargoCategory.CRATE, 120, 100, 100, 50, 500)
    fits = fits_quantity(C20, [], crate)
    assert 0 < fits < 500
    assert pack(C20, [replace(crate, quantity=fits)]).fits(C20)
    assert not pack(C20, [replace(crate, quantity=fits + 1)]).fits(C20)


def test_fits_quantity_counts_what_is_already_inside() -> None:
    crate = Line("crate", CargoCategory.CRATE, 120, 100, 100, 50, 500)
    alone = fits_quantity(C20, [], crate)
    others = [Line("other", CargoCategory.CRATE, 120, 100, 100, 50, 4)]
    assert fits_quantity(C20, others, crate) == alone - 4
    assert fits_quantity(C20, [replace(crate, key="full", quantity=alone)], crate) == 0
