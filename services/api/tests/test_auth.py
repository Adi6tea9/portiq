"""B03: auth modes, profile provisioning and the identity/config/ports endpoints."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import security
from app.core.config import settings
from app.core.deps import get_db, require_role
from app.core.errors import AppError
from app.models import Profile
from app.repositories import profiles as profiles_repo
from app.schemas.enums import Role
from scripts.seed_dev import seed_demo

ISSUER = "https://project.supabase.co/auth/v1"
AUDIENCE = "authenticated"
JWKS_URL = f"{ISSUER}/.well-known/jwks.json"

ROLES = (
    ("importer@portiq.demo", "importer_exporter", 0),
    ("operator@portiq.demo", "port_operator", 2),
    ("operator2@portiq.demo", "port_operator", 1),
    ("admin@portiq.demo", "platform_admin", 0),
)


@pytest.fixture
def api(app: FastAPI, client: TestClient, db_session: Session) -> Iterator[TestClient]:
    """HTTP client whose requests share the rolled-back test transaction."""
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        yield client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def demo(db_session: Session) -> Session:
    seed_demo(db_session, app_env="test")
    return db_session


@pytest.fixture(scope="module")
def signing_key() -> tuple[RSAPrivateKey, bytes]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_pem = private_key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return private_key, public_pem


class _FakeSigningKey:
    def __init__(self, key: bytes) -> None:
        self.key = key


class _FakeJwksClient:
    def __init__(self, public_pem: bytes) -> None:
        self._public_pem = public_pem

    def get_signing_key_from_jwt(self, token: str) -> _FakeSigningKey:
        return _FakeSigningKey(self._public_pem)


@pytest.fixture
def supabase(
    monkeypatch: pytest.MonkeyPatch, signing_key: tuple[RSAPrivateKey, bytes]
) -> RSAPrivateKey:
    """Switch security to supabase mode and verify against a local test key."""
    private_key, public_pem = signing_key
    monkeypatch.setattr(security, "jwks_client", lambda: _FakeJwksClient(public_pem))
    monkeypatch.setattr(
        security,
        "settings",
        replace(
            settings,
            auth_mode="supabase",
            supabase_jwt_jwks_url=JWKS_URL,
            supabase_jwt_issuer=ISSUER,
            supabase_jwt_audience=AUDIENCE,
        ),
    )
    return private_key


def _bearer(email: str) -> dict[str, str]:
    return {"Authorization": f"Bearer dev:{email}"}


def _claims(**overrides: object) -> dict[str, object]:
    now = datetime.now(UTC)
    claims: dict[str, object] = {
        "sub": str(uuid4()),
        "email": "first.login@portiq.demo",
        "aud": AUDIENCE,
        "iss": ISSUER,
        "iat": now,
        "exp": now + timedelta(minutes=5),
    }
    claims.update(overrides)
    return claims


def _token(private_key: RSAPrivateKey, claims: dict[str, object]) -> str:
    return jwt.encode(claims, private_key, algorithm="RS256", headers={"kid": "test-key"})


def _assert_rejected(token: str) -> None:
    with pytest.raises(AppError) as excinfo:
        security.resolve_identity(token)
    assert excinfo.value.status_code == 401
    assert excinfo.value.code == "UNAUTHENTICATED"


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("get", "/api/v1/me", None),
        ("patch", "/api/v1/me", {"display_name": "Testing"}),
        ("get", "/api/v1/config", None),
        ("get", "/api/v1/ports", None),
    ],
)
def test_protected_routes_require_a_token(
    api: TestClient, method: str, path: str, body: dict[str, Any] | None
) -> None:
    response = api.request(method.upper(), path, json=body)

    assert response.status_code == 401
    error = response.json()["error"]
    assert error["code"] == "UNAUTHENTICATED"
    assert error["request_id"] == response.headers["X-Request-ID"]


def test_non_bearer_credentials_are_rejected(api: TestClient) -> None:
    response = api.get("/api/v1/me", headers={"Authorization": "Basic abc123"})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


@pytest.mark.parametrize(("email", "role", "assigned_ports"), ROLES)
def test_me_resolves_every_dev_role(
    api: TestClient, demo: Session, email: str, role: str, assigned_ports: int
) -> None:
    response = api.get("/api/v1/me", headers=_bearer(email))

    assert response.status_code == 200
    data = response.json()["data"]
    assert set(data) == {"user_id", "email", "display_name", "role", "assigned_port_ids"}
    assert data["email"] == email
    assert data["role"] == role
    profile = profiles_repo.get_by_email(demo, email)
    assert profile is not None
    assert data["user_id"] == str(profile.id)
    assert len(data["assigned_port_ids"]) == assigned_ports
    assert response.json()["meta"]["request_id"] == response.headers["X-Request-ID"]


def test_unknown_dev_user_is_rejected(api: TestClient, demo: Session) -> None:
    for token in ("dev:nobody@portiq.demo", "dev:", "dev:   "):
        response = api.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_inactive_profile_is_forbidden(api: TestClient, demo: Session) -> None:
    profile = profiles_repo.get_by_email(demo, "importer2@portiq.demo")
    assert profile is not None
    profile.is_active = False
    demo.flush()

    response = api.get("/api/v1/me", headers=_bearer("importer2@portiq.demo"))

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_ports_are_scoped_by_role(api: TestClient, demo: Session) -> None:
    def codes(email: str) -> list[str]:
        response = api.get("/api/v1/ports", headers=_bearer(email))
        assert response.status_code == 200
        ports = response.json()["data"]
        assert all(set(port) == {"id", "name", "port_code", "timezone"} for port in ports)
        return [port["port_code"] for port in ports]

    assert codes("importer@portiq.demo") == ["INMUN", "INNSA"]
    assert codes("admin@portiq.demo") == ["INMUN", "INNSA"]
    assert codes("operator@portiq.demo") == ["INMUN", "INNSA"]
    assert codes("operator2@portiq.demo") == ["INNSA"]


def test_config_returns_the_frozen_values(api: TestClient, demo: Session) -> None:
    response = api.get("/api/v1/config", headers=_bearer("importer@portiq.demo"))

    assert response.status_code == 200
    assert response.json()["data"] == {
        "capacity_thresholds": {"moderate_pct": 60, "high_pct": 85},
        "max_forecast_range_days": 31,
        "default_bucket": "day",
    }


def test_patch_me_trims_the_display_name(api: TestClient, demo: Session) -> None:
    response = api.patch(
        "/api/v1/me",
        headers=_bearer("importer@portiq.demo"),
        json={"display_name": "  Updated Name  "},
    )

    assert response.status_code == 200
    assert response.json()["data"]["display_name"] == "Updated Name"
    assert (
        api.get("/api/v1/me", headers=_bearer("importer@portiq.demo")).json()["data"][
            "display_name"
        ]
        == "Updated Name"
    )


def test_patch_me_ignores_role_and_owner_fields(api: TestClient, demo: Session) -> None:
    before = api.get("/api/v1/me", headers=_bearer("importer@portiq.demo")).json()["data"]

    response = api.patch(
        "/api/v1/me",
        headers=_bearer("importer@portiq.demo"),
        json={
            "display_name": "Still An Importer",
            "role": "platform_admin",
            "user_id": str(uuid4()),
            "is_active": False,
        },
    )

    assert response.status_code == 200
    after = response.json()["data"]
    assert after["role"] == "importer_exporter"
    assert after["user_id"] == before["user_id"]


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"display_name": ""},
        {"display_name": "   "},
        {"display_name": "x" * 81},
        {"display_name": 123},
    ],
)
def test_patch_me_validates_display_name(
    api: TestClient, demo: Session, body: dict[str, Any]
) -> None:
    response = api.patch("/api/v1/me", headers=_bearer("importer@portiq.demo"), json=body)

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert any(detail["field"] == "display_name" for detail in error["details"])


def test_require_role_blocks_other_roles(demo: Session) -> None:
    importer = profiles_repo.get_by_email(demo, "importer@portiq.demo")
    admin = profiles_repo.get_by_email(demo, "admin@portiq.demo")
    dependency = require_role(Role.PLATFORM_ADMIN)

    assert dependency(user=admin).role is Role.PLATFORM_ADMIN
    with pytest.raises(AppError) as excinfo:
        dependency(user=importer)
    assert (excinfo.value.status_code, excinfo.value.code) == (403, "FORBIDDEN")


def test_supabase_valid_token_resolves_sub_and_email(
    supabase: RSAPrivateKey,
) -> None:
    user_id = uuid4()
    token = _token(supabase, _claims(sub=str(user_id), email="verified@portiq.demo"))

    identity = security.resolve_identity(token)

    assert isinstance(identity, security.SupabaseIdentity)
    assert identity.user_id == user_id
    assert identity.email == "verified@portiq.demo"


def test_supabase_rejects_invalid_tokens(supabase: RSAPrivateKey) -> None:
    now = datetime.now(UTC)
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    missing_sub = _claims()
    del missing_sub["sub"]

    tokens = {
        "expired": _token(supabase, _claims(exp=now - timedelta(seconds=1))),
        "wrong_audience": _token(supabase, _claims(aud="someone-else")),
        "wrong_issuer": _token(supabase, _claims(iss="https://evil.example/auth/v1")),
        "bad_signature": _token(other_key, _claims()),
        "missing_sub": _token(supabase, missing_sub),
        "non_uuid_sub": _token(supabase, _claims(sub="not-a-uuid")),
        "missing_email": _token(supabase, _claims(email=None)),
        "not_a_jwt": "dev:importer@portiq.demo",
    }

    for token in tokens.values():
        _assert_rejected(token)


def test_supabase_first_login_provisions_an_importer(
    api: TestClient, db_session: Session, supabase: RSAPrivateKey
) -> None:
    user_id = uuid4()
    token = _token(
        supabase,
        _claims(
            sub=str(user_id),
            email="first.login@portiq.demo",
            role="platform_admin",
        ),
    )
    headers = {"Authorization": f"Bearer {token}"}

    response = api.get("/api/v1/me", headers=headers)

    assert response.status_code == 200
    assert response.json()["data"] == {
        "user_id": str(user_id),
        "email": "first.login@portiq.demo",
        "display_name": None,
        "role": "importer_exporter",
        "assigned_port_ids": [],
    }
    profile = profiles_repo.get_by_id(db_session, user_id)
    assert profile is not None
    assert profile.role is Role.IMPORTER_EXPORTER

    again = api.get("/api/v1/me", headers=headers)
    assert again.status_code == 200
    assert again.json()["data"]["user_id"] == str(user_id)
    assert (
        db_session.scalar(
            select(func.count())
            .select_from(Profile)
            .where(Profile.email == "first.login@portiq.demo")
        )
        == 1
    )


def test_supabase_role_comes_from_the_profile_not_the_token(
    api: TestClient, db_session: Session, supabase: RSAPrivateKey
) -> None:
    user_id = UUID(str(uuid4()))
    profiles_repo.create(
        db_session,
        user_id=user_id,
        email="operator.token@portiq.demo",
        role=Role.PORT_OPERATOR,
    )
    token = _token(supabase, _claims(sub=str(user_id), email="operator.token@portiq.demo"))

    response = api.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["data"]["role"] == "port_operator"


def test_supabase_http_rejects_invalid_expired_and_wrong_audience_tokens(
    api: TestClient, supabase: RSAPrivateKey
) -> None:
    now = datetime.now(UTC)
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    tokens = [
        _token(supabase, _claims(exp=now - timedelta(seconds=1))),
        _token(supabase, _claims(aud="someone-else")),
        _token(other_key, _claims()),
    ]

    for token in tokens:
        response = api.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "UNAUTHENTICATED"
