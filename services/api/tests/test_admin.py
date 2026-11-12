import uuid
from datetime import datetime
from app.models.tables import Profile
from app.db import get_db

def ensure_test_user(email: str, role: str):
    """Inserts a real profile into the empty test DB so auth and foreign keys pass natively."""
    db = next(get_db())
    existing = db.query(Profile).filter(Profile.email == email).first()
    if not existing:
        user = Profile(
            id=str(uuid.uuid4()),
            email=email,
            display_name="Test User",
            role=role,
            is_active=True,
            created_at=datetime.utcnow()
        )
        db.add(user)
        db.commit()
    db.close()

def test_admin_create_tariff_and_conflict(client):
    ensure_test_user("admin@portiq.demo", "platform_admin")
    
    payload = {
        "rule_type": "customs_duty",
        "rate_type": "percent_of_value",
        "rate_value": "10.00",
        "valid_from": "2026-01-01",
        "source_note": "Test rule",
        "currency": "INR"
    }
    headers = {"Authorization": "Bearer dev:admin@portiq.demo"}
    
    res1 = client.post("/api/v1/admin/tariffs", json=payload, headers=headers)
    assert res1.status_code == 201
    
    res2 = client.post("/api/v1/admin/tariffs", json=payload, headers=headers)
    assert res2.status_code == 409
    assert res2.json()["error"]["code"] == "TARIFF_CONFLICT"

def test_importer_refused_admin_access(client):
    ensure_test_user("importer@portiq.demo", "importer_exporter")
    
    headers = {"Authorization": "Bearer dev:importer@portiq.demo"}
    res = client.get("/api/v1/admin/tariffs", headers=headers)
    assert res.status_code == 403