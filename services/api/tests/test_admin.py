"""B08: tariff admin access, conflict handling and authorization."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.models.tables import Profile


@pytest.fixture
def api(app: FastAPI, client: TestClient, db_session: Session) -> Iterator[TestClient]:
    """HTTP client whose requests share the rolled-back test transaction."""
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        yield client
    finally:
        app.dependency_overrides.clear()


def ensure_test_user(db: Session, email: str, role: str) -> None:
    """Create the profile inside the test transaction so it never leaks into another test."""
    if db.query(Profile).filter(Profile.email == email).first() is None:
        db.add(
            Profile(
                id=uuid.uuid4(),
                email=email,
                display_name="Test User",
                role=role,
                is_active=True,
                created_at=datetime.now(UTC),
            )
        )
        db.flush()


def test_admin_create_tariff_and_conflict(api: TestClient, db_session: Session) -> None:
    ensure_test_user(db_session, "admin@portiq.demo", "platform_admin")

    payload = {
        "rule_type": "customs_duty",
        "rate_type": "percent_of_value",
        "rate_value": "10.00",
        "valid_from": "2026-01-01",
        "source_note": "Test rule",
        "currency": "INR",
    }
    headers = {"Authorization": "Bearer dev:admin@portiq.demo"}

    res1 = api.post("/api/v1/admin/tariffs", json=payload, headers=headers)
    assert res1.status_code == 201

    res2 = api.post("/api/v1/admin/tariffs", json=payload, headers=headers)
    assert res2.status_code == 409
    assert res2.json()["error"]["code"] == "TARIFF_CONFLICT"


def test_importer_refused_admin_access(api: TestClient, db_session: Session) -> None:
    ensure_test_user(db_session, "importer@portiq.demo", "importer_exporter")

    headers = {"Authorization": "Bearer dev:importer@portiq.demo"}
    res = api.get("/api/v1/admin/tariffs", headers=headers)
    assert res.status_code == 403
