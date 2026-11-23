"""CG-022: the privacy-filtered load plan and its change stream."""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any
from uuid import UUID

import anyio
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.v1 import cargo as cargo_api
from app.core.deps import get_db
from app.models import CargoItem
from app.repositories import profiles as profiles_repo
from app.services.load_plan import plan_versions
from scripts.seed_dev import seed_demo
from tests.support.planner import (
    ADMIN,
    FULL,
    IMPORTER,
    IMPORTER2,
    OPERATOR2,
    SHARED_OTHER,
    SHARED_OWN,
    bearer,
    cargo_line,
    shipment_id,
)

GEOMETRY_KEYS = {"id", "own", "position_cm", "size_cm", "rotation_y", "details"}


@pytest.fixture
def api(app: FastAPI, client: TestClient, db_session: Session) -> Iterator[TestClient]:
    seed_demo(db_session, app_env="test")
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        yield client
    finally:
        app.dependency_overrides.clear()


def _plan(api: TestClient, ship: str, who: str) -> dict[str, Any]:
    response = api.get(f"/api/v1/shipments/{ship}/load-plan", headers=bearer(who))
    assert response.status_code == 200, response.text
    data: dict[str, Any] = response.json()["data"]
    return data


def test_other_owners_parcels_are_geometry_only(api: TestClient, db_session: Session) -> None:
    own = shipment_id(db_session, SHARED_OWN)
    other = shipment_id(db_session, SHARED_OTHER)
    response = api.get(f"/api/v1/shipments/{own}/load-plan", headers=bearer(IMPORTER))
    plan = response.json()["data"]
    assert plan["booking_type"] == "shared" and plan["viewer_sees_all"] is False
    [container] = plan["containers"]
    assert container["id"] is not None and container["sequence"] == 1
    assert container["unplaced_count"] == 0

    mine = [p for p in container["parcels"] if p["own"]]
    theirs = [p for p in container["parcels"] if not p["own"]]
    assert len(mine) == 26 and len(theirs) == 7
    assert all(p["details"] is not None for p in mine)
    assert mine[0]["id"].startswith(mine[0]["details"]["cargo_item_id"] + ":")
    for parcel in theirs:
        assert set(parcel) == GEOMETRY_KEYS
        assert parcel["details"] is None
        assert parcel["id"].startswith("o-")

    # Nothing identifying the other shipment appears anywhere in the body.
    body = response.text
    other_owner = profiles_repo.get_by_email(db_session, IMPORTER2)
    assert other_owner is not None
    other_items = db_session.query(CargoItem).filter(CargoItem.shipment_id == UUID(other)).all()
    leaks = [other, str(other_owner.id), IMPORTER2, SHARED_OTHER, "Furniture", "Glass", "pallet"]
    leaks += [str(item.id) for item in other_items]
    assert [leak for leak in leaks if leak in body] == []


def test_operator_and_admin_see_every_parcels_details(api: TestClient, db_session: Session) -> None:
    own = shipment_id(db_session, SHARED_OWN)
    for who in (OPERATOR2, ADMIN):
        plan = _plan(api, own, who)
        assert plan["viewer_sees_all"] is True
        parcels = plan["containers"][0]["parcels"]
        assert all(p["details"] is not None for p in parcels)
        assert sum(p["own"] for p in parcels) == 26  # own means the viewed shipment
        assert {p["details"]["name"] for p in parcels} >= {"Furniture pallets", "Glass panels"}


def test_strangers_cannot_read_the_plan_or_stream(api: TestClient, db_session: Session) -> None:
    own = shipment_id(db_session, SHARED_OWN)
    for who in (IMPORTER2,):  # operator@ also covers INNSA
        base = f"/api/v1/shipments/{own}"
        assert api.get(f"{base}/load-plan", headers=bearer(who)).status_code == 404
        assert api.get(f"{base}/load-plan/stream", headers=bearer(who)).status_code == 404
        assert api.get(f"{base}/shared-containers", headers=bearer(who)).status_code == 404


