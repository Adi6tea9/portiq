"""B01: CORS only allows the configured origins and never pairs '*' with credentials."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.config import settings


def _allowed_origin() -> str:
    origins = settings.allowed_origins
    assert origins, "ALLOWED_ORIGINS must configure at least one origin for the CORS tests"
    return origins[0]


def test_preflight_for_configured_origin_is_allowed(client: TestClient) -> None:
    origin = _allowed_origin()

    response = client.options(
        "/health",
        headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert response.headers["access-control-allow-credentials"] == "true"


def test_preflight_for_unknown_origin_is_refused(client: TestClient) -> None:
    response = client.options(
        "/health",
        headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "GET"},
    )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_simple_request_exposes_request_id_header(client: TestClient) -> None:
    response = client.get("/health", headers={"Origin": _allowed_origin()})

    assert response.headers["access-control-allow-origin"] == _allowed_origin()
    assert "x-request-id" in response.headers["access-control-expose-headers"].lower()
