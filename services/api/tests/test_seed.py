"""B02: the dev seed is idempotent and contains the dataset the spec asks for."""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Shipment, ShipmentEvent
from app.schemas.enums import ShipmentStatus
from scripts.seed_dev import seed_demo

EXPECTED_COUNTS = {
    "profiles": 5,
    "ports": 2,
    "operator_ports": 3,
    "shipments": 12,
    "shipment_events": 21,
    "prediction_runs": 0,
    "capacity_forecasts": 0,
    "tariff_rules": 12,
    "audit_logs": 0,
}


def test_seed_is_idempotent(db_session: Session) -> None:
    first = seed_demo(db_session, app_env="test")
    second = seed_demo(db_session, app_env="test")

    assert first == EXPECTED_COUNTS
    assert second == EXPECTED_COUNTS


def test_seed_contains_spec_demo_data(db_session: Session) -> None:
    seed_demo(db_session, app_env="test")

    statuses = Counter(db_session.scalars(select(Shipment.status)).all())
    assert sum(statuses.values()) == 12
    assert all(statuses[status] > 0 for status in ShipmentStatus)

    cleared = db_session.scalars(
        select(Shipment).where(Shipment.status == ShipmentStatus.CLEARED)
    ).all()
    assert cleared, "seed must include cleared shipments"
    assert all(
        a is not None and c is not None and c > a
        for a, c in ((s.actual_arrival_at, s.actual_cleared_at) for s in cleared)
    )


def test_seed_created_events_are_never_in_the_future(db_session: Session) -> None:
    seed_demo(db_session, app_env="test")

    occurred = db_session.scalars(
        select(ShipmentEvent.occurred_at).where(ShipmentEvent.event_type == "created")
    ).all()
    assert len(occurred) == 12
    assert all(value <= datetime.now(UTC) for value in occurred)


def test_seed_refuses_non_dev_environments(db_session: Session) -> None:
    with pytest.raises(RuntimeError, match="dev only"):
        seed_demo(db_session, app_env="production")
