"""B06/CG-015: the served model's metadata drives provenance and ``OUT_OF_RANGE_INPUT``."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.deps import get_db
from app.repositories import ports as ports_repo
from app.services.ml import dwell_model, v2_defaults
from app.services.model_service import dataset_version, model_version, out_of_range_inputs
from app.services.prediction import RATE_LIMIT_CACHE
from scripts.seed_dev import seed_demo

IMPORTER = {"Authorization": "Bearer dev:importer@portiq.demo"}


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


def test_metadata_is_loaded_with_the_model(app: FastAPI) -> None:
    if not dwell_model.is_loaded:
        pytest.skip("model artifact not built")
    assert dwell_model.metadata["model_version"] == model_version()
    assert dwell_model.metadata["dataset_version"] == dataset_version() == "synthetic-v2"
    assert "weight_kg" in dwell_model.metadata["numeric_training_ranges"]


def test_out_of_range_checks_only_api_numeric_inputs(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        dwell_model,
        "metadata",
        {"numeric_training_ranges": {
            "weight_kg": {"min": 500.0, "max": 40000.0},
            "forecast_capacity_utilization_pct": {"min": 40.0, "max": 98.0},
            "exam_queue_len": {"min": 0.0, "max": 5.0},
        }},
    )
    inside = {"weight_kg": 40000.0, "forecast_capacity_utilization_pct": 40.0}
    assert out_of_range_inputs(inside) == []
    outside = {"weight_kg": 59000.0, "forecast_capacity_utilization_pct": 99.5}
    assert out_of_range_inputs(outside) == ["weight_kg", "forecast_capacity_utilization_pct"]
    # exam_queue_len is a fixed API default, not user input; it is never checked.
    assert out_of_range_inputs({"weight_kg": 1000.0, "exam_queue_len": 99}) == []
    monkeypatch.setattr(dwell_model, "metadata", {})
    assert out_of_range_inputs({"weight_kg": 1e9}) == []  # no metadata: nothing is guessed


def test_prediction_flags_inputs_outside_the_training_range(
    api: TestClient, db_session: Session
) -> None:
    if not dwell_model.is_loaded:
        pytest.skip("model artifact not built")
    seed_demo(db_session, app_env="test")
    port = ports_repo.get_by_code(db_session, "INNSA")
    assert port is not None

    def create(reference: str, weight: float) -> str:
        body: dict[str, Any] = {
            "port_id": str(port.id), "reference": reference, "direction": "import",
            "cargo_type": "general_container", "container_size_ft": 40, "hs_code": "847130",
            "weight_kg": weight, "declared_value": "100000.00", "currency": "INR",
            "shipping_line": "Line A", "vessel_size_band": "large",
            "expected_arrival_at": "2026-12-01T10:00:00Z", "documentation_status": "complete",
        }
        res = api.post("/api/v1/shipments", json=body, headers=IMPORTER)
        assert res.status_code == 201, res.text
        return str(res.json()["data"]["id"])

    def predict(shipment_id: str) -> dict[str, Any]:
        res = api.post(
            f"/api/v1/shipments/{shipment_id}/prediction",
            headers={**IMPORTER, "Idempotency-Key": str(uuid.uuid4())},
        )
        assert res.status_code == 201, res.text
        return dict(res.json()["data"])

    max_weight = dwell_model.metadata["numeric_training_ranges"]["weight_kg"]["max"]
    heavy = predict(create("META-HEAVY-1", 59000.0))  # valid for the API, heavier than training
    normal = predict(create("META-NORMAL-1", 12000.0))
    assert 59000.0 > max_weight

    heavy_warnings = {w["code"]: w["message"] for w in heavy["warnings"]}
    assert "weight_kg" in heavy_warnings["OUT_OF_RANGE_INPUT"]
    assert "OUT_OF_RANGE_INPUT" not in {w["code"] for w in normal["warnings"]}
    assert heavy["provenance"]["model_version"] == model_version()
    assert heavy["provenance"]["dataset_version"] == "synthetic-v2"


def test_v2_defaults_are_values_the_model_was_trained_on() -> None:
    """Unknown category strings are silently one-hot encoded as "none of the above"."""
    if not dwell_model.metadata:
        pytest.skip("model metadata not built")
    schema = dwell_model.metadata["feature_schema"]
    ranges = dwell_model.metadata["numeric_training_ranges"]
    for utilization in (50.6, 75.0, 97.9):
        for name, value in v2_defaults({"forecast_capacity_utilization_pct": utilization}).items():
            if schema[name]["type"] == "categorical":
                assert value in schema[name]["categories"], name
            else:
                assert ranges[name]["min"] <= value <= ranges[name]["max"], (name, value)
