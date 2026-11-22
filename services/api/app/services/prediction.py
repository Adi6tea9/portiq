"""Prediction orchestration (backend spec section 13).

Idempotency, rate limiting, capacity snapshot, model, SHAP, cost engine and the
immutable ``prediction_runs`` row. The model, capacity and SHAP steps never fall back
to a fabricated value.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import CapacityForecast, Port, PredictionRun, Shipment, TariffRule
from app.schemas.enums import ResourceType, WarningCode
from app.schemas.shipments import utc_z
from app.services.capacity_sim import utilization_for
from app.services.cost_engine import calculate_costs
from app.services.explain import explain
from app.services.model_service import (
    as_utc,
    dataset_version,
    feature_row,
    model_version,
    out_of_range_inputs,
    predict_dwell,
)

RATE_LIMIT_PER_MINUTE = 10

# Simple in-memory rate limiter: 10 requests per minute per user (backend spec 4.13).
RATE_LIMIT_CACHE: dict[str, list[datetime]] = defaultdict(list)


def check_rate_limit(user_id: str) -> None:
    now = datetime.now(UTC)
    RATE_LIMIT_CACHE[user_id] = [
        at for at in RATE_LIMIT_CACHE[user_id] if now - at < timedelta(minutes=1)
    ]
    if len(RATE_LIMIT_CACHE[user_id]) >= RATE_LIMIT_PER_MINUTE:
        raise AppError(429, "RATE_LIMITED", "Too many requests. Please wait and try again.")
    RATE_LIMIT_CACHE[user_id].append(now)


def _prediction_inputs(shipment: Shipment) -> dict[str, str | int]:
    """Every input that changes the prediction or its cost, never status or owner."""
    return {
        "port_id": str(shipment.port_id),
        "direction": str(shipment.direction),
        "cargo_type": str(shipment.cargo_type),
        "container_size_ft": int(shipment.container_size_ft),
        "hs_code": shipment.hs_code,
        "weight_kg": str(shipment.weight_kg),
        "declared_value": str(shipment.declared_value),
        "currency": str(shipment.currency),
        "shipping_line": str(shipment.shipping_line),
        "vessel_size_band": str(shipment.vessel_size_band),
        "expected_arrival_at": as_utc(shipment.expected_arrival_at).isoformat(),
        "documentation_status": str(shipment.documentation_status),
    }


def _generate_input_hash(shipment: Shipment) -> str:
    """Hash the prediction inputs so an idempotency key cannot hide a changed shipment."""
    payload = json.dumps(_prediction_inputs(shipment), sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()


def _capacity_context(
    session: Session, shipment: Shipment, port: Port
) -> tuple[dict[str, Any], float]:
    """The yard bucket containing the expected arrival, or the simulator fallback.

    Invalid buckets (capacity <= 0, negative or above 1.2x capacity occupancy) are
    never served (backend spec 9).
    """
    arrival = as_utc(shipment.expected_arrival_at)
    bucket = (
        session.query(CapacityForecast)
        .filter(
            CapacityForecast.port_id == shipment.port_id,
            CapacityForecast.resource_type == ResourceType.YARD,
            CapacityForecast.bucket_start <= arrival,
            CapacityForecast.bucket_end > arrival,
            CapacityForecast.total_capacity > 0,
            CapacityForecast.predicted_occupied >= 0,
            CapacityForecast.predicted_occupied <= 1.2 * CapacityForecast.total_capacity,
        )
        .order_by(CapacityForecast.bucket_start.desc())
        .first()
    )
    if bucket is not None:
        snapshot = {
            "status": "available",
            "reason": None,
            "resource_type": ResourceType.YARD.value,
            "utilization_pct": float(bucket.utilization_pct),
            "source_type": bucket.source_type.value
            if hasattr(bucket.source_type, "value")
            else str(bucket.source_type),
            "bucket_start": utc_z(bucket.bucket_start),
            "bucket_end": utc_z(bucket.bucket_end),
        }
        return snapshot, float(bucket.utilization_pct)

    snapshot = {
        "status": "unavailable",
        "reason": "No forecast for the expected arrival date",
        "resource_type": None,
        "utilization_pct": None,
        "source_type": None,
        "bucket_start": None,
        "bucket_end": None,
    }
    # CONTRACT-GAP: CG-016 - what to do when the simulator cannot produce the required
    # feature is undefined, so predict nothing rather than substitute a number.
    try:
        simulated = utilization_for(port.port_code, ResourceType.YARD.value, arrival.date())
    except ValueError as exc:
        raise AppError(
            503, "MODEL_UNAVAILABLE", "The prediction service is unavailable. Try again later."
        ) from exc
    if simulated is None:
        raise AppError(
            503, "MODEL_UNAVAILABLE", "The prediction service is unavailable. Try again later."
        )
    return snapshot, float(simulated)


def run_prediction_flow(
    db: Session, shipment: Shipment, user_id: str, idempotency_key: str
) -> PredictionRun:
    check_rate_limit(user_id)

    input_hash = _generate_input_hash(shipment)

    existing_run = (
        db.query(PredictionRun)
        .filter(
            PredictionRun.shipment_id == shipment.id,
            PredictionRun.idempotency_key == uuid.UUID(idempotency_key),
        )
        .first()
    )
    if existing_run is not None:
        if existing_run.input_hash != input_hash:
            raise AppError(
                409,
                "IDEMPOTENCY_CONFLICT",
                "This request was already submitted with different details.",
            )
        return existing_run  # 200 replay, never recomputed

    port = db.get(Port, shipment.port_id)
    if port is None:
        raise AppError(404, "NOT_FOUND", "Not found")

    capacity_snapshot, capacity_utilization = _capacity_context(db, shipment, port)
    features = feature_row(shipment, port, capacity_utilization)

    predicted_dwell_days = predict_dwell(features)
    predicted_clearance_at = as_utc(shipment.expected_arrival_at) + timedelta(
        days=predicted_dwell_days
    )

    explanation = explain(features, predicted_dwell_days)

    active_rules = db.query(TariffRule).filter(TariffRule.is_active.is_(True)).all()
    cost_lines, total_is_partial, total_estimated_cost = calculate_costs(
        shipment, predicted_dwell_days, active_rules
    )

    warnings: list[dict[str, str]] = [
        {
            "code": WarningCode.DEMO_DATA.value,
            "message": "Rates and model are for planning demonstration only.",
        }
    ]
    if capacity_snapshot["status"] != "available":
        warnings.append(
            {
                "code": WarningCode.CAPACITY_UNAVAILABLE.value,
                "message": "No forecast for the expected arrival date",
            }
        )
    if explanation["status"] != "available":
        warnings.append(
            {
                "code": WarningCode.EXPLANATION_UNAVAILABLE.value,
                "message": explanation.get("reason") or "Explanation unavailable",
            }
        )
    outside = out_of_range_inputs(features)
    if outside:
        warnings.append(
            {
                "code": WarningCode.OUT_OF_RANGE_INPUT.value,
                "message": f"Outside the model's training range: {', '.join(outside)}.",
            }
        )
    if any(line["status"] == "unavailable" for line in cost_lines):
        warnings.append(
            {
                "code": WarningCode.TARIFF_MISSING.value,
                "message": "One applicable tariff rule could not be resolved.",
            }
        )

    created_at = datetime.now(UTC)
    new_run = PredictionRun(
        id=uuid.uuid4(),
        shipment_id=shipment.id,
        requested_by=uuid.UUID(str(user_id)),
        idempotency_key=uuid.UUID(idempotency_key),
        input_hash=input_hash,
        predicted_dwell_days=predicted_dwell_days,
        predicted_clearance_at=predicted_clearance_at,
        currency=shipment.currency,
        total_estimated_cost=total_estimated_cost,
        total_is_partial=total_is_partial,
        cost_breakdown=cost_lines,
        explanation=explanation,
        capacity_snapshot=capacity_snapshot,
        warnings=warnings,
        input_snapshot={
            "inputs": _prediction_inputs(shipment),
            "features": features,
            "capacity_feature_utilization_pct": capacity_utilization,
        },
        model_version=model_version(),
        dataset_version=dataset_version(),
        tariff_rule_versions={
            line["component"]: line["rule_version"]
            for line in cost_lines
            if line["rule_version"]
        },
        data_source="synthetic",
        is_demo_data=True,
        created_at=created_at,
    )
    db.add(new_run)
    db.commit()
    db.refresh(new_run)
    return new_run
