"""Shipment request/response shapes (frontend contract 5.4, backend spec section 8)."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints

from app.models import PredictionRun, Shipment, ShipmentEvent
from app.schemas.enums import (
    CargoType,
    Currency,
    Direction,
    DocumentationStatus,
    ShipmentStatus,
    ShippingLine,
    VesselSizeBand,
)

REFERENCE = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
HS_CODE = Annotated[str, StringConstraints(pattern=r"^[0-9]{6}$")]
NOTE = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
WEIGHT_KG_MAX = Decimal("60000")
DECLARED_VALUE_MAX = Decimal("1000000000000")
MONEY = Decimal("0.01")


def utc_z(value: datetime | None) -> str | None:
    """UTC ISO-8601 ending in ``Z`` (backend spec 5.1)."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def dwell_days(arrival: datetime | None, cleared: datetime | None) -> float | None:
    """``actual_cleared_at - actual_arrival_at`` in days, 2 dp (backend spec 8)."""
    if arrival is None or cleared is None:
        return None
    delta = cleared - arrival
    days = Decimal(delta.days * 86400 + delta.seconds) + Decimal(delta.microseconds) / Decimal(
        1_000_000
    )
    return float((days / Decimal(86400)).quantize(MONEY, rounding=ROUND_HALF_UP))


def money(value: Decimal | None) -> str | None:
    """Money is a 2 dp string, never a float (backend spec 5.2)."""
    return None if value is None else f"{value:.2f}"


class LatestPredictionSummary(BaseModel):
    prediction_id: UUID
    created_at: str
    predicted_dwell_days: float
    total_estimated_cost: str | None
    total_is_partial: bool
    model_version: str
    is_demo_data: bool


class ShipmentResponse(BaseModel):
    id: UUID
    port_id: UUID
    reference: str
    direction: Direction
    cargo_type: CargoType
    container_size_ft: Literal[20, 40]
    hs_code: str
    weight_kg: float
    declared_value: str
    currency: Currency
    shipping_line: ShippingLine
    vessel_size_band: VesselSizeBand
    expected_arrival_at: str
    documentation_status: DocumentationStatus
    status: ShipmentStatus
    actual_arrival_at: str | None
    actual_cleared_at: str | None
    actual_dwell_days: float | None
    created_at: str
    updated_at: str
    latest_prediction: LatestPredictionSummary | None


class ShipmentEventResponse(BaseModel):
    id: UUID
    shipment_id: UUID
    event_type: str
    from_status: ShipmentStatus | None
    to_status: ShipmentStatus
    occurred_at: str
    recorded_at: str
    actor_display_name: str | None
    note: str | None


class ShipmentDetailResponse(ShipmentResponse):
    events: list[ShipmentEventResponse]


class ShipmentSummaryResponse(BaseModel):
    total: int
    status_counts: dict[str, int]


class ShipmentCreate(BaseModel):
    """Body accepted by ``POST /shipments``; owner and status are never read from it."""

    model_config = ConfigDict(extra="forbid")

    port_id: UUID
    reference: REFERENCE
    direction: Direction
    cargo_type: CargoType
    container_size_ft: Literal[20, 40]
    hs_code: HS_CODE
    weight_kg: Annotated[Decimal, Field(gt=0, le=WEIGHT_KG_MAX)]
    declared_value: Annotated[Decimal, Field(ge=0, le=DECLARED_VALUE_MAX)]
    currency: Currency
    shipping_line: ShippingLine
    vessel_size_band: VesselSizeBand
    expected_arrival_at: AwareDatetime
    documentation_status: DocumentationStatus


class ShipmentPatch(BaseModel):
    """Allowlist from frontend contract 5.4 (CONTRACT-GAP: CG-014)."""

    model_config = ConfigDict(extra="forbid")

    cargo_type: CargoType | None = None
    container_size_ft: Literal[20, 40] | None = None
    hs_code: HS_CODE | None = None
    weight_kg: Annotated[Decimal, Field(gt=0, le=WEIGHT_KG_MAX)] | None = None
    declared_value: Annotated[Decimal, Field(ge=0, le=DECLARED_VALUE_MAX)] | None = None
    shipping_line: ShippingLine | None = None
    vessel_size_band: VesselSizeBand | None = None
    expected_arrival_at: AwareDatetime | None = None
    documentation_status: DocumentationStatus | None = None


class EventCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    to_status: ShipmentStatus
    occurred_at: AwareDatetime
    note: NOTE | None = None


def latest_prediction_summary(run: PredictionRun | None) -> LatestPredictionSummary | None:
    if run is None:
        return None
    return LatestPredictionSummary(
        prediction_id=run.id,
        created_at=utc_z(run.created_at) or "",
        predicted_dwell_days=float(run.predicted_dwell_days),
        total_estimated_cost=money(run.total_estimated_cost),
        total_is_partial=run.total_is_partial,
        model_version=run.model_version,
        is_demo_data=run.is_demo_data,
    )


def shipment_response(
    shipment: Shipment, latest_prediction: PredictionRun | None
) -> ShipmentResponse:
    return ShipmentResponse(
        id=shipment.id,
        port_id=shipment.port_id,
        reference=shipment.reference,
        direction=shipment.direction,
        cargo_type=shipment.cargo_type,
        container_size_ft=shipment.container_size_ft,  # type: ignore[arg-type]
        hs_code=shipment.hs_code,
        weight_kg=float(shipment.weight_kg),
        declared_value=money(shipment.declared_value) or "0.00",
        currency=shipment.currency,
        shipping_line=shipment.shipping_line,
        vessel_size_band=shipment.vessel_size_band,
        expected_arrival_at=utc_z(shipment.expected_arrival_at) or "",
        documentation_status=shipment.documentation_status,
        status=shipment.status,
        actual_arrival_at=utc_z(shipment.actual_arrival_at),
        actual_cleared_at=utc_z(shipment.actual_cleared_at),
        actual_dwell_days=dwell_days(shipment.actual_arrival_at, shipment.actual_cleared_at),
        created_at=utc_z(shipment.created_at) or "",
        updated_at=utc_z(shipment.updated_at) or "",
        latest_prediction=latest_prediction_summary(latest_prediction),
    )


def event_response(event: ShipmentEvent, actor_display_name: str | None) -> ShipmentEventResponse:
    return ShipmentEventResponse(
        id=event.id,
        shipment_id=event.shipment_id,
        event_type=event.event_type,
        from_status=event.from_status,
        to_status=event.to_status,
        occurred_at=utc_z(event.occurred_at) or "",
        recorded_at=utc_z(event.recorded_at) or "",
        actor_display_name=actor_display_name,
        note=event.note,
    )


def shipment_detail_response(
    shipment: Shipment,
    latest_prediction: PredictionRun | None,
    events: list[tuple[ShipmentEvent, str | None]],
) -> ShipmentDetailResponse:
    base = shipment_response(shipment, latest_prediction)
    return ShipmentDetailResponse(
        **base.model_dump(),
        events=[event_response(event, name) for event, name in events],
    )
