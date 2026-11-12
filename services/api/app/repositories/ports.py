"""Port reads and writes."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Port


def list_all(session: Session) -> list[Port]:
    return list(session.scalars(select(Port).order_by(Port.port_code)))


def get_by_id(session: Session, port_id: UUID) -> Port | None:
    return session.get(Port, port_id)


def get_by_code(session: Session, port_code: str) -> Port | None:
    return session.scalar(select(Port).where(Port.port_code == port_code))


def create(
    session: Session,
    *,
    name: str,
    port_code: str,
    country: str,
    timezone: str,
    port_id: UUID | None = None,
) -> Port:
    port = Port(id=port_id, name=name, port_code=port_code, country=country, timezone=timezone)
    session.add(port)
    session.flush()
    return port
