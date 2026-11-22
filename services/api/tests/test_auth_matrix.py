"""B10: the backend spec section 7 authorization matrix, endpoint by endpoint and role by role.

Allowed roles must never get 401/403 (a 404 or 422 from the route itself is fine here: the
behaviour is tested elsewhere). Every other role gets 403, and no token gets 401. Resources the
caller may not see are 404, never 403, so ids cannot be probed.
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
from app.models import Port, Profile, Shipment, TariffRule
from app.schemas.enums import ShipmentStatus
from app.services.prediction import RATE_LIMIT_CACHE
from scripts.seed_dev import seed_demo

IMP, OPS, ADM = "importer_exporter", "port_operator", "platform_admin"
EMAILS = {IMP: "importer@portiq.demo", OPS: "operator@portiq.demo", ADM: "admin@portiq.demo"}

# (method, path, roles allowed by the section 7 table). `{shipment}` is importer@'s shipment at
# INMUN, inside operator@'s scope.
MATRIX: list[tuple[str, str, set[str]]] = [
    ("GET", "/me", {IMP, OPS, ADM}),
    ("PATCH", "/me", {IMP, OPS, ADM}),
    ("GET", "/config", {IMP, OPS, ADM}),
    ("GET", "/ports", {IMP, OPS, ADM}),
    ("GET", "/shipments", {IMP, OPS}),
    ("GET", "/shipments/summary", {IMP}),
    ("POST", "/shipments", {IMP}),
    ("GET", "/shipments/{shipment}", {IMP, OPS}),
    ("PATCH", "/shipments/{shipment}", {IMP}),
    ("POST", "/shipments/{shipment}/events", {OPS}),
    ("POST", "/shipments/{shipment}/prediction", {IMP, OPS}),
    ("GET", "/shipments/{shipment}/predictions", {IMP, OPS}),
    ("GET", "/shipments/{shipment}/predictions/{prediction}", {IMP, OPS}),
    ("GET", "/capacity/forecast?port_id={port}&resource_type=yard&from=2026-11-01&to=2026-11-10",
     {IMP, OPS, ADM}),
    ("GET", "/operator/overview", {OPS, ADM}),
    ("GET", "/operator/shipments", {OPS, ADM}),
    ("GET", "/admin/tariffs", {ADM}),
    ("POST", "/admin/tariffs", {ADM}),
    ("PATCH", "/admin/tariffs/{rule}", {ADM}),
    ("GET", "/admin/audit-logs", {ADM}),
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


@pytest.fixture
def ids(api: TestClient, db_session: Session) -> dict[str, str]:
    seed_demo(db_session, app_env="test")
    mundra = db_session.query(Port).filter(Port.port_code == "INMUN").one()
    shipment = (
        db_session.query(Shipment)
        .join(Profile, Profile.id == Shipment.owner_user_id)
        .filter(
            Profile.email == EMAILS[IMP],
            Shipment.port_id == mundra.id,
            Shipment.status == ShipmentStatus.SUBMITTED,
        )
        .order_by(Shipment.reference)
        .first()
    )
    assert shipment is not None, "seed has no submitted importer shipment at INMUN"
    created = api.post(
        f"/api/v1/shipments/{shipment.id}/prediction",
        headers={**headers(IMP), "Idempotency-Key": str(uuid.uuid4())},
    )
    assert created.status_code == 201, created.text
    rule = db_session.query(TariffRule).first()
    assert rule is not None
    return {
        "shipment": str(shipment.id),
        "prediction": created.json()["data"]["prediction_id"],
        "rule": str(rule.id),
        "port": str(mundra.id),
    }


def headers(role: str | None, email: str | None = None) -> dict[str, str]:
    who = email or (EMAILS[role] if role else None)
    return {"Authorization": f"Bearer dev:{who}"} if who else {}


def call(api: TestClient, method: str, path: str, ids: dict[str, str], **kwargs: Any) -> int:
    url = "/api/v1" + path.format(**ids)
    body: dict[str, Any] = {"json": {}} if method in ("POST", "PATCH") else {}
    return api.request(method, url, **body, **kwargs).status_code


@pytest.mark.parametrize(
    ("method", "path", "allowed"), MATRIX, ids=[f"{m} {p}" for m, p, _ in MATRIX]
)
def test_section_7_matrix(
    api: TestClient, ids: dict[str, str], method: str, path: str, allowed: set[str]
) -> None:
    assert call(api, method, path, ids) == 401, "no token"
    for role in (IMP, OPS, ADM):
        status = call(api, method, path, ids, headers=headers(role))
        if role in allowed:
            assert status not in (401, 403), f"{role} should be allowed, got {status}"
        else:
            assert status == 403, f"{role} should be forbidden, got {status}"


def test_matrix_covers_every_contract_route(app: FastAPI) -> None:
    """A new route under /api/v1 must be added to the matrix (diagnostic routes excepted)."""
    # The OpenAPI schema is the public list of routes (included routers are not flattened).
    routes = {
        (method.upper(), path.removeprefix("/api/v1"))
        for path, operations in app.openapi()["paths"].items()
        if path.startswith("/api/v1")
        for method in operations
    }
    listed = {(method, path.split("?")[0]) for method, path, _ in MATRIX}
    named = {
        (m, p.replace("{shipment}", "{shipment_id}")
             .replace("{prediction}", "{prediction_id}").replace("{rule}", "{rule_id}"))
        for m, p in listed
    }
    outside_contract = {("POST", "/predict/dwell"), ("GET", "/operator/dashboard/summary")}
    assert routes - outside_contract == named


def test_hidden_resources_are_404_not_403(api: TestClient, ids: dict[str, str]) -> None:
    other_importer = headers(None, "importer2@portiq.demo")
    innsa_operator = headers(None, "operator2@portiq.demo")  # INNSA only; the shipment is INMUN
    shipment = f"/api/v1/shipments/{ids['shipment']}"
    reads = [
        ("GET", shipment, {}),
        ("GET", f"{shipment}/predictions", {}),
        ("GET", f"{shipment}/predictions/{ids['prediction']}", {}),
        ("POST", f"{shipment}/prediction", {"Idempotency-Key": str(uuid.uuid4())}),
    ]
    for method, url, extra in reads:
        assert api.request(method, url, headers={**other_importer, **extra}).status_code == 404
        assert api.request(method, url, headers={**innsa_operator, **extra}).status_code == 404

    assert api.patch(shipment, headers=other_importer, json={}).status_code == 404
    event = {"to_status": "arrived", "occurred_at": datetime.now(UTC).isoformat()}
    assert api.post(f"{shipment}/events", headers=innsa_operator, json=event).status_code == 404
    capacity = (
        f"/api/v1/capacity/forecast?port_id={ids['port']}&resource_type=yard"
        "&from=2026-11-01&to=2026-11-10"
    )
    assert api.get(capacity, headers=innsa_operator).status_code == 404
    overview = f"/api/v1/operator/overview?port_id={ids['port']}"
    assert api.get(overview, headers=innsa_operator).status_code == 404
