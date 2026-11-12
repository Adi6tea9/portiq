"""B01: every failure path returns the frontend contract 5.1 error envelope."""

from __future__ import annotations

from uuid import UUID

from fastapi.testclient import TestClient

from tests.support.probe_app import app as probe_app


def _client() -> TestClient:
    return TestClient(probe_app)


def test_unknown_route_returns_not_found_envelope() -> None:
    response = _client().get("/does-not-exist")

    assert response.status_code == 404
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "request_id"}
    assert body["error"]["code"] == "NOT_FOUND"
    assert body["error"]["message"] == "Not Found"
    assert body["error"]["request_id"] == response.headers["X-Request-ID"]
    UUID(body["error"]["request_id"])


def test_validation_error_returns_field_details() -> None:
    response = _client().post("/_probe/validate", json={"weight_kg": 0})

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert body["error"]["message"] == "Validation failed"
    assert body["error"]["details"] == [
        {"field": "weight_kg", "issue": "Input should be greater than 0"}
    ]
    assert set(body["error"]["details"][0]) == {"field", "issue"}
    assert body["error"]["request_id"] == response.headers["X-Request-ID"]


def test_validation_error_uses_json_field_names_not_locations() -> None:
    text = _client().post("/_probe/validate", json={"weight_kg": "heavy"}).text

    assert "weight_kg" in text
    assert '"loc"' not in text
    assert '"input"' not in text
    assert '"ctx"' not in text


def test_unexpected_error_is_generic_and_keeps_the_request_id() -> None:
    response = _client().get("/_probe/boom")

    assert response.status_code == 500
    body = response.json()
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert body["error"]["message"] == "An unexpected error occurred"
    assert body["error"]["request_id"] == response.headers["X-Request-ID"]
    assert "internal detail" not in response.text
    assert "RuntimeError" not in response.text
    assert "Traceback" not in response.text


def test_malformed_json_reports_the_body_as_the_field() -> None:
    response = _client().post(
        "/_probe/validate",
        content=b"{weight_kg: 0}",
        headers={"Content-Type": "application/json"},
    )

    assert response.status_code == 422
    detail = response.json()["error"]["details"][0]
    assert detail["field"] == "body"
    assert detail["issue"] == "JSON decode error"


def test_method_not_allowed_uses_the_documented_mapping() -> None:
    # CONTRACT-GAP CG-003: 405 has no code in the contract table, so it maps to BAD_REQUEST.
    response = _client().patch("/health")

    assert response.status_code == 405
    assert response.json()["error"]["code"] == "BAD_REQUEST"


def test_request_ids_are_unique_per_request() -> None:
    client = _client()

    first = client.get("/does-not-exist").json()["error"]["request_id"]
    second = client.get("/does-not-exist").json()["error"]["request_id"]

    assert first != second


def test_success_and_failure_share_the_request_id_header() -> None:
    client = _client()

    ok = client.get("/health")
    assert ok.headers["X-Request-ID"] == ok.json()["meta"]["request_id"]

    failed = client.get("/does-not-exist")
    assert failed.headers["X-Request-ID"] == failed.json()["error"]["request_id"]
