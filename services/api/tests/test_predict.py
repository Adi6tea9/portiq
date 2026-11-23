"""Tests for B09 ML prediction orchestration."""
from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.models.tables import CapacityForecast, Port, Profile, Shipment
from app.schemas.enums import (
    CargoType,
    DocumentationStatus,
    ResourceType,
    ShippingLine,
    SourceType,
)
from app.services.explain import explain
from app.services.ml import dwell_model
from app.services.model_service import FEATURE_NAMES, feature_row, predict_dwell
from app.services.prediction import RATE_LIMIT_CACHE
from scripts.seed_dev import seed_demo


@pytest.fixture(autouse=True)
def reset_rate_limiter() -> None:
    """Ensure rate limits are wiped clean between tests."""
    RATE_LIMIT_CACHE.clear()

@pytest.fixture
def api(app: FastAPI, client: TestClient, db_session: Session) -> Iterator[TestClient]:
    """HTTP client whose requests share the rolled-back test transaction."""
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        yield client
    finally:
        app.dependency_overrides.clear()

@pytest.fixture
def demo(db_session: Session) -> Session:
    seed_demo(db_session, app_env="test")
    return db_session

def _auth_headers(email: str = "importer@portiq.demo") -> dict[str, str]:
    return {"Authorization": f"Bearer dev:{email}"}

def _owned_shipment(demo: Session) -> Shipment:
    """The importer's own shipment: an unowned ``first()`` row is a flaky 404."""
    shipment = (
        demo.query(Shipment)
        .join(Profile, Profile.id == Shipment.owner_user_id)
        .filter(Profile.email == "importer@portiq.demo")
        .first()
    )
    assert shipment is not None
    return shipment


def test_prediction_idempotency_and_rate_limit(api: TestClient, demo: Session) -> None:
    # 1. Grab a natively seeded shipment
    shipment = _owned_shipment(demo)
    
    idempotency_key = str(uuid.uuid4())
    headers = _auth_headers()
    headers["Idempotency-Key"] = idempotency_key
    
    # 2. First run creates the prediction (201)
    res1 = api.post(f"/api/v1/shipments/{shipment.id}/prediction", headers=headers)
    assert res1.status_code == 201, res1.text
    
    # 3. Exact same run returns original calculation (200)
    res2 = api.post(f"/api/v1/shipments/{shipment.id}/prediction", headers=headers)
    assert res2.status_code == 200
    assert res1.json()["data"]["prediction_id"] == res2.json()["data"]["prediction_id"]
    
    # 4. Modify shipment behind the scenes to trigger a Conflict (409)
    shipment.weight_kg = Decimal("25000.00")
    demo.commit()
    
    res3 = api.post(f"/api/v1/shipments/{shipment.id}/prediction", headers=headers)
    assert res3.status_code == 409
    assert res3.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"

    # 5. Hammer the endpoint to trigger the rate limit (429)
    for _ in range(10):
        api.post(f"/api/v1/shipments/{shipment.id}/prediction", headers={
            "Authorization": "Bearer dev:importer@portiq.demo",
            "Idempotency-Key": str(uuid.uuid4())
        })
        
    res_rate_limit = api.post(f"/api/v1/shipments/{shipment.id}/prediction", headers={
        "Authorization": "Bearer dev:importer@portiq.demo",
        "Idempotency-Key": str(uuid.uuid4())
    })
    assert res_rate_limit.status_code == 429

def test_prediction_partial_cost_fallback(api: TestClient, demo: Session) -> None:
    # Test that a shipment with no matching demurrage rules correctly returns "unavailable"
    shipment = _owned_shipment(demo)
    shipment.shipping_line = ShippingLine.OTHER
    demo.commit()
    
    headers = _auth_headers()
    headers["Idempotency-Key"] = str(uuid.uuid4())
    
    res = api.post(f"/api/v1/shipments/{shipment.id}/prediction", headers=headers)
    assert res.status_code == 201
    
    data = res.json()["data"]
    assert data["total_is_partial"] is True
    
    warnings = [w["code"] for w in data["warnings"]]
    assert "TARIFF_MISSING" in warnings
    
    demurrage = next(c for c in data["cost_breakdown"] if c["component"] == "demurrage")
    assert demurrage["status"] == "unavailable"
    assert demurrage["amount"] is None


def test_prediction_comes_from_the_model(api: TestClient, demo: Session) -> None:
    """Different inputs must produce different estimates, so no constant is served."""
    shipment = _owned_shipment(demo)
    assert shipment is not None

    def run() -> float:
        res = api.post(
            f"/api/v1/shipments/{shipment.id}/prediction",
            headers={**_auth_headers(), "Idempotency-Key": str(uuid.uuid4())},
        )
        assert res.status_code == 201, res.text
        return float(res.json()["data"]["predicted_dwell_days"])

    first = run()
    shipment.weight_kg = Decimal("55000.00")
    shipment.documentation_status = DocumentationStatus.INCOMPLETE
    shipment.cargo_type = CargoType.HAZARDOUS
    demo.commit()
    second = run()

    assert first > 0
    assert first != second


def test_prediction_uses_the_stored_capacity_bucket(api: TestClient, demo: Session) -> None:
    shipment = _owned_shipment(demo)
    assert shipment is not None
    arrival = shipment.expected_arrival_at
    demo.add(
        CapacityForecast(
            port_id=shipment.port_id,
            resource_type=ResourceType.YARD,
            bucket_start=arrival - timedelta(hours=12),
            bucket_end=arrival + timedelta(hours=12),
            predicted_occupied=915,
            total_capacity=1000,
            utilization_pct=91.5,
            source_type=SourceType.SYNTHETIC,
            model_or_rule_version="sim-1.0",
            generated_at=datetime.now(UTC),
        )
    )
    demo.flush()

    res = api.post(
        f"/api/v1/shipments/{shipment.id}/prediction",
        headers={**_auth_headers(), "Idempotency-Key": str(uuid.uuid4())},
    )
    assert res.status_code == 201, res.text
    data = res.json()["data"]

    assert data["capacity_snapshot"]["status"] == "available"
    assert data["capacity_snapshot"]["utilization_pct"] == 91.5
    assert "CAPACITY_UNAVAILABLE" not in [w["code"] for w in data["warnings"]]


def test_explanation_adds_up_to_the_prediction(demo: Session, client: TestClient) -> None:
    shipment = _owned_shipment(demo)
    port = demo.get(Port, shipment.port_id)
    assert shipment is not None and port is not None

    features = feature_row(shipment, port, 72.5)
    prediction = predict_dwell(features)
    explanation = explain(features, prediction)

    assert explanation["status"] == "available", explanation["reason"]
    assert explanation["method"] == "SHAP"
    assert len(explanation["features"]) == len(FEATURE_NAMES)
    total = explanation["base_value_days"] + sum(
        item["contribution"] for item in explanation["features"]
    )
    assert abs(total - prediction) <= 1e-3
    assert {item["name"] for item in explanation["features"]} == set(FEATURE_NAMES)


def test_missing_model_returns_503(
    api: TestClient, demo: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    shipment = _owned_shipment(demo)
    monkeypatch.setattr(dwell_model, "_is_loaded", False)

    res = api.post(
        f"/api/v1/shipments/{shipment.id}/prediction",
        headers={**_auth_headers(), "Idempotency-Key": str(uuid.uuid4())},
    )
    assert res.status_code == 503
    assert res.json()["error"]["code"] == "MODEL_UNAVAILABLE"
    