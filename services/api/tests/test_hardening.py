"""B10 hardening: request-body cap (CG-019), date-range rules (CG-020) and the tariff admin API."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import MAX_REQUEST_BODY_BYTES
from app.core.deps import get_db
from app.models import AuditLog, Port
from scripts.seed_dev import seed_demo

ADMIN = {"Authorization": "Bearer dev:admin@portiq.demo"}
IMPORTER = {"Authorization": "Bearer dev:importer@portiq.demo"}


@pytest.fixture
def api(app: FastAPI, client: TestClient, db_session: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        yield client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def demo(db_session: Session) -> Session:
    seed_demo(db_session, app_env="test")
    return db_session


# ------------------------------------------------------------------ body size cap


def test_declared_oversize_body_is_413_before_the_app_runs(api: TestClient) -> None:
    body = b"x" * (MAX_REQUEST_BODY_BYTES + 1)
    res = api.post("/api/v1/shipments", content=body, headers={"Content-Type": "application/json"})

    assert res.status_code == 413
    assert res.json()["error"]["code"] == "BAD_REQUEST"
    assert res.json()["error"]["request_id"] == res.headers["X-Request-ID"]


def test_streamed_oversize_body_is_413(api: TestClient, demo: Session) -> None:
    chunk = b" " * 65536

    def chunks() -> Iterator[bytes]:  # no Content-Length: sent chunked
        for _ in range(MAX_REQUEST_BODY_BYTES // len(chunk) + 2):
            yield chunk

    res = api.post(
        "/api/v1/shipments",
        content=chunks(),
        headers={**IMPORTER, "Content-Type": "application/json"},
    )
    assert res.status_code == 413
    assert res.json()["error"]["code"] == "BAD_REQUEST"


def test_body_under_the_cap_is_handled_normally(api: TestClient, demo: Session) -> None:
    res = api.patch("/api/v1/me", json={"display_name": "Cap Check"}, headers=IMPORTER)
    assert res.status_code == 200


# --------------------------------------------------------------- date-range rules


def test_backwards_shipment_arrival_range_is_422(api: TestClient, demo: Session) -> None:
    res = api.get(
        "/api/v1/shipments?arrival_from=2026-11-20&arrival_to=2026-11-10", headers=IMPORTER
    )
    assert res.status_code == 422
    assert res.json()["error"]["details"][0]["field"] == "arrival_to"


# ----------------------------------------------------------------- tariff admin API


def rule_body(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "rule_type": "port_storage",
        "rate_type": "per_day",
        "rate_value": "450.00",
        "currency": "INR",
        "free_days": 2,
        "container_size_ft": 20,
        "valid_from": "2027-01-01",
        "source_note": "Hardening test rule",
        "version": "test-1",
    }
    body.update(overrides)
    return body


def test_tariff_list_applies_every_filter(api: TestClient, demo: Session) -> None:
    def total(query: str) -> int:
        res = api.get(f"/api/v1/admin/tariffs?page_size=100&{query}", headers=ADMIN)
        assert res.status_code == 200, res.text
        assert "request_id" in res.json()["meta"]
        return int(res.json()["meta"]["pagination"]["total"])

    everything = total("")
    # Seed: 5 customs_duty, 2 port_storage, 4 demurrage, 1 other_charge (spec section 12).
    assert total("rule_type=customs_duty") == 5
    assert total("hs_code_prefix=84") == 1
    assert total("shipping_line=Line%20B") == 1
    assert total("is_active=true") == everything
    assert total("is_active=false") == 0
    assert total("valid_on=2026-06-01") == everything
    assert total("valid_on=2025-06-01") == 0  # seed rules start on 2026-01-01
    port = demo.query(Port).filter(Port.port_code == "INNSA").one()
    assert total(f"port_id={port.id}") == 0  # every seed rule has global port scope
    assert api.get("/api/v1/admin/tariffs?rule_type=nope", headers=ADMIN).status_code == 422


def test_tariff_create_conflict_and_deactivate(api: TestClient, demo: Session) -> None:
    # Port-scoped, so it does not overlap the seed's global 20 ft storage rule.
    innsa = str(demo.query(Port).filter(Port.port_code == "INNSA").one().id)

    def body(**overrides: object) -> dict[str, object]:
        return rule_body(port_id=innsa, **overrides)

    created = api.post("/api/v1/admin/tariffs", json=body(), headers=ADMIN)
    assert created.status_code == 201, created.text
    rule = created.json()["data"]
    assert rule["rate_value"] == "450.00"
    assert rule["version"] == "test-1"
    assert rule["is_active"] is True

    conflict = api.post(
        "/api/v1/admin/tariffs", json=body(valid_from="2027-06-01"), headers=ADMIN
    )
    assert conflict.status_code == 409
    error = conflict.json()["error"]
    assert error["code"] == "TARIFF_CONFLICT"
    assert error["details"] == [{"field": "rule", "issue": rule["id"]}]
    assert error["conflicting_rule"]["id"] == rule["id"]

    # A different scope (40 ft) does not conflict.
    other = api.post("/api/v1/admin/tariffs", json=body(container_size_ft=40), headers=ADMIN)
    assert other.status_code == 201

    deactivated = api.patch(
        f"/api/v1/admin/tariffs/{rule['id']}", json={"is_active": False}, headers=ADMIN
    )
    assert deactivated.status_code == 200
    assert deactivated.json()["data"]["is_active"] is False
    # Once inactive it no longer blocks a new version.
    again = api.post("/api/v1/admin/tariffs", json=body(valid_from="2027-06-01"), headers=ADMIN)
    assert again.status_code == 201

    actions = {
        (log.action, str(log.entity_id))
        for log in demo.query(AuditLog).filter(AuditLog.entity_type == "tariff_rule")
    }
    assert ("create", rule["id"]) in actions
    assert ("deactivate", rule["id"]) in actions


def test_tariff_validation(api: TestClient, demo: Session) -> None:
    def field(body: dict[str, object]) -> str:
        res = api.post("/api/v1/admin/tariffs", json=body, headers=ADMIN)
        assert res.status_code == 422, res.text
        return str(res.json()["error"]["details"][0]["field"])

    assert field(rule_body(valid_to="2026-12-01")) == "valid_to"
    assert field(rule_body(rate_value="-1")) == "rate_value"
    assert field(rule_body(hs_code_prefix="8a")) == "hs_code_prefix"
    assert field(rule_body(source_note="  ")) == "source_note"
    assert field(rule_body(port_id="00000000-0000-0000-0000-000000000000")) == "port_id"

    missing = api.patch(
        "/api/v1/admin/tariffs/00000000-0000-0000-0000-000000000000",
        json={"is_active": False},
        headers=ADMIN,
    )
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "NOT_FOUND"
    reactivate = api.patch(
        "/api/v1/admin/tariffs/00000000-0000-0000-0000-000000000000",
        json={"is_active": True},
        headers=ADMIN,
    )
    assert reactivate.status_code == 422
