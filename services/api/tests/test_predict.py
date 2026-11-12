"""Tests for B09 ML prediction orchestration."""
from __future__ import annotations
import uuid
import pytest
from collections.abc import Iterator
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.core.deps import get_db
from app.models.tables import Shipment
from scripts.seed_dev import seed_demo
from app.services.prediction import RATE_LIMIT_CACHE

@pytest.fixture(autouse=True)
def reset_rate_limiter():
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

def test_prediction_idempotency_and_rate_limit(api: TestClient, demo: Session) -> None:
    # 1. Grab a natively seeded shipment
    shipment = demo.query(Shipment).first()
    
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
    shipment.weight_kg = 25000.0
    demo.commit()
    
    res3 = api.post(f"/api/v1/shipments/{shipment.id}/prediction", headers=headers)
    assert res3.status_code == 409
    assert res3.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"

    # 5. Hammer the endpoint to trigger the rate limit (429)
    for _ in range(10):
        api.post(f"/api/v1/shipments/{shipment.id}/prediction", headers={
            "Authorization": f"Bearer dev:importer@portiq.demo",
            "Idempotency-Key": str(uuid.uuid4())
        })
        
    res_rate_limit = api.post(f"/api/v1/shipments/{shipment.id}/prediction", headers={
        "Authorization": f"Bearer dev:importer@portiq.demo",
        "Idempotency-Key": str(uuid.uuid4())
    })
    assert res_rate_limit.status_code == 429

def test_prediction_partial_cost_fallback(api: TestClient, demo: Session) -> None:
    # Test that a shipment with no matching demurrage rules correctly returns "unavailable"
    shipment = demo.query(Shipment).first()
    shipment.shipping_line = "other"
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
    