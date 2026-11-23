"""The capacity simulator caches each simulated day; results must not depend on call order."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.services import capacity_sim as sim

DATES = [date(2025, 1, 1), date(2025, 6, 30), date(2026, 2, 14), date(2026, 11, 23)]


def run(dates: list[date]) -> dict[tuple[str, str, date], dict]:
    sim._SERIES.clear()
    return {
        (port, resource, day): sim.capacity_sim_for_date(port, resource, day)
        for day in dates
        for port in ("INNSA", "INMUN")
        for resource in ("yard", "berth")
    }


def test_results_do_not_depend_on_call_order() -> None:
    forward = run(DATES)
    backward = run(list(reversed(DATES)))
    assert forward == backward


def test_known_values_are_unchanged() -> None:
    """Pins outputs computed before the cache existed (each day replayed from 2025-01-01)."""
    sim._SERIES.clear()
    later = sim.capacity_sim_for_date("INNSA", "yard", date(2025, 1, 1) + timedelta(days=501))
    first = sim.capacity_sim_for_date("INNSA", "yard", date(2025, 1, 1))
    assert first["predicted_occupied"] == 731.0
    assert later["predicted_occupied"] == pytest.approx(738.3565330869706, abs=1e-9)


def test_dates_before_the_epoch_and_unknown_ports() -> None:
    with pytest.raises(ValueError):
        sim.capacity_sim_for_date("INNSA", "yard", date(2024, 12, 31))
    assert sim.capacity_sim_for_date("XXXXX", "yard", date(2026, 1, 1)) == {"is_valid": False}
