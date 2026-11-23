"""`scripts/manage_users.py`: adding, changing and removing importers, operators and admins."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.models import Profile
from app.models.tables import AuditLog
from app.repositories import profiles as profiles_repo
from app.schemas.enums import Role
from scripts.manage_users import UserAdminError, delete_user, list_users, set_active, set_role
from scripts.seed_dev import seed_demo

ADMIN = "admin@portiq.demo"


@pytest.fixture
def demo(db_session: Session) -> Session:
    seed_demo(db_session, app_env="test")
    return db_session


@pytest.fixture
def api(app: FastAPI, client: TestClient, db_session: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        yield client
    finally:
        app.dependency_overrides.clear()


def user(demo: Session, email: str) -> dict[str, object]:
    return next(u for u in list_users(demo) if u["email"] == email)


def test_list_shows_roles_status_and_ports(demo: Session) -> None:
    assert user(demo, "operator@portiq.demo") == {
        "email": "operator@portiq.demo",
        "role": "port_operator",
        "is_active": True,
        "ports": ["INMUN", "INNSA"],
    }
    assert user(demo, ADMIN)["role"] == "platform_admin"


def test_promote_to_operator_and_back_with_an_audit_trail(demo: Session) -> None:
    result = set_role(demo, "Importer2@Portiq.Demo", Role.PORT_OPERATOR, ["innsa"], by=ADMIN)
    assert result == {"role": "port_operator", "is_active": True, "ports": ["INNSA"]}

    set_role(demo, "importer2@portiq.demo", Role.IMPORTER_EXPORTER, None, by=ADMIN)
    assert user(demo, "importer2@portiq.demo")["ports"] == []  # scope removed with the role

    log = demo.scalars(
        select(AuditLog).where(AuditLog.action == "profile.set_role").order_by(AuditLog.created_at)
    ).all()
    assert [(entry.after or {}).get("role") for entry in log] == [
        "port_operator",
        "importer_exporter",
    ]
    admin = profiles_repo.get_by_email(demo, ADMIN)
    assert admin is not None and all(entry.actor_user_id == admin.id for entry in log)


@pytest.mark.parametrize(
    ("role", "ports", "by", "message"),
    [
        (Role.PORT_OPERATOR, None, ADMIN, "needs --ports"),
        (Role.PORT_OPERATOR, ["XXXXX"], ADMIN, "Unknown port code"),
        (Role.PLATFORM_ADMIN, ["INNSA"], ADMIN, "only applies to the port_operator"),
        (Role.PLATFORM_ADMIN, None, "operator@portiq.demo", "not an active platform admin"),
        (Role.PLATFORM_ADMIN, None, None, "Pass --by"),
    ],
)
def test_set_role_refusals(
    demo: Session, role: Role, ports: list[str] | None, by: str | None, message: str
) -> None:
    with pytest.raises(UserAdminError, match=message):
        set_role(demo, "importer@portiq.demo", role, ports, by=by)


def test_unknown_user_must_sign_in_first(demo: Session) -> None:
    with pytest.raises(UserAdminError, match="sign in once first"):
        set_role(demo, "nobody@example.com", Role.PLATFORM_ADMIN, None, by=ADMIN)


def test_the_last_admin_cannot_be_removed(demo: Session) -> None:
    with pytest.raises(UserAdminError, match="last active admin"):
        set_role(demo, ADMIN, Role.IMPORTER_EXPORTER, None, by=ADMIN)
    with pytest.raises(UserAdminError, match="last active admin"):
        set_active(demo, ADMIN, False, by=ADMIN)

    set_role(demo, "importer2@portiq.demo", Role.PLATFORM_ADMIN, None, by=ADMIN)
    set_active(demo, ADMIN, False, by="importer2@portiq.demo")  # allowed once a second exists
    assert user(demo, ADMIN)["is_active"] is False


def test_deactivated_users_are_blocked_by_the_api(api: TestClient, demo: Session) -> None:
    headers = {"Authorization": "Bearer dev:operator@portiq.demo"}
    assert api.get("/api/v1/me", headers=headers).status_code == 200

    set_active(demo, "operator@portiq.demo", False, by=ADMIN)
    assert api.get("/api/v1/me", headers=headers).status_code == 403

    set_active(demo, "operator@portiq.demo", True, by=ADMIN)
    assert api.get("/api/v1/me", headers=headers).status_code == 200


def test_role_change_applies_on_the_next_request(api: TestClient, demo: Session) -> None:
    headers = {"Authorization": "Bearer dev:importer2@portiq.demo"}
    assert api.get("/api/v1/admin/tariffs", headers=headers).status_code == 403

    set_role(demo, "importer2@portiq.demo", Role.PLATFORM_ADMIN, None, by=ADMIN)
    assert api.get("/api/v1/admin/tariffs", headers=headers).status_code == 200


def test_delete_only_users_without_history(demo: Session) -> None:
    with pytest.raises(UserAdminError, match="has history .*shipments.*Use `deactivate`"):
        delete_user(demo, "importer@portiq.demo", by=ADMIN)
    with pytest.raises(UserAdminError, match="cannot delete themselves"):
        delete_user(demo, ADMIN, by=ADMIN)

    profiles_repo.create(demo, email="new@example.com", role=Role.IMPORTER_EXPORTER)
    delete_user(demo, "new@example.com", by=ADMIN)
    assert profiles_repo.get_by_email(demo, "new@example.com") is None
    assert demo.scalar(select(AuditLog).where(AuditLog.action == "profile.delete")) is not None


def test_first_admin_can_be_bootstrapped_without_by(demo: Session) -> None:
    admin = profiles_repo.get_by_email(demo, ADMIN)
    assert admin is not None
    admin.is_active = False  # simulate a database with no active admin
    demo.flush()

    set_role(demo, "importer2@portiq.demo", Role.PLATFORM_ADMIN, None)
    promoted = demo.scalar(select(Profile).where(Profile.email == "importer2@portiq.demo"))
    assert promoted is not None and promoted.role is Role.PLATFORM_ADMIN
