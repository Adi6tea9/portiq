"""B01: /health becomes the contract envelope, /ready reflects database and model state."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

import app.main as main_module


@pytest.fixture
def ops_client() -> Iterator[TestClient]:
    with TestClient(main_module.create_app()) as test_client:
        yield test_client


def test_health_returns_envelope_with_request_id(ops_client: TestClient) -> None:
    response = ops_client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"data", "meta"}
    assert body["data"] == {"status": "ok"}
    assert set(body["meta"]) == {"request_id", "generated_at"}
    assert body["meta"]["request_id"] == response.headers["X-Request-ID"]
    assert body["meta"]["generated_at"].endswith("Z")


def test_health_does_not_need_the_database(
    ops_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(main_module, "check_database", lambda: False)

    assert ops_client.get("/health").status_code == 200


def test_ready_503_when_model_is_not_loaded(
    ops_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(main_module, "check_database", lambda: True)
    monkeypatch.setattr(main_module, "model_is_loaded", lambda: False)

    response = ops_client.get("/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["error"]["code"] == "MODEL_UNAVAILABLE"
    assert body["error"]["message"] == "Service is not ready"
    assert body["error"]["details"] == [{"field": "model", "issue": "not_loaded"}]
    assert body["error"]["request_id"] == response.headers["X-Request-ID"]


def test_ready_200_when_database_and_model_are_available(
    ops_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(main_module, "check_database", lambda: True)
    monkeypatch.setattr(main_module, "model_is_loaded", lambda: True)

    response = ops_client.get("/ready")

    assert response.status_code == 200
    assert response.json()["data"] == {
        "status": "ready",
        "checks": {"database": "ok", "model": "loaded"},
    }


def test_ready_503_when_database_is_unreachable(
    ops_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(main_module, "check_database", lambda: False)
    monkeypatch.setattr(main_module, "model_is_loaded", lambda: True)

    response = ops_client.get("/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert body["error"]["details"] == [{"field": "database", "issue": "error"}]


def test_readiness_never_leaks_secrets(
    ops_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(main_module, "check_database", lambda: False)
    monkeypatch.setattr(main_module, "model_is_loaded", lambda: False)

    text = ops_client.get("/ready").text.lower()

    assert "password" not in text
    assert "portiq:portiq" not in text
    assert "postgresql" not in text
