"""Cargo lines and shared containers (CG-022). Authorization lives in the API layer."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date
from uuid import UUID

from sqlalchemy import ColumnElement, exists, func, select, text
from sqlalchemy.orm import Session

from app.models import CargoItem, SharedContainer, Shipment
from app.schemas.enums import Direction


@dataclass(frozen=True)
class GroupKey:
    """Shared shipments with the same key share containers."""

    port_id: UUID
    direction: Direction
    container_size_ft: int
    arrival_date: date

    @classmethod
    def of(cls, shipment: Shipment) -> GroupKey:
        return cls(
            shipment.port_id,
            Direction(shipment.direction),
            shipment.container_size_ft,
            shipment.expected_arrival_at.astimezone(UTC).date(),
        )

    def matches(self, container: SharedContainer) -> bool:
        return self == GroupKey(
            container.port_id,
            Direction(container.direction),
            container.container_size_ft,
            container.arrival_date,
        )

    def conditions(self) -> tuple[ColumnElement[bool], ...]:
        return (
            SharedContainer.port_id == self.port_id,
            SharedContainer.direction == self.direction,
            SharedContainer.container_size_ft == self.container_size_ft,
            SharedContainer.arrival_date == self.arrival_date,
        )


_ORDER = (CargoItem.created_at, CargoItem.id)


def has_cargo(session: Session, shipment_id: UUID) -> bool:
    return bool(session.scalar(select(exists().where(CargoItem.shipment_id == shipment_id))))


def list_for_shipment(session: Session, shipment_id: UUID) -> list[CargoItem]:
    stmt = select(CargoItem).where(CargoItem.shipment_id == shipment_id).order_by(*_ORDER)
    return list(session.scalars(stmt))


def list_in_container(session: Session, container_id: UUID) -> list[CargoItem]:
    stmt = select(CargoItem).where(CargoItem.container_id == container_id).order_by(*_ORDER)
    return list(session.scalars(stmt))


def get_item(session: Session, shipment_id: UUID, item_id: UUID) -> CargoItem | None:
    item = session.get(CargoItem, item_id)
    return item if item is not None and item.shipment_id == shipment_id else None


def lock_shipment(session: Session, shipment_id: UUID) -> Shipment | None:
    stmt = select(Shipment).where(Shipment.id == shipment_id).with_for_update()
    return session.scalar(stmt.execution_options(populate_existing=True))


def lock_container(session: Session, container_id: UUID) -> SharedContainer | None:
    stmt = select(SharedContainer).where(SharedContainer.id == container_id).with_for_update()
    return session.scalar(stmt.execution_options(populate_existing=True))


def lock_group(session: Session, key: GroupKey) -> None:
    """Serialises container creation within a group until the transaction ends."""
    label = f"shared:{key.port_id}:{key.direction}:{key.container_size_ft}:{key.arrival_date}"
    session.execute(text("SELECT pg_advisory_xact_lock(hashtext(:label))"), {"label": label})


def list_group(session: Session, key: GroupKey) -> list[SharedContainer]:
    stmt = select(SharedContainer).where(*key.conditions()).order_by(SharedContainer.sequence)
    return list(session.scalars(stmt))


def create_container(
    session: Session, key: GroupKey, container_id: UUID | None = None
) -> SharedContainer:
    """Opens the next container of the group; call ``lock_group`` first."""
    last = session.scalar(select(func.max(SharedContainer.sequence)).where(*key.conditions())) or 0
    container = SharedContainer(
        id=container_id,
        port_id=key.port_id,
        direction=key.direction,
        container_size_ft=key.container_size_ft,
        arrival_date=key.arrival_date,
        sequence=last + 1,
    )
    session.add(container)
    session.flush()
    return container


def containers_of_shipment(session: Session, shipment_id: UUID) -> list[SharedContainer]:
    ids = select(CargoItem.container_id).where(CargoItem.shipment_id == shipment_id)
    stmt = (
        select(SharedContainer)
        .where(SharedContainer.id.in_(ids))
        .order_by(SharedContainer.sequence)
    )
    return list(session.scalars(stmt))


def items_in_containers(session: Session, container_ids: Sequence[UUID]) -> list[CargoItem]:
    if not container_ids:
        return []
    stmt = select(CargoItem).where(CargoItem.container_id.in_(container_ids)).order_by(*_ORDER)
    return list(session.scalars(stmt))
