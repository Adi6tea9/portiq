"""Operator port scope (who may see and operate on which port)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import OperatorPort


def list_port_ids(session: Session, user_id: UUID) -> list[UUID]:
    return list(
        session.scalars(select(OperatorPort.port_id).where(OperatorPort.user_id == user_id))
    )


def assign(session: Session, *, user_id: UUID, port_id: UUID) -> OperatorPort:
    link = OperatorPort(user_id=user_id, port_id=port_id)
    session.add(link)
    session.flush()
    return link
