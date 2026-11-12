"""Shipment and milestone endpoints (backend spec sections 7 and 8)."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Header
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from fastapi.encoders import jsonable_encoder

from app.core.deps import DbSession, require_role
from app.core.errors import AppError, request_id_of
from app.models import Profile, Shipment
from app.models.tables import PredictionRun
from app.services.prediction import run_prediction_flow
from app.repositories import audit_logs as audit_logs_repo
from app.repositories import operator_ports as operator_ports_repo
from app.repositories import ports as ports_repo
from app.repositories import shipments as shipments_repo
from app.schemas.enums import Role, ShipmentStatus
from app.schemas.envelope import ErrorDetail, Pagination, envelope
from app.schemas.shipments import (
    EventCreate,
    ShipmentCreate,
    ShipmentDetailResponse,
    ShipmentPatch,
    shipment_detail_response,
    shipment_response,
    utc_z,
)

router = APIRouter(prefix="/shipments", tags=["shipments"])

Importer = Annotated[Profile, Depends(require_role(Role.IMPORTER_EXPORTER))]
ScopedReader = Annotated[Profile, Depends(require_role(Role.IMPORTER_EXPORTER, Role.PORT_OPERATOR))]
Operator = Annotated[Profile, Depends(require_role(Role.PORT_OPERATOR))]

Page = Annotated[int, Query(ge=1)]
PageSize = Annotated[int, Query(ge=1, le=100)]

ALLOWED_TRANSITIONS = {
    ShipmentStatus.SUBMITTED: ShipmentStatus.ARRIVED,
    ShipmentStatus.ARRIVED: ShipmentStatus.CLEARED,
}


def _not_found() -> AppError:
    return AppError(404, "NOT_FOUND", "Not found")


def _invalid(field: str, issue: str) -> AppError:
    return AppError(
        422, "VALIDATION_ERROR", "Validation failed", [ErrorDetail(field=field, issue=issue)]
    )


def _state_conflict() -> AppError:
    return AppError(409, "STATE_CONFLICT", "That status change is not allowed.")


def _visible_shipment(session: DbSession, user: Profile, shipment_id: UUID) -> Shipment:
    """Owner for importers, port scope for operators; anything else is a 404."""
    shipment = shipments_repo.get_by_id(session, shipment_id)
    if shipment is None:
        raise _not_found()
    if user.role == Role.PORT_OPERATOR:
        if shipment.port_id not in set(operator_ports_repo.list_port_ids(session, user.id)):
            raise _not_found()
    elif shipment.owner_user_id != user.id:
        raise _not_found()
    return shipment


def _owned_shipment(session: DbSession, user: Profile, shipment_id: UUID) -> Shipment:
    shipment = shipments_repo.get_by_id(session, shipment_id)
    if shipment is None or shipment.owner_user_id != user.id:
        raise _not_found()
    return shipment


def _detail(session: DbSession, shipment: Shipment) -> ShipmentDetailResponse:
    latest = shipments_repo.latest_predictions(session, [shipment.id]).get(shipment.id)
    events = shipments_repo.list_events(session, shipment.id)
    return shipment_detail_response(shipment, latest, events)


def _day_bounds(
    arrival_from: date | None, arrival_to: date | None
) -> tuple[datetime | None, datetime | None]:
    """Filter on ``expected_arrival_at``; both dates are inclusive whole UTC days."""
    start = datetime.combine(arrival_from, time.min, tzinfo=UTC) if arrival_from else None
    end = (
        datetime.combine(arrival_to + timedelta(days=1), time.min, tzinfo=UTC)
        if arrival_to
        else None
    )
    return start, end


def _scope(user: Profile, session: DbSession) -> dict[str, Any]:
    if user.role is Role.PORT_OPERATOR:
        return {"port_ids": operator_ports_repo.list_port_ids(session, user.id)}
    return {"owner_user_id": user.id}


@router.get("/summary")
def read_shipment_summary(
    request: Request,
    user: Importer,
    session: DbSession,
) -> dict[str, Any]:
    counts = shipments_repo.status_counts_for_owner(session, user.id)
    data = {
        "total": sum(counts.values()),
        "status_counts": {status.value: counts[status] for status in ShipmentStatus},
    }
    return envelope(data, request_id_of(request))


@router.get("")
def list_shipments(
    request: Request,
    user: ScopedReader,
    session: DbSession,
    status: ShipmentStatus | None = None,
    arrival_from: date | None = None,
    arrival_to: date | None = None,
    q: str | None = None,
    page: Page = 1,
    page_size: PageSize = 20,
) -> dict[str, Any]:
    start, end = _day_bounds(arrival_from, arrival_to)
    filters: dict[str, Any] = {
        "status": status,
        "arrival_from": start,
        "arrival_to": end,
        "q": q,
    }
    scope = _scope(user, session)
    items = shipments_repo.list_shipments(
        session, **scope, **filters, page=page, page_size=page_size
    )
    total = shipments_repo.count_shipments(session, **scope, **filters)
    latest = shipments_repo.latest_predictions(session, [item.id for item in items])
    data = [shipment_response(item, latest.get(item.id)).model_dump(mode="json") for item in items]
    pagination = Pagination(page=page, page_size=page_size, total=total)
    return envelope(data, request_id_of(request), pagination)


@router.post("", status_code=201)
def create_shipment(
    payload: ShipmentCreate,
    request: Request,
    user: Importer,
    session: DbSession,
) -> dict[str, Any]:
    if ports_repo.get_by_id(session, payload.port_id) is None:
        raise _invalid("port_id", "port not found")
    if shipments_repo.get_by_reference(session, payload.reference) is not None:
        raise _invalid("reference", "already exists")

    now = datetime.now(UTC)
    try:
        shipment = shipments_repo.create(
            session,
            owner_user_id=user.id,
            port_id=payload.port_id,
            reference=payload.reference,
            direction=payload.direction,
            cargo_type=payload.cargo_type,
            container_size_ft=payload.container_size_ft,
            hs_code=payload.hs_code,
            weight_kg=payload.weight_kg,
            declared_value=payload.declared_value,
            currency=payload.currency,
            shipping_line=payload.shipping_line,
            vessel_size_band=payload.vessel_size_band,
            expected_arrival_at=payload.expected_arrival_at.astimezone(UTC),
            documentation_status=payload.documentation_status,
            status=ShipmentStatus.SUBMITTED,
        )
    except IntegrityError:
        session.rollback()
        raise _invalid("reference", "already exists") from None

    shipments_repo.add_event(
        session,
        shipment_id=shipment.id,
        actor_user_id=user.id,
        event_type="created",
        from_status=None,
        to_status=ShipmentStatus.SUBMITTED,
        occurred_at=now,
    )
    shipment.updated_at = now
    session.flush()
    return envelope(_detail(session, shipment).model_dump(mode="json"), request_id_of(request))


@router.get("/{shipment_id}")
def read_shipment(
    shipment_id: UUID,
    request: Request,
    user: ScopedReader,
    session: DbSession,
) -> dict[str, Any]:
    shipment = _visible_shipment(session, user, shipment_id)
    return envelope(_detail(session, shipment).model_dump(mode="json"), request_id_of(request))


@router.patch("/{shipment_id}")
def update_shipment(
    payload: ShipmentPatch,
    shipment_id: UUID,
    request: Request,
    user: Importer,
    session: DbSession,
) -> dict[str, Any]:
    # CONTRACT-GAP: CG-014 - unknown fields 422, explicit nulls ignored, empty body a no-op.
    shipment = _owned_shipment(session, user, shipment_id)
    if shipment.status is not ShipmentStatus.SUBMITTED:
        raise _state_conflict()

    changes = payload.model_dump(exclude_unset=True, exclude_none=True)
    for field, value in changes.items():
        if field == "expected_arrival_at":
            value = value.astimezone(UTC)
        setattr(shipment, field, value)
    if changes:
        shipment.updated_at = datetime.now(UTC)
        session.flush()

    latest = shipments_repo.latest_predictions(session, [shipment.id]).get(shipment.id)
    return envelope(
        shipment_response(shipment, latest).model_dump(mode="json"), request_id_of(request)
    )


@router.post("/{shipment_id}/events")
def record_event(
    payload: EventCreate,
    shipment_id: UUID,
    request: Request,
    user: Operator,
    session: DbSession,
) -> dict[str, Any]:
    shipment = _visible_shipment(session, user, shipment_id)
    occurred_at = payload.occurred_at.astimezone(UTC)

    expected = ALLOWED_TRANSITIONS.get(shipment.status)
    if expected is None or payload.to_status is not expected:
        raise _state_conflict()
    if occurred_at > datetime.now(UTC) + timedelta(minutes=5):
        raise _invalid("occurred_at", "must not be more than 5 minutes in the future")
    if payload.to_status is ShipmentStatus.CLEARED and (
        shipment.actual_arrival_at is None
        or occurred_at < shipment.actual_arrival_at.astimezone(UTC)
    ):
        raise _invalid("occurred_at", "must not be before actual_arrival_at")

    previous = shipment.status
    now = datetime.now(UTC)
    shipment.status = payload.to_status
    if payload.to_status is ShipmentStatus.ARRIVED:
        shipment.actual_arrival_at = occurred_at
    else:
        shipment.actual_cleared_at = occurred_at
    shipment.updated_at = now

    note = (payload.note or "").strip() or None
    shipments_repo.add_event(
        session,
        shipment_id=shipment.id,
        actor_user_id=user.id,
        event_type=payload.to_status.value,
        from_status=previous,
        to_status=payload.to_status,
        occurred_at=occurred_at,
        note=note,
    )
    audit_logs_repo.add(
        session,
        actor_user_id=user.id,
        action=f"shipment.{payload.to_status.value}",
        entity_type="shipment",
        entity_id=shipment.id,
        before={"status": previous.value},
        after={"status": payload.to_status.value, "occurred_at": utc_z(occurred_at)},
        request_id=request_id_of(request),
    )
    
    session.flush()
    return envelope(_detail(session, shipment).model_dump(mode="json"), request_id_of(request))

# --- STEP B09: PREDICTION ORCHESTRATION ---

@router.post("/{shipment_id}/prediction")
def create_prediction(
    shipment_id: UUID,
    request: Request,
    user: ScopedReader,
    session: DbSession,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
) -> JSONResponse:
    # 1. Authorize shipment (owner or scoped operator)
    shipment = _visible_shipment(session, user, shipment_id)
    
    # 2. Validate UUID header
    try:
        UUID(idempotency_key)
    except ValueError:
        raise _invalid("Idempotency-Key", "must be a valid UUID")

    # 3. Check for exact duplicate to set HTTP 200 instead of 201
    existing = session.query(PredictionRun).filter_by(
        shipment_id=shipment.id, idempotency_key=UUID(idempotency_key)
    ).first()
    status_code = 200 if existing else 201
    
    # 4. Run orchestration (handles 409 conflict, 429 rate limit, 503 fallback)
    run = run_prediction_flow(session, shipment, str(user.id), idempotency_key)
    
    response_data = {
        "prediction_id": str(run.id),
        "shipment_id": str(run.shipment_id),
        "predicted_dwell_days": float(run.predicted_dwell_days),
        "predicted_clearance_at": run.predicted_clearance_at.isoformat() + "Z",
        "currency": run.currency.value if hasattr(run.currency, 'value') else run.currency,
        "cost_breakdown": run.cost_breakdown,
        "total_estimated_cost": str(run.total_estimated_cost) if run.total_estimated_cost is not None else None,
        "total_is_partial": run.total_is_partial,
        "capacity_snapshot": run.capacity_snapshot,
        "explanation": run.explanation,
        "warnings": run.warnings,
        "provenance": {
            "model_version": run.model_version,
            "dataset_version": run.dataset_version,
            "tariff_rule_versions": list(run.tariff_rule_versions.values()),
            "generated_at": run.created_at.isoformat() + "Z",
            "data_source": run.data_source.value if hasattr(run.data_source, 'value') else run.data_source,
            "is_demo_data": run.is_demo_data
        }
    }
    
    return JSONResponse(
        status_code=status_code,
        content=jsonable_encoder({"data": response_data, "meta": {"request_id": request_id_of(request)}}),
    )

@router.get("/{shipment_id}/predictions")
def list_predictions(
    shipment_id: UUID,
    request: Request,
    user: ScopedReader,
    session: DbSession,
    page: Page = 1,
    page_size: PageSize = 20,
) -> dict[str, Any]:
    shipment = _visible_shipment(session, user, shipment_id)
        
    query = session.query(PredictionRun).filter(PredictionRun.shipment_id == shipment.id).order_by(PredictionRun.created_at.desc())
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    
    data = [{
        "prediction_id": str(item.id),
        "created_at": item.created_at.isoformat() + "Z",
        "model_version": item.model_version,
        "predicted_dwell_days": float(item.predicted_dwell_days),
        "total_estimated_cost": str(item.total_estimated_cost) if item.total_estimated_cost else None,
        "total_is_partial": item.total_is_partial,
        "is_demo_data": item.is_demo_data
    } for item in items]
    
    pagination = Pagination(page=page, page_size=page_size, total=total)
    return envelope(data, request_id_of(request), pagination)

