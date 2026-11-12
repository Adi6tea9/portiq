"""Shipment and shipment-event reads and writes.

Authorization lives in the API layer (backend spec 4.7); these helpers only talk to the
database. Events are append-only: there is deliberately no update or delete here.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.orm import Session

from app.models import PredictionRun, Profile, Shipment, ShipmentEvent
from app.schemas.enums import ShipmentStatus


def get_by_id(session: Session, shipment_id: UUID) -> Shipment | None:
    return session.get(Shipment, shipment_id)


def get_by_reference(session: Session, reference: str) -> Shipment | None:
    return session.scalar(select(Shipment).where(Shipment.reference == reference))


def list_events(session: Session, shipment_id: UUID) -> list[tuple[ShipmentEvent, str | None]]:
    """Events in timeline order, paired with the actor's display name."""
    rows = session.execute(
        select(ShipmentEvent, Profile.display_name)
        .outerjoin(Profile, Profile.id == ShipmentEvent.actor_user_id)
        .where(ShipmentEvent.shipment_id == shipment_id)
        .order_by(ShipmentEvent.occurred_at, ShipmentEvent.recorded_at, ShipmentEvent.id)
    )
    return [(event, name) for event, name in rows]


def _filters(
    *,
    owner_user_id: UUID | None,
    port_ids: Sequence[UUID] | None,
    status: ShipmentStatus | None,
    arrival_from: datetime | None,
    arrival_to: datetime | None,
    q: str | None,
) -> list[Any]:
    conditions: list[Any] = []
    if owner_user_id is not None:
        conditions.append(Shipment.owner_user_id == owner_user_id)
    if port_ids is not None:
        conditions.append(Shipment.port_id.in_(port_ids))
    if status is not None:
        conditions.append(Shipment.status == status)
    if arrival_from is not None:
        conditions.append(Shipment.expected_arrival_at >= arrival_from)
    if arrival_to is not None:
        conditions.append(Shipment.expected_arrival_at < arrival_to)
    if q:
        conditions.append(Shipment.reference.ilike(f"%{q}%"))
    return conditions


def list_shipments(
    session: Session,
    *,
    owner_user_id: UUID | None = None,
    port_ids: Sequence[UUID] | None = None,
    status: ShipmentStatus | None = None,
    arrival_from: datetime | None = None,
    arrival_to: datetime | None = None,
    q: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> list[Shipment]:
    stmt = (
        select(Shipment)
        .where(
            *_filters(
                owner_user_id=owner_user_id,
                port_ids=port_ids,
                status=status,
                arrival_from=arrival_from,
                arrival_to=arrival_to,
                q=q,
            )
        )
        .order_by(Shipment.created_at.desc(), Shipment.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return list(session.scalars(stmt))


def count_shipments(
    session: Session,
    *,
    owner_user_id: UUID | None = None,
    port_ids: Sequence[UUID] | None = None,
    status: ShipmentStatus | None = None,
    arrival_from: datetime | None = None,
    arrival_to: datetime | None = None,
    q: str | None = None,
) -> int:
    conditions = _filters(
        owner_user_id=owner_user_id,
        port_ids=port_ids,
        status=status,
        arrival_from=arrival_from,
        arrival_to=arrival_to,
        q=q,
    )
    stmt = select(func.count()).select_from(Shipment).where(*conditions)
    return int(session.scalar(stmt) or 0)


def status_counts_for_owner(session: Session, owner_user_id: UUID) -> dict[ShipmentStatus, int]:
    """Every status present, zero where the owner has none (backend spec 8)."""
    rows = session.execute(
        select(Shipment.status, func.count())
        .where(Shipment.owner_user_id == owner_user_id)
        .group_by(Shipment.status)
    ).all()
    counts = {status: 0 for status in ShipmentStatus}
    for status, count in rows:
        counts[ShipmentStatus(status)] = int(count)
    return counts


def latest_predictions(session: Session, shipment_ids: Sequence[UUID]) -> dict[UUID, PredictionRun]:
    """Newest prediction per shipment (Postgres ``DISTINCT ON``)."""
    if not shipment_ids:
        return {}
    stmt = (
        select(PredictionRun)
        .where(PredictionRun.shipment_id.in_(shipment_ids))
        .ext(distinct_on(PredictionRun.shipment_id))
        .order_by(
            PredictionRun.shipment_id,
            PredictionRun.created_at.desc(),
            PredictionRun.id.desc(),
        )
    )
    return {run.shipment_id: run for run in session.scalars(stmt)}


def create(
    session: Session,
    *,
    owner_user_id: UUID,
    port_id: UUID,
    reference: str,
    direction: Any,
    cargo_type: Any,
    container_size_ft: int,
    hs_code: str,
    weight_kg: Decimal,
    declared_value: Decimal,
    currency: Any,
    shipping_line: Any,
    vessel_size_band: Any,
    expected_arrival_at: datetime,
    documentation_status: Any,
    status: ShipmentStatus,
    actual_arrival_at: datetime | None = None,
    actual_cleared_at: datetime | None = None,
    shipment_id: UUID | None = None,
) -> Shipment:
    shipment = Shipment(
        id=shipment_id,
        owner_user_id=owner_user_id,
        port_id=port_id,
        reference=reference,
        direction=direction,
        cargo_type=cargo_type,
        container_size_ft=container_size_ft,
        hs_code=hs_code,
        weight_kg=weight_kg,
        declared_value=declared_value,
        currency=currency,
        shipping_line=shipping_line,
        vessel_size_band=vessel_size_band,
        expected_arrival_at=expected_arrival_at,
        documentation_status=documentation_status,
        status=status,
        actual_arrival_at=actual_arrival_at,
        actual_cleared_at=actual_cleared_at,
    )
    session.add(shipment)
    session.flush()
    return shipment


def add_event(
    session: Session,
    *,
    shipment_id: UUID,
    actor_user_id: UUID,
    event_type: str,
    from_status: ShipmentStatus | None,
    to_status: ShipmentStatus,
    occurred_at: datetime,
    note: str | None = None,
    event_id: UUID | None = None,
) -> ShipmentEvent:
    event = ShipmentEvent(
        id=event_id,
        shipment_id=shipment_id,
        actor_user_id=actor_user_id,
        event_type=event_type,
        from_status=from_status,
        to_status=to_status,
        occurred_at=occurred_at,
        note=note,
    )
    session.add(event)
    session.flush()
    return event
