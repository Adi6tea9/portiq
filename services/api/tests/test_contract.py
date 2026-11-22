"""B10 contract tests: real API responses vs the frontend's mock payloads.

Each file in ``tests/fixtures/frontend_contract`` is one example the UI is built against (copied
from ``apps/web/lib/mocks``; see the README there). A real response must have exactly the same
field names, at every level, and the same JSON type for every value.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.models import CapacityForecast, Profile, Shipment
from app.schemas.enums import ResourceType, ShipmentStatus, SourceType
from app.services.prediction import RATE_LIMIT_CACHE
from scripts.seed_dev import seed_demo

FIXTURES = Path(__file__).parent / "fixtures" / "frontend_contract"
# Fields the contract types as `unknown` or as a string-or-number union: compared by presence only.
FREE_FORM = frozenset({"tier_config", "before", "after", "value"})


def json_type(value: Any) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int | float):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    return "object"


def shape_mismatches(expected: Any, actual: Any, path: str = "$") -> list[str]:
    """Differences in field names or JSON types. ``null`` on either side matches any type."""
    if expected is None or actual is None:
        return []
    if json_type(expected) != json_type(actual):
        return [f"{path}: expected {json_type(expected)}, got {json_type(actual)}"]
    if isinstance(expected, dict):
        problems = [f"{path}: missing field {key!r}" for key in expected.keys() - actual.keys()]
        problems += [f"{path}: extra field {key!r}" for key in actual.keys() - expected.keys()]
        for key in expected.keys() & actual.keys():
            if key not in FREE_FORM:
                problems += shape_mismatches(expected[key], actual[key], f"{path}.{key}")
        return problems
    if isinstance(expected, list) and expected:
        return [
            problem
            for index, item in enumerate(actual)
            for problem in shape_mismatches(expected[0], item, f"{path}[{index}]")
        ]
    return []


def test_shape_checker_catches_real_differences() -> None:
    fixture = {"id": "a", "n": 1, "rows": [{"x": True}], "note": None}

    assert shape_mismatches(fixture, {"id": "b", "n": 2.5, "rows": [], "note": "set"}) == []
    assert shape_mismatches(fixture, {"id": "b", "n": 2, "rows": [{"x": True}]}) == [
        "$: missing field 'note'"
    ]
    assert shape_mismatches(fixture, {**fixture, "extra": 1}) == ["$: extra field 'extra'"]
    assert shape_mismatches(fixture, {**fixture, "n": "1"}) == ["$.n: expected number, got string"]
    assert shape_mismatches(fixture, {**fixture, "rows": [{"x": 1}]}) == [
        "$.rows[0].x: expected boolean, got number"
    ]


@pytest.fixture(autouse=True)
def reset_rate_limiter() -> None:
    RATE_LIMIT_CACHE.clear()


@pytest.fixture
def api(app: FastAPI, client: TestClient, db_session: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        yield client
    finally:
        app.dependency_overrides.clear()


def auth(email: str) -> dict[str, str]:
    return {"Authorization": f"Bearer dev:{email}"}


def data(response: Any) -> Any:
    assert response.status_code < 300, response.text
    return response.json()["data"]


@pytest.fixture
def real_responses(api: TestClient, db_session: Session) -> dict[str, Any]:
    """One real response per contract type, built from the seeded demo data."""
    seed_demo(db_session, app_env="test")
    importer, operator, admin = (
        auth("importer@portiq.demo"),
        auth("operator@portiq.demo"),
        auth("admin@portiq.demo"),
    )
    shipment = (
        db_session.query(Shipment)
        .join(Profile, Profile.id == Shipment.owner_user_id)
        .filter(Profile.email == "importer@portiq.demo", Shipment.status != ShipmentStatus.CLEARED)
        .order_by(Shipment.reference)
        .first()
    )
    assert shipment is not None
    arrival = shipment.expected_arrival_at
    # A stored bucket makes the capacity snapshot "available", like the fixture.
    db_session.add(
        CapacityForecast(
            port_id=shipment.port_id,
            resource_type=ResourceType.YARD,
            bucket_start=arrival - timedelta(hours=12),
            bucket_end=arrival + timedelta(hours=12),
            predicted_occupied=700,
            total_capacity=1000,
            utilization_pct=70,
            source_type=SourceType.SYNTHETIC,
            model_or_rule_version="sim-1.0",
            generated_at=datetime.now(UTC),
        )
    )
    db_session.flush()

    prediction = data(
        api.post(
            f"/api/v1/shipments/{shipment.id}/prediction",
            headers={**importer, "Idempotency-Key": str(uuid.uuid4())},
        )
    )
    # An operator event writes an audit row.
    data(
        api.post(
            f"/api/v1/shipments/{shipment.id}/events",
            headers=operator,
            json={"to_status": "arrived", "occurred_at": datetime.now(UTC).isoformat()},
        )
    )
    day = arrival.date()
    shipments = data(api.get("/api/v1/shipments?page_size=100", headers=importer))
    rows = data(api.get("/api/v1/operator/shipments?page_size=100", headers=operator))

    return {
        "me": data(api.get("/api/v1/me", headers=importer)),
        "config": data(api.get("/api/v1/config", headers=importer)),
        "port": data(api.get("/api/v1/ports", headers=importer))[0],
        "shipment": next(item for item in shipments if item["latest_prediction"]),
        "shipment_detail": data(api.get(f"/api/v1/shipments/{shipment.id}", headers=importer)),
        "shipment_summary": data(api.get("/api/v1/shipments/summary", headers=importer)),
        "prediction": prediction,
        "prediction_history_item": data(
            api.get(f"/api/v1/shipments/{shipment.id}/predictions", headers=importer)
        )[0],
        "capacity_bucket": data(
            api.get(
                f"/api/v1/capacity/forecast?port_id={shipment.port_id}&resource_type=yard"
                f"&from={day - timedelta(days=1)}&to={day + timedelta(days=1)}",
                headers=importer,
            )
        )[0],
        "operator_overview": data(
            api.get(
                f"/api/v1/operator/overview?from={day - timedelta(days=3)}"
                f"&to={day + timedelta(days=10)}&port_id={shipment.port_id}",
                headers=operator,
            )
        ),
        "operator_shipment_row": next(row for row in rows if row["shipment"]["latest_prediction"]),
        "tariff_rule": data(api.get("/api/v1/admin/tariffs", headers=admin))[0],
        "audit_log_item": data(api.get("/api/v1/admin/audit-logs", headers=admin))[0],
        "error_404": api.get(f"/api/v1/shipments/{uuid.uuid4()}", headers=importer).json(),
    }


def test_every_fixture_has_a_real_response(real_responses: dict[str, Any]) -> None:
    assert {path.stem for path in FIXTURES.glob("*.json")} == set(real_responses)


def test_real_responses_match_the_frontend_contract(real_responses: dict[str, Any]) -> None:
    problems = {
        name: mismatches
        for name, actual in real_responses.items()
        if (
            mismatches := shape_mismatches(
                json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8")), actual
            )
        )
    }
    assert problems == {}
