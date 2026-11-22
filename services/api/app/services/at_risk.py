"""Operator scope, at-risk reasons and dwell distribution (backend spec section 14)."""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from datetime import UTC, datetime, time, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import CAPACITY_HIGH_PCT
from app.models import Port, Profile, Shipment
from app.models.tables import PredictionRun
from app.repositories import capacity as capacity_repo
from app.repositories import operator_ports as operator_ports_repo
from app.schemas.enums import DocumentationStatus, ResourceType, Role, ShipmentStatus

# Section 14: a latest prediction above this many days is a risk.
DWELL_RISK_THRESHOLD_DAYS = 3.0
# Dwell histogram: 1-day bins from 0 to 14 days, then one open-ended 14+ bin.
DWELL_BIN_LIMIT_DAYS = 14

YardSeries = dict[UUID, list[tuple[datetime, float]]]


def day_start(moment: datetime) -> datetime:
    return datetime.combine(moment.astimezone(UTC).date(), time.min, tzinfo=UTC)


def scope_ports(session: Session, user: Profile) -> list[Port]:
    """Operators see their assigned ports; the platform admin sees every port."""
    stmt = select(Port).order_by(Port.name.asc())
    if user.role is not Role.PLATFORM_ADMIN:
        stmt = stmt.where(Port.id.in_(operator_ports_repo.list_port_ids(session, user.id)))
    return list(session.scalars(stmt))


def stay_window(shipment: Shipment, latest: PredictionRun | None) -> tuple[datetime, datetime]:
    """Whole UTC days from the arrival day to the predicted clearance day, end exclusive."""
    arrival = shipment.actual_arrival_at or shipment.expected_arrival_at
    clearance = latest.predicted_clearance_at if latest is not None else arrival
    return day_start(arrival), day_start(max(arrival, clearance)) + timedelta(days=1)


def yard_series(
    session: Session, shipments: Sequence[Shipment], latest: dict[UUID, PredictionRun]
) -> YardSeries:
    """Valid yard buckets covering every listed shipment's stay, grouped by port."""
    if not shipments:
        return {}
    windows = [stay_window(shipment, latest.get(shipment.id)) for shipment in shipments]
    buckets = capacity_repo.list_buckets(
        session,
        port_ids=sorted({shipment.port_id for shipment in shipments}),
        resource_type=ResourceType.YARD,
        start=min(start for start, _ in windows),
        end=max(end for _, end in windows),
    )
    series: YardSeries = {}
    for bucket in buckets:
        series.setdefault(bucket.port_id, []).append(
            (bucket.bucket_start, float(bucket.utilization_pct))
        )
    return series


def at_risk_reasons(
    shipment: Shipment, latest: PredictionRun | None, yard: YardSeries
) -> list[dict[str, str]]:
    """Section 14 reasons, in spec order. Cleared shipments are never at risk."""
    if shipment.status is ShipmentStatus.CLEARED:
        return []

    reasons: list[dict[str, str]] = []
    start, end = stay_window(shipment, latest)
    stay = [pct for moment, pct in yard.get(shipment.port_id, []) if start <= moment < end]
    peak = max(stay, default=None)
    if peak is not None and peak >= CAPACITY_HIGH_PCT:
        reasons.append(
            {
                "code": "FORECAST_THRESHOLD_CROSSED",
                "message": (
                    f"Forecast yard utilization reaches {peak:.0f}% during the expected stay."
                ),
            }
        )
    if latest is not None and float(latest.predicted_dwell_days) > DWELL_RISK_THRESHOLD_DAYS:
        reasons.append(
            {
                "code": "DWELL_ABOVE_THRESHOLD",
                "message": (
                    f"Predicted dwell of {float(latest.predicted_dwell_days):.1f} days exceeds "
                    f"{DWELL_RISK_THRESHOLD_DAYS:.1f} days."
                ),
            }
        )
    if shipment.documentation_status is DocumentationStatus.INCOMPLETE:
        reasons.append(
            {"code": "DOCUMENTATION_INCOMPLETE", "message": "Documentation is incomplete."}
        )
    return reasons


def warning_codes(latest: PredictionRun | None) -> list[str]:
    return [str(warning["code"]) for warning in latest.warnings] if latest is not None else []


def dwell_distribution(dwell_days: Iterable[float]) -> list[dict[str, Any]]:
    """Every bin is returned (zeros included) so the chart axis stays stable.

    The contract needs a numeric end for the last bin, so the 14+ bin ends at the largest
    dwell it holds, rounded up (at least 15).
    """
    counts = [0] * (DWELL_BIN_LIMIT_DAYS + 1)
    longest = float(DWELL_BIN_LIMIT_DAYS + 1)
    for days in dwell_days:
        index = min(int(max(days, 0.0)), DWELL_BIN_LIMIT_DAYS)
        counts[index] += 1
        if index == DWELL_BIN_LIMIT_DAYS:
            longest = max(longest, float(math.ceil(days)))
    return [
        {
            "bin_start_days": index,
            "bin_end_days": index + 1 if index < DWELL_BIN_LIMIT_DAYS else int(longest),
            "count": count,
        }
        for index, count in enumerate(counts)
    ]
