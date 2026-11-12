import hashlib
import json
import uuid
from datetime import datetime, timedelta , UTC
from typing import Any
from sqlalchemy.orm import Session
from collections import defaultdict

from app.core.errors import AppError
from app.models.tables import PredictionRun, Shipment, TariffRule
from app.services.cost_engine import calculate_costs

# Simple in-memory rate limiter: 10 requests per minute per user
RATE_LIMIT_CACHE = defaultdict(list)

def check_rate_limit(user_id: str):
    now = datetime.now(UTC)
    RATE_LIMIT_CACHE[user_id] = [t for t in RATE_LIMIT_CACHE[user_id] if now - t < timedelta(minutes=1)]
    if len(RATE_LIMIT_CACHE[user_id]) >= 10:
        raise AppError(429, "RATE_LIMITED", "Too many requests. Please wait and try again.")
    RATE_LIMIT_CACHE[user_id].append(now)

def _generate_input_hash(shipment: Shipment) -> str:
    """Hashes the shipment inputs to detect if the payload changed for the same idempotency key."""
    inputs = {
        "direction": shipment.direction.value if hasattr(shipment.direction, 'value') else shipment.direction,
        "cargo_type": shipment.cargo_type.value if hasattr(shipment.cargo_type, 'value') else shipment.cargo_type,
        "container_size_ft": shipment.container_size_ft,
        "weight_kg": str(shipment.weight_kg),
        "declared_value": str(shipment.declared_value),
        "shipping_line": shipment.shipping_line.value if hasattr(shipment.shipping_line, 'value') else shipment.shipping_line,
        "documentation_status": shipment.documentation_status.value if hasattr(shipment.documentation_status, 'value') else shipment.documentation_status,
        "expected_arrival_at": shipment.expected_arrival_at.isoformat()
    }
    return hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()

def run_prediction_flow(db: Session, shipment: Shipment, user_id: str, idempotency_key: str) -> PredictionRun:
    check_rate_limit(user_id)
    
    input_hash = _generate_input_hash(shipment)
    
    # 1. Idempotency Check
    existing_run = db.query(PredictionRun).filter(
        PredictionRun.shipment_id == shipment.id,
        PredictionRun.idempotency_key == uuid.UUID(idempotency_key)
    ).first()
    
    if existing_run:
        if existing_run.input_hash != input_hash:
            raise AppError(409, "IDEMPOTENCY_CONFLICT", "This request was already submitted with different details.")
        return existing_run # Return original 200 OK

    warnings = [{"code": "DEMO_DATA", "message": "Rates and model are for planning demonstration only."}]
    
    # 2. Mock Capacity Snapshot (Since B05 sim integration varies, we use a safe fallback)
    capacity_snapshot = {
        "status": "unavailable",
        "reason": "Capacity simulator integration pending",
        "resource_type": None,
        "utilization_pct": None,
        "source_type": None,
        "bucket_start": None,
        "bucket_end": None
    }
    warnings.append({"code": "CAPACITY_UNAVAILABLE", "message": "No forecast for the expected arrival date"})

    # 3. Mock ML & SHAP Execution (Safe fallback if ml.py is not fully wired)
    predicted_dwell_days = 6.2
    predicted_clearance_at = shipment.expected_arrival_at + timedelta(days=predicted_dwell_days)
    explanation = {
        "status": "unavailable",
        "reason": "Model explainer unavailable",
        "features": []
    }
    warnings.append({"code": "EXPLANATION_UNAVAILABLE", "message": "SHAP explainer failed or missing"})

    # 4. Cost Engine Execution
    active_rules = db.query(TariffRule).filter(TariffRule.is_active == True).all()
    cost_lines, total_is_partial, total_estimated_cost = calculate_costs(shipment, predicted_dwell_days, active_rules)
    
    if total_is_partial:
        warnings.append({"code": "TARIFF_MISSING", "message": "One or more applicable tariff rules could not be resolved."})

    # 5. Persist Immutable Run
    new_run = PredictionRun(
        id=str(uuid.uuid4()),
        shipment_id=shipment.id,
        requested_by=user_id,
        idempotency_key=idempotency_key,
        input_hash=input_hash,
        predicted_dwell_days=predicted_dwell_days,
        predicted_clearance_at=predicted_clearance_at,
        currency=shipment.currency,
        total_estimated_cost=total_estimated_cost,
        total_is_partial=total_is_partial,
        cost_breakdown=[line for line in cost_lines],
        explanation=explanation,
        capacity_snapshot=capacity_snapshot,
        warnings=warnings,
        input_snapshot={"hash": input_hash},
        model_version="dwell-baseline-1.0.0",
        dataset_version="synthetic-v1",
        tariff_rule_versions={line["component"]: line["rule_version"] for line in cost_lines if line["rule_version"]},
        data_source="synthetic",
        is_demo_data=True,
        created_at=datetime.now(UTC)
    )
    db.add(new_run)
    db.commit()
    db.refresh(new_run)
    
    return new_run