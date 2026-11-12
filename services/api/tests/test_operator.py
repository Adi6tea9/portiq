"""Tests for B10 Operator Views and Scope Isolation."""
from __future__ import annotations
import uuid
from datetime import datetime, UTC
from collections.abc import Iterator
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.models.tables import Profile, Shipment, OperatorPort, Port
from scripts.seed_dev import seed_demo

@pytest.fixture
def api(app: FastAPI, client: TestClient, db_session: Session) -> Iterator[TestClient]:
    """Shares the rolled-back test transaction."""
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        yield client
    finally:
        app.dependency_overrides.clear()

@pytest.fixture
def demo(db_session: Session) -> Session:
    """Seeds the test database with dummy data and strictly ensures our test operators exist."""
    seed_demo(db_session, app_env="test")
    
    # 1. Ensure Operator 1 exists
    op1 = db_session.query(Profile).filter(Profile.email == "operator1@portiq.demo").first()
    if not op1:
        op1 = Profile(id=str(uuid.uuid4()), email="operator1@portiq.demo", role="port_operator", is_active=True, created_at=datetime.now(UTC))
        db_session.add(op1)
    
    # 2. Ensure Operator 2 exists
    op2 = db_session.query(Profile).filter(Profile.email == "operator2@portiq.demo").first()
    if not op2:
        op2 = Profile(id=str(uuid.uuid4()), email="operator2@portiq.demo", role="port_operator", is_active=True, created_at=datetime.now(UTC))
        db_session.add(op2)
        
    # 3. Ensure a specific port exists for Operator 1
    port = db_session.query(Port).filter(Port.port_code == "TOP1").first()
    if not port:
        port = Port(id=str(uuid.uuid4()), name="Test Op Port", port_code="TOP1", country="IN", timezone="UTC", created_at=datetime.now(UTC))
        db_session.add(port)
        
    db_session.commit()
    
    # 4. Assign the port to Operator 1
    op_port = db_session.query(OperatorPort).filter(OperatorPort.user_id == op1.id, OperatorPort.port_id == port.id).first()
    if not op_port:
        db_session.add(OperatorPort(user_id=op1.id, port_id=port.id))
        
    # 5. Create a target shipment at Operator 1's port
    shipment = db_session.query(Shipment).filter(Shipment.reference == "SNEAKY-TEST").first()
    if not shipment:
        importer = db_session.query(Profile).filter(Profile.role == "importer_exporter").first()
        shipment = Shipment(
            id=str(uuid.uuid4()), owner_user_id=importer.id, port_id=port.id, reference="SNEAKY-TEST",
            direction="import", cargo_type="general_container", container_size_ft=20, hs_code="123456",
            weight_kg=100, declared_value=100, currency="INR", shipping_line="other", vessel_size_band="small",
            expected_arrival_at=datetime.now(UTC), documentation_status="complete", status="submitted",
            created_at=datetime.now(UTC)
        )
        db_session.add(shipment)
        
    db_session.commit()
    return db_session


def test_operator_dashboard_summary(api: TestClient, demo: Session) -> None:
    # Operator 1 hits the dashboard
    headers = {"Authorization": "Bearer dev:operator1@portiq.demo"}
    res = api.get("/api/v1/operator/dashboard/summary", headers=headers)
    
    assert res.status_code == 200
    data = res.json()["data"]
    assert "total_incoming" in data
    assert "status_counts" in data
    assert "assigned_ports" in data
    assert len(data["assigned_ports"]) > 0


def test_importer_forbidden_from_dashboard(api: TestClient, demo: Session) -> None:
    # Importers are not allowed to view the operator dashboard
    headers = {"Authorization": "Bearer dev:importer@portiq.demo"}
    res = api.get("/api/v1/operator/dashboard/summary", headers=headers)
    assert res.status_code == 403


def test_operator_scope_isolation(api: TestClient, demo: Session) -> None:
    """Verify operator2 cannot read or modify shipments for operator1's ports."""
    
    # 1. Identify a shipment assigned specifically to Operator 1
    op1 = demo.query(Profile).filter(Profile.email == "operator1@portiq.demo").first()
    op1_ports = demo.query(OperatorPort).filter(OperatorPort.user_id == op1.id).all()
    op1_port_ids = [p.port_id for p in op1_ports]
    
    shipment = demo.query(Shipment).filter(Shipment.port_id.in_(op1_port_ids)).first()
    assert shipment is not None
    
    # 2. Operator 2 tries to access Operator 1's shipment
    headers = {"Authorization": "Bearer dev:operator2@portiq.demo"}
    
    # GET should return 404 Not Found (hidden from view for security)
    res_get = api.get(f"/api/v1/shipments/{shipment.id}", headers=headers)
    assert res_get.status_code == 404, "Sneaky operator should get 404 on unassigned shipments"
    
    # POST event should also return 404 Not Found
    payload = {
        "occurred_at": "2026-11-15T12:00:00Z",
        "to_status": "arrived",
        "note": "Sneaky arrival update"
    }
    res_post = api.post(f"/api/v1/shipments/{shipment.id}/events", json=payload, headers=headers)
    assert res_post.status_code == 404, "Sneaky operator should get 404 when recording events"