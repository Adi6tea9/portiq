"""CG-021: customs channel, importer type and cargo priority reach the model.

Holidays are derived from the arrival date.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.models import Port
from app.repositories import ports as ports_repo
from app.services.ml import dwell_model
from app.services.model_service import feature_row
from app.services.prediction import RATE_LIMIT_CACHE, _generate_input_hash
from scripts.seed_dev import seed_demo

IMPORTER = {"Authorization": "Bearer dev:importer@portiq.demo"}


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


@pytest.fixture
def port(db_session: Session) -> Port:
    seed_demo(db_session, app_env="test")
    found = ports_repo.get_by_code(db_session, "INNSA")
    assert found is not None
    return found


def body(port: Port, reference: str, **overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "port_id": str(port.id), "reference": reference, "direction": "import",
        "cargo_type": "general_container", "container_size_ft": 40, "hs_code": "847130",
        "weight_kg": 12000, "declared_value": "100000.00", "currency": "INR",
        "shipping_line": "Line A", "vessel_size_band": "large",
        "expected_arrival_at": "2026-12-01T10:00:00Z", "documentation_status": "complete",
    }
    data.update(overrides)
    return data


def create(api: TestClient, port: Port, reference: str, **overrides: Any) -> dict[str, Any]:
    res = api.post("/api/v1/shipments", json=body(port, reference, **overrides), headers=IMPORTER)
    assert res.status_code == 201, res.text
    return dict(res.json()["data"])


def predict(api: TestClient, shipment_id: str) -> dict[str, Any]:
    res = api.post(
        f"/api/v1/shipments/{shipment_id}/prediction",
        headers={**IMPORTER, "Idempotency-Key": str(uuid.uuid4())},
    )
    assert res.status_code == 201, res.text
    return dict(res.json()["data"])


def test_fields_round_trip_with_defaults_when_omitted(api: TestClient, port: Port) -> None:
    plain = create(api, port, "MI-DEFAULTS")
    assert (plain["customs_channel"], plain["importer_type"], plain["cargo_priority"]) == (
        "unknown", "regular", "standard",
    )
    given = create(
        api, port, "MI-GIVEN",
        customs_channel="red", importer_type="AEO", cargo_priority="expedited",
    )
    assert (given["customs_channel"], given["importer_type"], given["cargo_priority"]) == (
        "red", "AEO", "expedited",
    )


def test_fields_can_be_edited_and_are_validated(api: TestClient, port: Port) -> None:
    shipment = create(api, port, "MI-EDIT")
    patched = api.patch(
        f"/api/v1/shipments/{shipment['id']}", json={"customs_channel": "orange"}, headers=IMPORTER
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["data"]["customs_channel"] == "orange"

    for field, value in (("customs_channel", "blue"), ("importer_type", "Standard"),
                         ("cargo_priority", "urgent")):
        res = api.post("/api/v1/shipments", json=body(port, f"MI-BAD-{field}", **{field: value}),
                       headers=IMPORTER)
        assert res.status_code == 422, (field, res.text)
        assert res.json()["error"]["details"][0]["field"] == field


def test_the_model_responds_to_the_new_inputs(api: TestClient, port: Port) -> None:
    if not dwell_model.is_loaded:
        pytest.skip("model artifact not built")
    green = predict(api, create(api, port, "MI-GREEN", customs_channel="green")["id"])
    red = predict(api, create(api, port, "MI-RED", customs_channel="red")["id"])
    assert red["predicted_dwell_days"] > green["predicted_dwell_days"]

    names = {item["name"] for item in red["explanation"]["features"]}
    assert {"customs_channel", "importer_type", "cargo_priority"} <= names
    channel = next(i for i in red["explanation"]["features"] if i["name"] == "customs_channel")
    assert channel["value"] == "red" and channel["contribution"] > 0


def test_holiday_is_derived_from_the_arrival_date(port: Port, db_session: Session) -> None:
    from app.models import Shipment

    shipment = Shipment(
        expected_arrival_at=datetime(2026, 8, 15, 10, tzinfo=UTC), direction="import",
        cargo_type="general_container", container_size_ft=20, hs_code="847130", weight_kg=1000,
        shipping_line="Line A", vessel_size_band="small", documentation_status="complete",
        customs_channel="unknown", importer_type="regular", cargo_priority="standard",
    )
    assert feature_row(shipment, port, 70.0)["is_holiday"] == 1  # Independence Day
    shipment.expected_arrival_at = datetime(2026, 8, 16, 10, tzinfo=UTC)
    assert feature_row(shipment, port, 70.0)["is_holiday"] == 0


def test_changing_a_model_input_changes_the_idempotency_hash(api: TestClient, port: Port,
                                                             db_session: Session) -> None:
    from app.models import Shipment

    created = create(api, port, "MI-HASH")
    shipment = db_session.get(Shipment, uuid.UUID(created["id"]))
    assert shipment is not None
    before = _generate_input_hash(shipment)
    shipment.cargo_priority = "government"  # type: ignore[assignment]
    assert _generate_input_hash(shipment) != before