def test_full_booking_plan(api: TestClient, db_session: Session) -> None:
    full = shipment_id(db_session, FULL)
    plan = _plan(api, full, IMPORTER)
    [container] = plan["containers"]
    assert container["id"] is None and container["container_size_ft"] == 20
    assert container["internal_cm"] == {"length": 590, "width": 235, "height": 239}
    assert container["max_payload_kg"] == 28200
    assert len(container["parcels"]) == 44 and container["unplaced_count"] == 0
    assert all(p["own"] for p in container["parcels"])
    summary = container["summary"]
    assert set(summary) == {
        "used_volume_m3",
        "remaining_volume_m3",
        "volume_utilization_pct",
        "total_weight_kg",
        "remaining_payload_kg",
    }
    assert summary["total_weight_kg"] == 40 * 9.5 + 4 * 190
    assert summary["remaining_payload_kg"] == 28200 - summary["total_weight_kg"]


def test_shared_plan_without_cargo_is_empty(api: TestClient, db_session: Session) -> None:
    own = shipment_id(db_session, SHARED_OWN)
    for item in api.get(f"/api/v1/shipments/{own}/cargo", headers=bearer(IMPORTER)).json()["data"]:
        api.delete(f"/api/v1/shipments/{own}/cargo/{item['id']}", headers=bearer(IMPORTER))
    assert _plan(api, own, IMPORTER)["containers"] == []


def test_layout_is_deterministic(api: TestClient, db_session: Session) -> None:
    own = shipment_id(db_session, SHARED_OWN)
    assert _plan(api, own, IMPORTER)["containers"] == _plan(api, own, IMPORTER)["containers"]


def test_version_changes_with_any_cargo_in_the_container(
    api: TestClient, db_session: Session
) -> None:
    own = shipment_id(db_session, SHARED_OWN)
    other = shipment_id(db_session, SHARED_OTHER)
    before = _plan(api, own, IMPORTER)["containers"][0]["version"]
    added = api.post(
        f"/api/v1/shipments/{other}/cargo", headers=bearer(IMPORTER2), json=cargo_line()
    )
    assert added.status_code == 201
    assert _plan(api, own, IMPORTER)["containers"][0]["version"] == before + 1

    full = shipment_id(db_session, FULL)
    versions = plan_versions(db_session, UUID(full))
    api.post(f"/api/v1/shipments/{full}/cargo", headers=bearer(IMPORTER), json=cargo_line())
    assert plan_versions(db_session, UUID(full)) == {"full": versions["full"] + 1}


def test_version_stream_sends_versions_then_changes(api: TestClient, db_session: Session) -> None:
    own = UUID(shipment_id(db_session, SHARED_OWN))
    snapshots = [plan_versions(db_session, own), plan_versions(db_session, own), {"x": 2}]

    async def first_two() -> list[str]:
        async def connected() -> bool:
            return False

        stream = cargo_api.version_events(lambda: snapshots.pop(0), connected, poll_seconds=0)
        return [await anext(stream), await anext(stream)]

    first, second = anyio.run(first_two)
    assert first.startswith("event: version\ndata: ")
    payload = json.loads(first.split("data: ", 1)[1])
    assert list(payload["versions"].values()) == [1]
    # The unchanged second snapshot sent nothing; the change did.
    assert json.loads(second.split("data: ", 1)[1]) == {"versions": {"x": 2}}


def test_version_stream_pings(api: TestClient) -> None:
    async def events() -> list[str]:
        async def connected() -> bool:
            return False

        stream = cargo_api.version_events(
            lambda: {"full": 1}, connected, poll_seconds=0.01, ping_seconds=0.01
        )
        return [await anext(stream), await anext(stream)]

    assert anyio.run(events)[1] == ": ping\n\n"


def test_stream_endpoint(
    api: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(cargo_api, "STREAM_MAX_SECONDS", 0)
    own = shipment_id(db_session, SHARED_OWN)
    response = api.get(f"/api/v1/shipments/{own}/load-plan/stream", headers=bearer(IMPORTER))
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.text.startswith('event: version\ndata: {"versions": ')
