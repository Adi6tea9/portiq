"""B04: shipment CRUD, filters, summary, details, milestones and authorization."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.models import AuditLog, PredictionRun
from app.repositories import ports as ports_repo
from app.repositories import profiles as profiles_repo
from app.repositories import shipments as shipments_repo
from app.schemas.enums import Currency, SourceType
from scripts.seed_dev import seed_demo

IMPORTER = "importer@portiq.demo"
IMPORTER2 = "importer2@portiq.demo"
OPERATOR = "operator@portiq.demo"
OPERATOR2 = "operator2@portiq.demo"
ADMIN = "admin@portiq.demo"

SHIPMENT_KEYS = {
    "id",
    "port_id",
    "reference",
    "direction",
    "cargo_type",
    "container_size_ft",
    "hs_code",
    "weight_kg",
    "declared_value",
    "currency",
    "shipping_line",
    "vessel_size_band",
    "expected_arrival_at",
    "documentation_status",
    "status",
    "actual_arrival_at",
    "actual_cleared_at",
    "actual_dwell_days",
    "created_at",
    "updated_at",
    "latest_prediction",
}
EVENT_KEYS = {
    "id",
    "shipment_id",
    "event_type",
    "from_status",
    "to_status",
    "occurred_at",
    "recorded_at",
    "actor_display_name",
    "note",
}
PREDICTION_KEYS = {
    "prediction_id",
    "created_at",
    "predicted_dwell_days",
    "total_estimated_cost",
    "total_is_partial",
    "model_version",
    "is_demo_data",
}


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


def _bearer(email: str) -> dict[str, str]:
    return {"Authorization": f"Bearer dev:{email}"}


def _port_id(session: Session, code: str) -> str:
    port = ports_repo.get_by_code(session, code)
    assert port is not None
    return str(port.id)


def _body(port_id: str, reference: str = "NEW-2026-001", **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "port_id": port_id,
        "reference": reference,
        "direction": "import",
        "cargo_type": "general_container",
        "container_size_ft": 40,
        "hs_code": "847130",
        "weight_kg": 12345.5,
        "declared_value": "100000.00",
        "currency": "INR",
        "shipping_line": "Line A",
        "vessel_size_band": "large",
        "expected_arrival_at": "2026-12-01T10:00:00Z",
        "documentation_status": "complete",
    }
    body.update(overrides)
    return body


def _references(response: Any) -> list[str]:
    return [item["reference"] for item in response.json()["data"]]


def _created(api: TestClient, session: Session, reference: str) -> dict[str, Any]:
    response = api.post(
        "/api/v1/shipments",
        headers=_bearer(IMPORTER),
        json=_body(_port_id(session, "INNSA"), reference=reference),
    )
    assert response.status_code == 201
    return response.json()["data"]


def test_shipment_routes_require_a_token(api: TestClient, demo: Session) -> None:
    now = datetime.now(UTC).isoformat()
    cases = [
        ("get", "/api/v1/shipments", None),
        ("get", "/api/v1/shipments/summary", None),
        ("post", "/api/v1/shipments", _body(_port_id(demo, "INNSA"))),
        ("get", f"/api/v1/shipments/{uuid4()}", None),
        ("patch", f"/api/v1/shipments/{uuid4()}", {"cargo_type": "reefer"}),
        (
            "post",
            f"/api/v1/shipments/{uuid4()}/events",
            {"to_status": "arrived", "occurred_at": now},
        ),
    ]

    for method, path, body in cases:
        response = api.request(method.upper(), path, json=body)
        assert response.status_code == 401, path
        assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_create_shipment_returns_detail_and_created_event(api: TestClient, demo: Session) -> None:
    response = api.post(
        "/api/v1/shipments",
        headers=_bearer(IMPORTER),
        json=_body(_port_id(demo, "INNSA"), reference="NEW-2026-001"),
    )

    assert response.status_code == 201
    data = response.json()["data"]
    assert set(data) == SHIPMENT_KEYS | {"events"}
    assert data["reference"] == "NEW-2026-001"
    assert data["status"] == "submitted"
    assert data["weight_kg"] == 12345.5
    assert data["declared_value"] == "100000.00"
    assert data["expected_arrival_at"] == "2026-12-01T10:00:00.000Z"
    assert data["actual_dwell_days"] is None
    assert data["latest_prediction"] is None
    assert len(data["events"]) == 1
    event = data["events"][0]
    assert set(event) == EVENT_KEYS
    assert event["event_type"] == "created"
    assert event["from_status"] is None
    assert event["to_status"] == "submitted"
    assert event["actor_display_name"] == "Demo Importer"
    assert event["note"] is None
    assert event["occurred_at"].endswith("Z")

    shipment = shipments_repo.get_by_reference(demo, "NEW-2026-001")
    assert shipment is not None
    importer = profiles_repo.get_by_email(demo, IMPORTER)
    assert importer is not None
    assert shipment.owner_user_id == importer.id


def test_create_rejects_duplicate_reference(api: TestClient, demo: Session) -> None:
    port_id = _port_id(demo, "INNSA")
    _created(api, demo, "NEW-2026-001")

    response = api.post(
        "/api/v1/shipments",
        headers=_bearer(IMPORTER),
        json=_body(port_id, reference="NEW-2026-001"),
    )

    assert response.status_code == 422
    assert response.json()["error"]["details"] == [
        {"field": "reference", "issue": "already exists"}
    ]


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"weight_kg": 0}, "weight_kg"),
        ({"weight_kg": 60001}, "weight_kg"),
        ({"hs_code": "12345"}, "hs_code"),
        ({"hs_code": "ABCDEF"}, "hs_code"),
        ({"container_size_ft": 30}, "container_size_ft"),
        ({"declared_value": "-1"}, "declared_value"),
        ({"expected_arrival_at": "2026-12-01T10:00:00"}, "expected_arrival_at"),
        ({"reference": "   "}, "reference"),
        ({"reference": "x" * 65}, "reference"),
        ({"status": "cleared"}, "status"),
        ({"owner_user_id": str(uuid4())}, "owner_user_id"),
    ],
)
def test_create_validates_the_body(
    api: TestClient, demo: Session, overrides: dict[str, Any], field: str
) -> None:
    response = api.post(
        "/api/v1/shipments",
        headers=_bearer(IMPORTER),
        json=_body(_port_id(demo, "INNSA"), **overrides),
    )

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert any(detail["field"] == field for detail in error["details"]), error["details"]


def test_create_rejects_an_unknown_port(api: TestClient, demo: Session) -> None:
    response = api.post(
        "/api/v1/shipments",
        headers=_bearer(IMPORTER),
        json=_body(str(uuid4())),
    )

    assert response.status_code == 422
    assert response.json()["error"]["details"] == [{"field": "port_id", "issue": "port not found"}]


@pytest.mark.parametrize("email", [OPERATOR, ADMIN])
def test_create_is_importer_only(api: TestClient, demo: Session, email: str) -> None:
    response = api.post(
        "/api/v1/shipments",
        headers=_bearer(email),
        json=_body(_port_id(demo, "INNSA")),
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_list_returns_only_the_callers_shipments(api: TestClient, demo: Session) -> None:
    response = api.get("/api/v1/shipments", headers=_bearer(IMPORTER))

    assert response.status_code == 200
    data = response.json()["data"]
    assert {item["reference"] for item in data} == {
        "DEMO-2026-001",
        "DEMO-2026-002",
        "DEMO-2026-005",
        "DEMO-2026-006",
        "DEMO-2026-008",
        "DEMO-2026-010",
        "DEMO-2026-012",
    }
    assert all(set(item) == SHIPMENT_KEYS for item in data)
    assert all(item["latest_prediction"] is None for item in data)
    assert response.json()["meta"]["pagination"] == {"page": 1, "page_size": 20, "total": 7}
    dwell = {item["reference"]: item["actual_dwell_days"] for item in data}
    assert dwell["DEMO-2026-010"] == 2.19


def test_list_is_newest_first(api: TestClient, demo: Session) -> None:
    _created(api, demo, "NEW-2026-A")
    _created(api, demo, "NEW-2026-B")
    older = shipments_repo.get_by_reference(demo, "NEW-2026-A")
    newer = shipments_repo.get_by_reference(demo, "NEW-2026-B")
    assert older is not None and newer is not None
    now = datetime.now(UTC)
    older.created_at = now - timedelta(hours=2)
    newer.created_at = now - timedelta(hours=1)
    demo.flush()

    refs = _references(api.get("/api/v1/shipments", headers=_bearer(IMPORTER)))

    assert refs.index("NEW-2026-B") < refs.index("NEW-2026-A")
    data = api.get("/api/v1/shipments", headers=_bearer(IMPORTER)).json()["data"]
    created = [item["created_at"] for item in data]
    assert created == sorted(created, reverse=True)


def test_list_filters_and_pagination(api: TestClient, demo: Session) -> None:
    headers = _bearer(IMPORTER)

    arrived = api.get("/api/v1/shipments?status=arrived", headers=headers)
    assert set(_references(arrived)) == {"DEMO-2026-008"}

    search = api.get("/api/v1/shipments?q=demo-2026-010", headers=headers)
    assert _references(search) == ["DEMO-2026-010"]

    window = api.get(
        "/api/v1/shipments?arrival_from=2026-11-20&arrival_to=2026-11-30",
        headers=headers,
    )
    assert set(_references(window)) == {"DEMO-2026-005", "DEMO-2026-006"}

    page = api.get("/api/v1/shipments?page=2&page_size=3", headers=headers)
    assert len(page.json()["data"]) == 3
    assert page.json()["meta"]["pagination"] == {"page": 2, "page_size": 3, "total": 7}

    assert api.get("/api/v1/shipments?page=0", headers=headers).status_code == 422
    assert api.get("/api/v1/shipments?page_size=101", headers=headers).status_code == 422


def test_operator_list_is_scoped_by_port(api: TestClient, demo: Session) -> None:
    in_nsa = api.get("/api/v1/shipments", headers=_bearer(OPERATOR2))
    assert in_nsa.status_code == 200
    assert {item["reference"] for item in in_nsa.json()["data"]} == {
        "DEMO-2026-001",
        "DEMO-2026-003",
        "DEMO-2026-005",
        "DEMO-2026-007",
        "DEMO-2026-009",
        "DEMO-2026-011",
    }
    assert {item["port_id"] for item in in_nsa.json()["data"]} == {_port_id(demo, "INNSA")}

    everywhere = api.get("/api/v1/shipments?page_size=100", headers=_bearer(OPERATOR))
    assert len(everywhere.json()["data"]) == 12

    admin = api.get("/api/v1/shipments", headers=_bearer(ADMIN))
    assert admin.status_code == 403
    assert admin.json()["error"]["code"] == "FORBIDDEN"


def test_summary_is_importer_only(api: TestClient, demo: Session) -> None:
    own = api.get("/api/v1/shipments/summary", headers=_bearer(IMPORTER))
    assert own.status_code == 200
    assert own.json()["data"] == {
        "total": 7,
        "status_counts": {"submitted": 4, "arrived": 1, "cleared": 2},
    }

    second = api.get("/api/v1/shipments/summary", headers=_bearer(IMPORTER2))
    assert second.json()["data"] == {
        "total": 5,
        "status_counts": {"submitted": 2, "arrived": 2, "cleared": 1},
    }

    for email in (OPERATOR, ADMIN):
        response = api.get("/api/v1/shipments/summary", headers=_bearer(email))
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "FORBIDDEN"


def test_detail_events_and_resource_scope(api: TestClient, demo: Session) -> None:
    own_shipment = shipments_repo.get_by_reference(demo, "DEMO-2026-001")
    assert own_shipment is not None
    own = api.get(f"/api/v1/shipments/{own_shipment.id}", headers=_bearer(IMPORTER))
    assert own.status_code == 200
    assert set(own.json()["data"]) == SHIPMENT_KEYS | {"events"}
    events = own.json()["data"]["events"]
    assert len(events) == 1
    assert set(events[0]) == EVENT_KEYS
    assert events[0]["event_type"] == "created"
    assert events[0]["to_status"] == "submitted"

    cleared_shipment = shipments_repo.get_by_reference(demo, "DEMO-2026-010")
    assert cleared_shipment is not None
    cleared = api.get(f"/api/v1/shipments/{cleared_shipment.id}", headers=_bearer(IMPORTER)).json()[
        "data"
    ]
    assert cleared["actual_dwell_days"] == 2.19
    assert cleared["actual_arrival_at"] == "2026-10-28T07:10:00.000Z"
    assert cleared["actual_cleared_at"] == "2026-10-30T11:45:00.000Z"

    importer2_shipment = shipments_repo.get_by_reference(demo, "DEMO-2026-003")
    assert importer2_shipment is not None
    cross_user = api.get(f"/api/v1/shipments/{importer2_shipment.id}", headers=_bearer(IMPORTER))
    assert cross_user.status_code == 404
    assert cross_user.json()["error"]["code"] == "NOT_FOUND"

    assert (
        api.get(
            f"/api/v1/shipments/{importer2_shipment.id}", headers=_bearer(OPERATOR2)
        ).status_code
        == 200
    )
    outside_scope = shipments_repo.get_by_reference(demo, "DEMO-2026-002")
    assert outside_scope is not None
    assert (
        api.get(f"/api/v1/shipments/{outside_scope.id}", headers=_bearer(OPERATOR2)).status_code
        == 404
    )
    assert (
        api.get(f"/api/v1/shipments/{outside_scope.id}", headers=_bearer(OPERATOR)).status_code
        == 200
    )
    assert (
        api.get(f"/api/v1/shipments/{importer2_shipment.id}", headers=_bearer(ADMIN)).status_code
        == 403
    )
    assert api.get(f"/api/v1/shipments/{uuid4()}", headers=_bearer(IMPORTER)).status_code == 404


def test_latest_prediction_summary(api: TestClient, demo: Session) -> None:
    shipment = shipments_repo.get_by_reference(demo, "DEMO-2026-001")
    importer = profiles_repo.get_by_email(demo, IMPORTER)
    assert shipment is not None and importer is not None
    run = PredictionRun(
        shipment_id=shipment.id,
        requested_by=importer.id,
        idempotency_key=uuid4(),
        input_hash="a" * 64,
        predicted_dwell_days=Decimal("3.1250"),
        predicted_clearance_at=datetime(2026, 11, 15, 12, 0, tzinfo=UTC),
        currency=Currency.INR,
        total_estimated_cost=Decimal("12345.60"),
        total_is_partial=True,
        cost_breakdown={},
        explanation={},
        capacity_snapshot={},
        warnings=[],
        input_snapshot={},
        model_version="dwell-test-1.0",
        dataset_version="synthetic-v1",
        tariff_rule_versions={},
        data_source=SourceType.SYNTHETIC,
        is_demo_data=True,
    )
    demo.add(run)
    demo.flush()

    detail = api.get(f"/api/v1/shipments/{shipment.id}", headers=_bearer(IMPORTER)).json()["data"]
    summary = detail["latest_prediction"]
    assert set(summary) == PREDICTION_KEYS
    assert summary == {
        "prediction_id": str(run.id),
        "created_at": summary["created_at"],
        "predicted_dwell_days": 3.125,
        "total_estimated_cost": "12345.60",
        "total_is_partial": True,
        "model_version": "dwell-test-1.0",
        "is_demo_data": True,
    }
    assert summary["created_at"].endswith("Z")

    listed = api.get("/api/v1/shipments?q=DEMO-2026-001", headers=_bearer(IMPORTER)).json()["data"]
    assert listed[0]["latest_prediction"] == summary


def test_patch_allowlist_state_and_scope(api: TestClient, demo: Session) -> None:
    shipment = shipments_repo.get_by_reference(demo, "DEMO-2026-001")
    assert shipment is not None
    path = f"/api/v1/shipments/{shipment.id}"

    updated = api.patch(
        path,
        headers=_bearer(IMPORTER),
        json={
            "cargo_type": "reefer",
            "weight_kg": 12345,
            "declared_value": "123.40",
            "expected_arrival_at": "2026-12-02T08:30:00Z",
        },
    )
    assert updated.status_code == 200
    assert set(updated.json()["data"]) == SHIPMENT_KEYS
    assert updated.json()["data"]["cargo_type"] == "reefer"
    assert updated.json()["data"]["weight_kg"] == 12345
    assert updated.json()["data"]["declared_value"] == "123.40"
    assert updated.json()["data"]["expected_arrival_at"] == "2026-12-02T08:30:00.000Z"

    ignored_null = api.patch(path, headers=_bearer(IMPORTER), json={"weight_kg": None})
    assert ignored_null.status_code == 200
    assert ignored_null.json()["data"]["weight_kg"] == 12345

    empty = api.patch(path, headers=_bearer(IMPORTER), json={})
    assert empty.status_code == 200
    assert empty.json()["data"]["weight_kg"] == 12345

    for field in ("status", "owner_user_id", "reference", "port_id"):
        rejected = api.patch(path, headers=_bearer(IMPORTER), json={field: "x"})
        assert rejected.status_code == 422
        assert any(detail["field"] == field for detail in rejected.json()["error"]["details"]), (
            field
        )

    arrived = shipments_repo.get_by_reference(demo, "DEMO-2026-008")
    assert arrived is not None
    conflict = api.patch(
        f"/api/v1/shipments/{arrived.id}",
        headers=_bearer(IMPORTER),
        json={"cargo_type": "reefer"},
    )
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "STATE_CONFLICT"
    assert conflict.json()["error"]["message"] == "That status change is not allowed."

    cross_user = shipments_repo.get_by_reference(demo, "DEMO-2026-003")
    assert cross_user is not None
    assert (
        api.patch(
            f"/api/v1/shipments/{cross_user.id}",
            headers=_bearer(IMPORTER),
            json={"cargo_type": "reefer"},
        ).status_code
        == 404
    )
    for email in (OPERATOR, ADMIN):
        assert (
            api.patch(path, headers=_bearer(email), json={"cargo_type": "reefer"}).status_code
            == 403
        )


def test_events_transition_and_audit(api: TestClient, demo: Session) -> None:
    shipment = shipments_repo.get_by_reference(demo, "DEMO-2026-001")
    assert shipment is not None
    now = datetime.now(UTC)
    arrived_at = now - timedelta(hours=1)

    arrived = api.post(
        f"/api/v1/shipments/{shipment.id}/events",
        headers=_bearer(OPERATOR2),
        json={
            "to_status": "arrived",
            "occurred_at": arrived_at.isoformat(),
            "note": "  Berthed  ",
        },
    )
    assert arrived.status_code == 200
    data = arrived.json()["data"]
    assert data["status"] == "arrived"
    assert data["actual_arrival_at"] == arrived_at.astimezone(UTC).isoformat(
        timespec="milliseconds"
    ).replace("+00:00", "Z")
    assert data["actual_cleared_at"] is None
    assert len(data["events"]) == 2
    event = next(e for e in data["events"] if e["event_type"] == "arrived")
    assert event["event_type"] == "arrived"
    assert event["from_status"] == "submitted"
    assert event["to_status"] == "arrived"
    assert event["actor_display_name"] == "Demo Operator Two"
    assert event["note"] == "Berthed"

    audit = demo.scalars(select(AuditLog).where(AuditLog.entity_id == shipment.id)).all()
    assert len(audit) == 1
    assert audit[0].action == "shipment.arrived"
    assert audit[0].entity_type == "shipment"
    assert audit[0].before == {"status": "submitted"}
    assert audit[0].after is not None
    assert audit[0].after["status"] == "arrived"
    assert audit[0].after["occurred_at"] == data["actual_arrival_at"]
    assert audit[0].request_id == arrived.json()["meta"]["request_id"]

    cleared_at = now - timedelta(minutes=30)
    cleared = api.post(
        f"/api/v1/shipments/{shipment.id}/events",
        headers=_bearer(OPERATOR2),
        json={"to_status": "cleared", "occurred_at": cleared_at.isoformat()},
    )
    assert cleared.status_code == 200
    assert cleared.json()["data"]["status"] == "cleared"
    assert cleared.json()["data"]["actual_cleared_at"] is not None
    assert len(cleared.json()["data"]["events"]) == 3
    assert len(demo.scalars(select(AuditLog).where(AuditLog.entity_id == shipment.id)).all()) == 2


def test_event_transition_and_time_validation(api: TestClient, demo: Session) -> None:
    submitted = shipments_repo.get_by_reference(demo, "DEMO-2026-001")
    arrived = shipments_repo.get_by_reference(demo, "DEMO-2026-007")
    outside = shipments_repo.get_by_reference(demo, "DEMO-2026-002")
    assert submitted is not None and arrived is not None and outside is not None
    now = datetime.now(UTC)

    skipped = api.post(
        f"/api/v1/shipments/{submitted.id}/events",
        headers=_bearer(OPERATOR2),
        json={"to_status": "cleared", "occurred_at": now.isoformat()},
    )
    assert skipped.status_code == 409
    assert skipped.json()["error"]["code"] == "STATE_CONFLICT"

    repeated = api.post(
        f"/api/v1/shipments/{arrived.id}/events",
        headers=_bearer(OPERATOR2),
        json={"to_status": "arrived", "occurred_at": now.isoformat()},
    )
    assert repeated.status_code == 409
    assert repeated.json()["error"]["code"] == "STATE_CONFLICT"

    future = api.post(
        f"/api/v1/shipments/{submitted.id}/events",
        headers=_bearer(OPERATOR2),
        json={
            "to_status": "arrived",
            "occurred_at": (now + timedelta(minutes=10)).isoformat(),
        },
    )
    assert future.status_code == 422
    assert future.json()["error"]["details"] == [
        {"field": "occurred_at", "issue": "must not be more than 5 minutes in the future"}
    ]

    before_arrival = api.post(
        f"/api/v1/shipments/{arrived.id}/events",
        headers=_bearer(OPERATOR2),
        json={"to_status": "cleared", "occurred_at": "2026-11-01T00:00:00Z"},
    )
    assert before_arrival.status_code == 422
    assert before_arrival.json()["error"]["details"] == [
        {"field": "occurred_at", "issue": "must not be before actual_arrival_at"}
    ]

    out_of_scope = api.post(
        f"/api/v1/shipments/{outside.id}/events",
        headers=_bearer(OPERATOR2),
        json={"to_status": "arrived", "occurred_at": now.isoformat()},
    )
    assert out_of_scope.status_code == 404
    assert out_of_scope.json()["error"]["code"] == "NOT_FOUND"

    missing = api.post(
        f"/api/v1/shipments/{uuid4()}/events",
        headers=_bearer(OPERATOR2),
        json={"to_status": "arrived", "occurred_at": now.isoformat()},
    )
    assert missing.status_code == 404

    for email in (IMPORTER, ADMIN):
        forbidden = api.post(
            f"/api/v1/shipments/{submitted.id}/events",
            headers=_bearer(email),
            json={"to_status": "arrived", "occurred_at": now.isoformat()},
        )
        assert forbidden.status_code == 403
        assert forbidden.json()["error"]["code"] == "FORBIDDEN"


def test_event_note_is_limited_to_500_characters(api: TestClient, demo: Session) -> None:
    shipment = shipments_repo.get_by_reference(demo, "DEMO-2026-001")
    assert shipment is not None

    response = api.post(
        f"/api/v1/shipments/{shipment.id}/events",
        headers=_bearer(OPERATOR2),
        json={
            "to_status": "arrived",
            "occurred_at": datetime.now(UTC).isoformat(),
            "note": "x" * 501,
        },
    )

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert any(detail["field"] == "note" for detail in error["details"]), error["details"]
