"""Unit tests for the section 14 at-risk rules and the dwell histogram (no database)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

from app.schemas.enums import DocumentationStatus, ShipmentStatus
from app.services.at_risk import (
    DWELL_RISK_THRESHOLD_DAYS,
    at_risk_reasons,
    dwell_distribution,
    stay_window,
    warning_codes,
)

PORT = uuid4()
ARRIVAL = datetime(2026, 11, 10, 8, 0, tzinfo=UTC)


def shipment(**overrides: Any) -> Any:
    values: dict[str, Any] = {
        "port_id": PORT,
        "status": ShipmentStatus.SUBMITTED,
        "documentation_status": DocumentationStatus.COMPLETE,
        "expected_arrival_at": ARRIVAL,
        "actual_arrival_at": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def prediction(days: float, warnings: list[dict[str, str]] | None = None) -> Any:
    return SimpleNamespace(
        predicted_dwell_days=Decimal(str(days)),
        predicted_clearance_at=ARRIVAL + timedelta(days=days),
        warnings=warnings or [],
    )


def day(offset: int) -> datetime:
    return datetime(2026, 11, 10, tzinfo=UTC) + timedelta(days=offset)


def codes(reasons: list[dict[str, str]]) -> list[str]:
    return [reason["code"] for reason in reasons]


def test_no_reasons_for_a_calm_shipment() -> None:
    yard = {PORT: [(day(0), 60.0), (day(1), 70.0)]}
    assert at_risk_reasons(shipment(), prediction(1.0), yard) == []


def test_yard_peak_inside_the_stay_crosses_the_threshold() -> None:
    yard = {PORT: [(day(0), 70.0), (day(2), 91.4)]}
    reasons = at_risk_reasons(shipment(), prediction(2.5), yard)

    assert codes(reasons) == ["FORECAST_THRESHOLD_CROSSED"]
    assert reasons[0]["message"] == (
        "Forecast yard utilization reaches 91% during the expected stay."
    )


def test_yard_peak_outside_the_stay_or_at_another_port_is_ignored() -> None:
    after_clearance = {PORT: [(day(0), 60.0), (day(5), 99.0)]}
    other_port = {uuid4(): [(day(0), 99.0)]}

    assert at_risk_reasons(shipment(), prediction(1.0), after_clearance) == []
    assert at_risk_reasons(shipment(), prediction(1.0), other_port) == []


def test_exactly_85_percent_counts_as_crossed() -> None:
    reasons = at_risk_reasons(shipment(), prediction(1.0), {PORT: [(day(0), 85.0)]})
    assert codes(reasons) == ["FORECAST_THRESHOLD_CROSSED"]


def test_dwell_strictly_above_the_threshold_is_a_risk() -> None:
    at_limit = at_risk_reasons(shipment(), prediction(DWELL_RISK_THRESHOLD_DAYS), {})
    above = at_risk_reasons(shipment(), prediction(4.25), {})

    assert at_limit == []
    assert above == [
        {
            "code": "DWELL_ABOVE_THRESHOLD",
            "message": "Predicted dwell of 4.2 days exceeds 3.0 days.",
        }
    ]


def test_incomplete_documentation_and_spec_order() -> None:
    reasons = at_risk_reasons(
        shipment(documentation_status=DocumentationStatus.INCOMPLETE),
        prediction(5.0),
        {PORT: [(day(1), 90.0)]},
    )
    assert codes(reasons) == [
        "FORECAST_THRESHOLD_CROSSED",
        "DWELL_ABOVE_THRESHOLD",
        "DOCUMENTATION_INCOMPLETE",
    ]


def test_cleared_shipments_are_never_at_risk() -> None:
    cleared = shipment(
        status=ShipmentStatus.CLEARED, documentation_status=DocumentationStatus.INCOMPLETE
    )
    assert at_risk_reasons(cleared, prediction(9.0), {PORT: [(day(0), 99.0)]}) == []


def test_stay_uses_actual_arrival_and_covers_whole_days() -> None:
    arrived = shipment(actual_arrival_at=ARRIVAL + timedelta(days=1, hours=3))
    start, end = stay_window(arrived, prediction(0.5))

    assert start == day(1)
    assert end == day(2)  # predicted clearance is before the late arrival: arrival day only
    assert stay_window(shipment(), None) == (day(0), day(1))


def test_warning_codes_come_from_the_latest_prediction() -> None:
    run = prediction(1.0, [{"code": "TARIFF_MISSING", "message": "x"}])
    assert warning_codes(run) == ["TARIFF_MISSING"]
    assert warning_codes(None) == []


def test_dwell_distribution_bins() -> None:
    bins = dwell_distribution([0.2, 0.9, 1.0, 13.99, 14.0, 20.3])

    assert len(bins) == 15
    assert bins[0] == {"bin_start_days": 0, "bin_end_days": 1, "count": 2}
    assert bins[1] == {"bin_start_days": 1, "bin_end_days": 2, "count": 1}
    assert bins[13]["count"] == 1
    assert bins[14] == {"bin_start_days": 14, "bin_end_days": 21, "count": 2}
    assert sum(item["count"] for item in bins) == 6


def test_empty_distribution_keeps_every_bin() -> None:
    bins = dwell_distribution([])
    assert [item["count"] for item in bins] == [0] * 15
    assert bins[14]["bin_end_days"] == 15
