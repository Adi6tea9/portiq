"""CG-022: cargo lines, full-container rules, splitting and the shared-container list."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import timedelta
from typing import Any
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.repositories import cargo as cargo_repo
from app.repositories import ports as ports_repo
from app.repositories import shipments as shipments_repo
from scripts.seed_dev import seed_demo
from tests.support.planner import (
    ADMIN,
    ARRIVED,
    FULL,
    IMPORTER,
    IMPORTER2,
    OPERATOR,
    OPERATOR2,
    SHARED_OTHER,
    SHARED_OWN,
    bearer,
    cargo_line,
    shipment_id,
)

CRATE = cargo_line(name="Crate", category="crate", length_cm=120, width_cm=100, height_cm=100)


@pytest.fixture
def api(app: FastAPI, client: TestClient, db_session: Session) -> Iterator[TestClient]:
    seed_demo(db_session, app_env="test")
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        yield client
    finally:
        app.dependency_overrides.clear()


def _cargo(ship: str) -> str:
    return f"/api/v1/shipments/{ship}/cargo"


def _error(response: Any) -> dict[str, Any]:
    body: dict[str, Any] = response.json()["error"]
    return body


def test_list_cargo_for_owner_operator_and_admin(api: TestClient, db_session: Session) -> None:
    full = shipment_id(db_session, FULL)
    own = api.get(_cargo(full), headers=bearer(IMPORTER))
    assert own.status_code == 200
    items = own.json()["data"]
    assert {item["name"] for item in items} == {"Grape boxes", "Juice drums"}
    assert set(items[0]) == {
        "id",
        "shipment_id",
        "name",
        "category",
        "length_cm",
        "width_cm",
        "height_cm",
        "weight_kg",
        "quantity",
        "stackable",
        "container_id",
        "created_at",
        "updated_at",
    }
    assert items[0]["container_id"] is None
    assert api.get(_cargo(full), headers=bearer(OPERATOR)).status_code == 200
    assert api.get(_cargo(full), headers=bearer(ADMIN)).status_code == 200


def test_strangers_get_404(api: TestClient, db_session: Session) -> None:
    full = shipment_id(db_session, FULL)
    item = api.get(_cargo(full), headers=bearer(IMPORTER)).json()["data"][0]["id"]
    for who in (IMPORTER2, OPERATOR2):
        assert api.get(_cargo(full), headers=bearer(who)).status_code == 404
        assert (
            api.get(f"/api/v1/shipments/{full}/load-plan", headers=bearer(who)).status_code == 404
        )
    assert api.post(_cargo(full), headers=bearer(IMPORTER2), json=cargo_line()).status_code == 404
    assert (
        api.patch(f"{_cargo(full)}/{item}", headers=bearer(IMPORTER2), json={}).status_code == 404
    )
    assert api.delete(f"{_cargo(full)}/{item}", headers=bearer(IMPORTER2)).status_code == 404


def test_operator_and_admin_cannot_write(api: TestClient, db_session: Session) -> None:
    full = shipment_id(db_session, FULL)
    for who in (OPERATOR, ADMIN):
        response = api.post(_cargo(full), headers=bearer(who), json=cargo_line())
        assert response.status_code == 403
        assert _error(response)["code"] == "FORBIDDEN"


def test_add_cargo_to_a_full_booking(api: TestClient, db_session: Session) -> None:
    full = shipment_id(db_session, FULL)
    response = api.post(_cargo(full), headers=bearer(IMPORTER), json=cargo_line())
    assert response.status_code == 201, response.text
    [item] = response.json()["data"]["items"]
    assert item["name"] == "Carton A" and item["quantity"] == 2 and item["container_id"] is None
    assert len(api.get(_cargo(full), headers=bearer(IMPORTER)).json()["data"]) == 3


def test_cargo_only_changes_while_submitted(api: TestClient, db_session: Session) -> None:
    arrived = shipment_id(db_session, ARRIVED)
    response = api.post(_cargo(arrived), headers=bearer(IMPORTER), json=cargo_line())
    assert response.status_code == 409
    assert _error(response)["code"] == "STATE_CONFLICT"


def test_validation(api: TestClient, db_session: Session) -> None:
    full = shipment_id(db_session, FULL)
    for bad in (
        cargo_line(name=""),
        cargo_line(name="x" * 81),
        cargo_line(category="barrel"),
        cargo_line(length_cm=0),
        cargo_line(length_cm=1204),
        cargo_line(weight_kg=0.05),
        cargo_line(weight_kg=30001),
        cargo_line(quantity=0),
        cargo_line(quantity=501),
        cargo_line(colour="red"),
    ):
        assert api.post(_cargo(full), headers=bearer(IMPORTER), json=bad).status_code == 422, bad
    # 20 ft container: 1000 cm long fits no orientation.
    too_long = api.post(_cargo(full), headers=bearer(IMPORTER), json=cargo_line(length_cm=1000))
    assert too_long.status_code == 422
    assert _error(too_long)["details"][0]["field"] == "length_cm"


def test_container_full_reports_what_fits(api: TestClient, db_session: Session) -> None:
    full = shipment_id(db_session, FULL)
    response = api.post(_cargo(full), headers=bearer(IMPORTER), json={**CRATE, "quantity": 200})
    assert response.status_code == 409
    error = _error(response)
    assert error["code"] == "CONTAINER_FULL"
    [detail] = error["details"]
    assert set(detail) == {
        "container_id",
        "sequence",
        "remaining_volume_m3",
        "remaining_payload_kg",
        "fits_quantity",
        "requested_quantity",
    }
    assert detail["container_id"] is None and detail["sequence"] == 1
    assert detail["requested_quantity"] == 200
    assert 0 < detail["fits_quantity"] < 200

    fits = detail["fits_quantity"]
    ok = api.post(_cargo(full), headers=bearer(IMPORTER), json={**CRATE, "quantity": fits})
    assert ok.status_code == 201
    again = api.post(_cargo(full), headers=bearer(IMPORTER), json={**CRATE, "quantity": 1})
    assert _error(again)["details"][0]["fits_quantity"] == 0


def test_payload_over_the_limit_is_container_full(api: TestClient, db_session: Session) -> None:
    full = shipment_id(db_session, FULL)
    response = api.post(
        _cargo(full), headers=bearer(IMPORTER), json=cargo_line(weight_kg=29000, quantity=1)
    )
    assert response.status_code == 409
    assert _error(response)["details"][0]["fits_quantity"] == 0


def test_split_puts_the_rest_in_a_new_container(api: TestClient, db_session: Session) -> None:
    own = shipment_id(db_session, SHARED_OWN)
    body = {**CRATE, "quantity": 60, "allow_split": True}
    response = api.post(_cargo(own), headers=bearer(IMPORTER), json=body)
    assert response.status_code == 201, response.text
    items = response.json()["data"]["items"]
    assert len(items) == 2
    assert sum(item["quantity"] for item in items) == 60
    assert items[0]["container_id"] != items[1]["container_id"]

    containers = api.get(
        f"/api/v1/shipments/{own}/shared-containers", headers=bearer(IMPORTER)
    ).json()["data"]
    assert [c["sequence"] for c in containers] == [1, 2]
    assert containers[0]["shipment_count"] == 2 and containers[1]["shipment_count"] == 1
    assert set(containers[0]) == {
        "id",
        "sequence",
        "container_size_ft",
        "used_volume_m3",
        "remaining_volume_m3",
        "volume_utilization_pct",
        "total_weight_kg",
        "max_payload_kg",
        "shipment_count",
    }

    plan = api.get(f"/api/v1/shipments/{own}/load-plan", headers=bearer(IMPORTER)).json()["data"]
    assert [c["sequence"] for c in plan["containers"]] == [1, 2]


def test_without_split_a_shared_container_is_full(api: TestClient, db_session: Session) -> None:
    own = shipment_id(db_session, SHARED_OWN)
    response = api.post(_cargo(own), headers=bearer(IMPORTER), json={**CRATE, "quantity": 60})
    assert response.status_code == 409
    detail = _error(response)["details"][0]
    assert detail["sequence"] == 1 and detail["container_id"] is not None


def test_container_id_must_belong_to_the_group(api: TestClient, db_session: Session) -> None:
    own = shipment_id(db_session, SHARED_OWN)
    shipment = shipments_repo.get_by_id(db_session, UUID(own))
    assert shipment is not None
    key = cargo_repo.GroupKey.of(shipment)
    elsewhere = cargo_repo.create_container(
        db_session,
        cargo_repo.GroupKey(key.port_id, key.direction, 40, key.arrival_date + timedelta(days=1)),
    )
    body = {**cargo_line(), "container_id": str(elsewhere.id)}
    response = api.post(_cargo(own), headers=bearer(IMPORTER), json=body)
    assert response.status_code == 422
    assert _error(response)["details"][0]["field"] == "container_id"

    full = shipment_id(db_session, FULL)
    response = api.post(_cargo(full), headers=bearer(IMPORTER), json=body)
    assert response.status_code == 422


def test_container_id_sends_cargo_to_a_chosen_container(
    api: TestClient, db_session: Session
) -> None:
    own = shipment_id(db_session, SHARED_OWN)
    api.post(
        _cargo(own), headers=bearer(IMPORTER), json={**CRATE, "quantity": 60, "allow_split": True}
    )
    containers = api.get(f"/api/v1/shipments/{own}/shared-containers", headers=bearer(IMPORTER))
    second = containers.json()["data"][1]["id"]
    other = shipment_id(db_session, SHARED_OTHER)
    response = api.post(
        _cargo(other), headers=bearer(IMPORTER2), json={**cargo_line(), "container_id": second}
    )
    assert response.status_code == 201
    assert response.json()["data"]["items"][0]["container_id"] == second


def test_edit_and_delete(api: TestClient, db_session: Session) -> None:
    full = shipment_id(db_session, FULL)
    item = api.get(_cargo(full), headers=bearer(IMPORTER)).json()["data"][0]
    url = f"{_cargo(full)}/{item['id']}"

    renamed = api.patch(url, headers=bearer(IMPORTER), json={"name": "Grapes"})
    assert renamed.status_code == 200
    assert renamed.json()["data"]["name"] == "Grapes"
    assert renamed.json()["data"]["quantity"] == item["quantity"]

    too_many = api.patch(
        url,
        headers=bearer(IMPORTER),
        json={"length_cm": 120, "width_cm": 100, "height_cm": 100, "quantity": 500},
    )
    assert too_many.status_code == 409
    assert _error(too_many)["code"] == "CONTAINER_FULL"
    assert _error(too_many)["details"][0]["requested_quantity"] == 500

    assert api.patch(url, headers=bearer(OPERATOR), json={"name": "x"}).status_code == 403
    assert api.delete(url, headers=bearer(IMPORTER)).status_code == 204
    assert api.delete(url, headers=bearer(IMPORTER)).status_code == 404
    assert len(api.get(_cargo(full), headers=bearer(IMPORTER)).json()["data"]) == 1


def test_shared_containers_is_empty_for_a_full_booking(
    api: TestClient, db_session: Session
) -> None:
    full = shipment_id(db_session, FULL)
    response = api.get(f"/api/v1/shipments/{full}/shared-containers", headers=bearer(OPERATOR))
    assert response.json()["data"] == []


def _new_shipment(api: TestClient, db_session: Session, **overrides: Any) -> dict[str, Any]:
    port = ports_repo.get_by_code(db_session, "INNSA")
    assert port is not None
    body = {
        "port_id": str(port.id),
        "reference": "LP-2026-001",
        "direction": "import",
        "cargo_type": "general_container",
        "container_size_ft": 20,
        "hs_code": "847130",
        "weight_kg": 1000,
        "declared_value": "1000.00",
        "currency": "INR",
        "shipping_line": "Line A",
        "vessel_size_band": "large",
        "expected_arrival_at": "2026-12-20T10:00:00Z",
        "documentation_status": "complete",
        **overrides,
    }
    response = api.post("/api/v1/shipments", headers=bearer(IMPORTER), json=body)
    assert response.status_code == 201, response.text
    data: dict[str, Any] = response.json()["data"]
    return data


def test_booking_type_defaults_to_full_and_locks_with_cargo(
    api: TestClient, db_session: Session
) -> None:
    created = _new_shipment(api, db_session)
    assert created["booking_type"] == "full"
    url = f"/api/v1/shipments/{created['id']}"

    shared = api.patch(url, headers=bearer(IMPORTER), json={"booking_type": "shared"})
    assert shared.status_code == 200
    assert shared.json()["data"]["booking_type"] == "shared"

    assert (
        api.post(_cargo(created["id"]), headers=bearer(IMPORTER), json=cargo_line()).status_code
        == 201
    )
    locked = api.patch(url, headers=bearer(IMPORTER), json={"booking_type": "full"})
    assert locked.status_code == 409
    assert _error(locked)["code"] == "STATE_CONFLICT"
    same = api.patch(url, headers=bearer(IMPORTER), json={"booking_type": "shared"})
    assert same.status_code == 200
    assert api.patch(url, headers=bearer(IMPORTER), json={"booking_type": "x"}).status_code == 422


def test_booking_type_on_create(api: TestClient, db_session: Session) -> None:
    created = _new_shipment(api, db_session, booking_type="shared")
    assert created["booking_type"] == "shared"
    first = api.post(_cargo(created["id"]), headers=bearer(IMPORTER), json=cargo_line())
    item = first.json()["data"]["items"][0]
    assert item["container_id"] is not None
