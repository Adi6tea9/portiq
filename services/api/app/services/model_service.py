"""Model input construction and guarded inference (backend spec 11.8).

The pipeline is loaded once at startup (``app.services.ml.dwell_model``). This module
turns a shipment into the 12 frozen features, runs the model with the configured
timeout, and refuses to serve a value that cannot be trusted.
"""

from __future__ import annotations

import logging
import math
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from datetime import UTC, datetime
from typing import Any

from app.core.config import settings
from app.core.errors import AppError
from app.models import Port, Shipment
from app.services.ml import dwell_model

logger = logging.getLogger("portiq.ml")

# backend spec 4.5: exact names, order and count.
FEATURE_NAMES: tuple[str, ...] = (
    "direction",
    "port_code",
    "cargo_type",
    "container_size_ft",
    "hs_chapter",
    "weight_kg",
    "shipping_line",
    "vessel_size_band",
    "documentation_status",
    "arrival_day_of_week",
    "arrival_month",
    "forecast_capacity_utilization_pct",
    # CG-021: model inputs collected on the shipment since 2026-11-23.
    "customs_channel",
    "importer_type",
    "cargo_priority",
)

# Same fixed national holidays as ml/scripts/generate_synthetic_v2.py (a test keeps them equal).
FIXED_HOLIDAYS = {(1, 26), (5, 1), (8, 15), (10, 2), (12, 25)}

# Fallback when the artifact has no metadata file.
DATASET_VERSION = "synthetic-v1"

# shortcut: a timed-out sklearn predict keeps running in its worker thread, upgrade if
# model latency ever approaches PREDICTION_TIMEOUT_SECONDS.
_EXECUTOR = ThreadPoolExecutor(max_workers=1)


def as_utc(value: datetime) -> datetime:
    """Timestamps are stored UTC, but a naive value would silently shift day/month."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def feature_row(shipment: Shipment, port: Port, utilization_pct: float) -> dict[str, Any]:
    """Build the model features. ``declared_value`` and the raw ``port_id`` are excluded.

    ``is_holiday`` is derived from the arrival date the same way the training data was; the
    customs exam queue stays derived from utilization (``ml.v2_defaults``).
    """
    arrival = as_utc(shipment.expected_arrival_at)
    return {
        "direction": str(shipment.direction),
        "port_code": port.port_code,
        "cargo_type": str(shipment.cargo_type),
        "container_size_ft": int(shipment.container_size_ft),
        "hs_chapter": str(shipment.hs_code)[:2],
        "weight_kg": float(shipment.weight_kg),
        "shipping_line": str(shipment.shipping_line),
        "vessel_size_band": str(shipment.vessel_size_band),
        "documentation_status": str(shipment.documentation_status),
        "arrival_day_of_week": arrival.strftime("%A"),
        "arrival_month": arrival.strftime("%B"),
        "forecast_capacity_utilization_pct": float(utilization_pct),
        "customs_channel": str(shipment.customs_channel),
        "importer_type": str(shipment.importer_type),
        "cargo_priority": str(shipment.cargo_priority),
        "is_holiday": int((arrival.month, arrival.day) in FIXED_HOLIDAYS),
    }


def model_version() -> str:
    """The served model's version from its metadata (spec 11.6), else ``MODEL_VERSION``."""
    version = dwell_model.metadata.get("model_version")
    return str(version) if version else settings.model_version or "dwell-model-v1"


def dataset_version() -> str:
    version = dwell_model.metadata.get("dataset_version")
    return str(version) if version else DATASET_VERSION


def out_of_range_inputs(features: dict[str, Any]) -> list[str]:
    """API-supplied numeric inputs outside the training range (spec 13.7, ``OUT_OF_RANGE_INPUT``).

    Inputs the API fills with fixed defaults are not checked: they are not the user's data.
    """
    ranges = dwell_model.metadata.get("numeric_training_ranges", {})
    outside = []
    for name in FEATURE_NAMES:
        bounds, value = ranges.get(name), features.get(name)
        if not bounds or not isinstance(value, int | float):
            continue
        if not bounds["min"] <= value <= bounds["max"]:
            outside.append(name)
    return outside


def predict_dwell(features: dict[str, Any]) -> float:
    """Run the loaded pipeline with a timeout; never return a fabricated number."""
    if not dwell_model.is_loaded:
        raise AppError(
            503, "MODEL_UNAVAILABLE", "The prediction service is unavailable. Try again later."
        )

    future = _EXECUTOR.submit(dwell_model.predict, features)
    try:
        value = future.result(timeout=settings.prediction_timeout_seconds)
    except FutureTimeout as exc:
        logger.warning("model_timeout", extra={"timeout": settings.prediction_timeout_seconds})
        raise AppError(
            503, "MODEL_UNAVAILABLE", "The prediction service is unavailable. Try again later."
        ) from exc
    except Exception as exc:  # noqa: BLE001 - any model failure is a 503, not a 500
        logger.exception("model_failed")
        raise AppError(
            503, "MODEL_UNAVAILABLE", "The prediction service is unavailable. Try again later."
        ) from exc

    if not math.isfinite(value) or value < 0:
        logger.error("model_invalid_output", extra={"value": repr(value)})
        raise AppError(
            503, "MODEL_UNAVAILABLE", "The prediction service is unavailable. Try again later."
        )
    return float(value)
