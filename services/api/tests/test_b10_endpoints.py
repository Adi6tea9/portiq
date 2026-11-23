"""B10 endpoints: single prediction, audit logs, operator overview and operator shipments."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.models import Port, Profile, Shipment
from app.schemas.enums import ShipmentStatus
from app.services.prediction import RATE_LIMIT_CACHE
from scripts.seed_dev import seed_demo

# The seed's shipments arrive between 20 Oct and 28 Nov 2026.
NOVEMBER = {"from": "2026-11-01", "to": "2026-12-01"}


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
def demo(db_session: Session) -> Session:
    seed_demo(db_session, app_env="test")
    return db_session


def auth(email: str) -> dict[str, str]:
    return {"Authorization": f"Bearer dev:{email}"}


def owned_shipment(demo: Session, email: str = "importer@portiq.demo") -> Shipment:
    shipment = (
        demo.query(Shipment)
        .join(Profile, Profile.id == Shipment.owner_user_id)
        .filter(Profile.email == email, Shipment.status != ShipmentStatus.CLEARED)
        .order_by(Shipment.reference)
        .first()
    )
    assert shipment is not None
    return shipment


def port_id(demo: Session, code: str) -> str:
    port = demo.query(Port).filter(Port.port_code == code).one()
    return str(port.id)


# ------------------------------------------------------------- GET prediction by id


def test_prediction_by_id_returns_the_stored_prediction(api: TestClient, demo: Session) -> None:
    shipment = owned_shipment(demo)
    created = api.post(
        f"/api/v1/shipments/{shipment.id}/prediction",
        headers={**auth("importer@portiq.demo"), "Idempotency-Key": str(uuid.uuid4())},
    )
    assert created.status_code == 201, created.text
    prediction = created.json()["data"]

    url = f"/api/v1/shipments/{shipment.id}/predictions/{prediction['prediction_id']}"
    res = api.get(url, headers=auth("importer@portiq.demo"))

    assert res.status_code == 200, res.text
    assert res.json()["data"] == prediction
    # A scoped operator can read it too.
    assert api.get(url, headers=auth("operator@portiq.demo")).status_code == 200


def test_prediction_by_id_is_hidden_from_others(api: TestClient, demo: Session) -> None:
    shipment = owned_shipment(demo)
    created = api.post(
        f"/api/v1/shipments/{shipment.id}/prediction",
        headers={**auth("importer@portiq.demo"), "Idempotency-Key": str(uuid.uuid4())},
    )
    prediction_id = created.json()["data"]["prediction_id"]
    url = f"/api/v1/shipments/{shipment.id}/predictions/{prediction_id}"
    other = owned_shipment(demo, "importer2@portiq.demo")

    assert api.get(url, headers=auth("importer2@portiq.demo")).status_code == 404
    assert api.get(url, headers=auth("admin@portiq.demo")).status_code == 403
    assert api.get(url).status_code == 401
    # The id exists but belongs to another shipment: still a 404.
    wrong_parent = f"/api/v1/shipments/{other.id}/predictions/{prediction_id}"
    assert api.get(wrong_parent, headers=auth("importer2@portiq.demo")).status_code == 404
    unknown = f"/api/v1/shipments/{shipment.id}/predictions/{uuid.uuid4()}"
    assert api.get(unknown, headers=auth("importer@portiq.demo")).status_code == 404


# ------------------------------------------------------------------ audit logs


def test_audit_logs_are_admin_only_and_newest_first(api: TestClient, demo: Session) -> None:
    shipment = (
        demo.query(Shipment).filter(Shipment.status == ShipmentStatus.SUBMITTED).first()
    )
    assert shipment is not None
    event = api.post(
        f"/api/v1/shipments/{shipment.id}/events",
        headers=auth("operator@portiq.demo"),
        json={"to_status": "arrived", "occurred_at": datetime.now(UTC).isoformat()},
    )
    assert event.status_code == 200, event.text

    res = api.get("/api/v1/admin/audit-logs?page=1&page_size=5", headers=auth("admin@portiq.demo"))
    assert res.status_code == 200, res.text
    body = res.json()
    logs = body["data"]
    assert body["meta"]["pagination"]["page_size"] == 5
    assert body["meta"]["pagination"]["total"] >= 1
    assert logs[0]["entity_id"] == str(shipment.id)
    assert logs[0]["actor_display_name"] == "Demo Operator"
    assert set(logs[0]) == {
        "id", "actor_display_name", "action", "entity_type", "entity_id",
        "before", "after", "created_at", "request_id",
    }
    stamps = [log["created_at"] for log in logs]
    assert stamps == sorted(stamps, reverse=True)

    for email in ("importer@portiq.demo", "operator@portiq.demo"):
        assert api.get("/api/v1/admin/audit-logs", headers=auth(email)).status_code == 403
    assert api.get("/api/v1/admin/audit-logs").status_code == 401


# ----------------------------------------------------------- operator shipments


def test_operator_shipments_respect_port_scope(api: TestClient, demo: Session) -> None:
    innsa = port_id(demo, "INNSA")

    def ports_seen(email: str) -> set[str]:
        res = api.get("/api/v1/operator/shipments?page_size=100", headers=auth(email))
        assert res.status_code == 200, res.text
        return {row["shipment"]["port_id"] for row in res.json()["data"]}

    assert ports_seen("operator2@portiq.demo") == {innsa}
    assert ports_seen("operator@portiq.demo") == {innsa, port_id(demo, "INMUN")}
    assert ports_seen("admin@portiq.demo") >= {innsa}
    importer = api.get("/api/v1/operator/shipments", headers=auth("importer@portiq.demo"))
    assert importer.status_code == 403


def test_operator_shipments_rows_and_filters(api: TestClient, demo: Session) -> None:
    headers = auth("operator@portiq.demo")
    everything = api.get("/api/v1/operator/shipments?page_size=100", headers=headers).json()
    rows = everything["data"]
    assert rows and set(rows[0]) == {"shipment", "at_risk_reasons", "warning_codes"}

    incomplete = [
        row for row in rows
        if row["shipment"]["documentation_status"] == "incomplete"
        and row["shipment"]["status"] != "cleared"
    ]
    assert incomplete
    for row in incomplete:
        assert "DOCUMENTATION_INCOMPLETE" in {reason["code"] for reason in row["at_risk_reasons"]}

    at_risk = api.get("/api/v1/operator/shipments?at_risk=true&page_size=100", headers=headers)
    calm = api.get("/api/v1/operator/shipments?at_risk=false&page_size=100", headers=headers)
    assert all(row["at_risk_reasons"] for row in at_risk.json()["data"])
    assert not any(row["at_risk_reasons"] for row in calm.json()["data"])
    assert (
        at_risk.json()["meta"]["pagination"]["total"] + calm.json()["meta"]["pagination"]["total"]
        == everything["meta"]["pagination"]["total"]
    )

    arrived = api.get("/api/v1/operator/shipments?status=arrived", headers=headers).json()["data"]
    assert all(row["shipment"]["status"] == "arrived" for row in arrived)

    window = api.get(
        "/api/v1/operator/shipments?page_size=100"
        "&arrival_from=2026-11-12T00:00:00.000Z&arrival_to=2026-11-18T23:59:59.999Z",
        headers=headers,
    ).json()["data"]
    assert window
    assert all(
        "2026-11-12" <= row["shipment"]["expected_arrival_at"][:10] <= "2026-11-18"
        for row in window
    )

    page = api.get("/api/v1/operator/shipments?page=2&page_size=2", headers=headers).json()
    assert [row["shipment"]["id"] for row in page["data"]] == [
        row["shipment"]["id"] for row in rows[2:4]
    ]


def test_operator_shipments_validate_input(api: TestClient, demo: Session) -> None:
    headers = auth("operator@portiq.demo")
    backwards = api.get(
        "/api/v1/operator/shipments?arrival_from=2026-11-20T00:00:00Z&arrival_to=2026-11-10T00:00:00Z",
        headers=headers,
    )
    assert backwards.status_code == 422
    assert backwards.json()["error"]["details"][0]["field"] == "arrival_to"
    bad_code = api.get("/api/v1/operator/shipments?warning_code=NOPE", headers=headers)
    assert bad_code.status_code == 422


# ------------------------------------------------------------ operator overview


def test_overview_shape_and_counts(api: TestClient, demo: Session) -> None:
    res = api.get(
        "/api/v1/operator/overview", params=NOVEMBER, headers=auth("operator@portiq.demo")
    )
    assert res.status_code == 200, res.text
    data = res.json()["data"]

    assert set(data) == {
        "port_scope", "range", "status_counts", "utilization",
        "at_risk_count", "at_risk", "dwell_distribution",
    }
    assert data["range"] == NOVEMBER
    assert {port["name"] for port in data["port_scope"]} == {"Nhava Sheva (JNPA)", "Mundra"}
    assert set(data["status_counts"]) == {"submitted", "arrived", "cleared"}

    listed = api.get(
        "/api/v1/operator/shipments?page_size=100"
        "&arrival_from=2026-11-01T00:00:00Z&arrival_to=2026-11-30T23:59:59.999Z",
        headers=auth("operator@portiq.demo"),
    ).json()
    assert sum(data["status_counts"].values()) == listed["meta"]["pagination"]["total"]
    assert data["at_risk_count"] == len(data["at_risk"])
    assert data["at_risk_count"] == sum(1 for row in listed["data"] if row["at_risk_reasons"])
    assert len(data["dwell_distribution"]) == 15
    assert set(data["utilization"]) == {"yard", "berth"}


def test_overview_scope_and_validation(api: TestClient, demo: Session) -> None:
    op2 = auth("operator2@portiq.demo")
    scoped = api.get("/api/v1/operator/overview", params=NOVEMBER, headers=op2).json()["data"]
    assert [port["name"] for port in scoped["port_scope"]] == ["Nhava Sheva (JNPA)"]

    outside = api.get(
        "/api/v1/operator/overview",
        params={**NOVEMBER, "port_id": port_id(demo, "INMUN")},
        headers=op2,
    )
    assert outside.status_code == 404

    too_long = api.get(
        "/api/v1/operator/overview", params={"from": "2026-11-01", "to": "2026-12-15"}, headers=op2
    )
    backwards = api.get(
        "/api/v1/operator/overview", params={"from": "2026-11-10", "to": "2026-11-10"}, headers=op2
    )
    for res in (too_long, backwards):
        assert res.status_code == 422
        assert res.json()["error"]["details"][0]["field"] == "to"

    default = api.get("/api/v1/operator/overview", headers=op2).json()["data"]["range"]
    assert (
        datetime.fromisoformat(default["to"]) - datetime.fromisoformat(default["from"])
    ).days == 14

    admin = api.get("/api/v1/operator/overview", params=NOVEMBER, headers=auth("admin@portiq.demo"))
    assert admin.status_code == 200
    assert len(admin.json()["data"]["port_scope"]) >= 2
    importer = api.get("/api/v1/operator/overview", headers=auth("importer@portiq.demo"))
    assert importer.status_code == 403


def test_audit_log_names_an_actor_without_a_display_name_by_email(
    api: TestClient, demo: Session
) -> None:
    operator = demo.query(Profile).filter(Profile.email == "operator@portiq.demo").one()
    operator.display_name = None
    demo.flush()
    shipment = (
        demo.query(Shipment).filter(Shipment.status == ShipmentStatus.SUBMITTED).first()
    )
    assert shipment is not None
    api.post(
        f"/api/v1/shipments/{shipment.id}/events",
        headers=auth("operator@portiq.demo"),
        json={"to_status": "arrived", "occurred_at": datetime.now(UTC).isoformat()},
    )

    logs = api.get("/api/v1/admin/audit-logs", headers=auth("admin@portiq.demo")).json()["data"]
    assert logs[0]["actor_display_name"] == "operator@portiq.demo"
