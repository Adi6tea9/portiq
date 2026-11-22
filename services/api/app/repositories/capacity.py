"""Stored capacity buckets (backend spec section 9)."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CapacityForecast
from app.schemas.enums import ResourceType


def valid_bucket_conditions() -> list[Any]:
    """Section 9 validity: positive capacity and occupancy within 0-120% of it."""
    return [
        CapacityForecast.total_capacity > 0,
        CapacityForecast.predicted_occupied >= 0,
        CapacityForecast.predicted_occupied <= 1.2 * CapacityForecast.total_capacity,
    ]


def list_buckets(
    session: Session,
    *,
    port_ids: Sequence[UUID],
    resource_type: ResourceType,
    start: datetime,
    end: datetime,
) -> list[CapacityForecast]:
    """Valid buckets starting in [start, end), oldest first."""
    if not port_ids:
        return []
    stmt = (
        select(CapacityForecast)
        .where(
            CapacityForecast.port_id.in_(port_ids),
            CapacityForecast.resource_type == resource_type,
            CapacityForecast.bucket_start >= start,
            CapacityForecast.bucket_start < end,
            *valid_bucket_conditions(),
        )
        .order_by(CapacityForecast.bucket_start.asc())
    )
    return list(session.scalars(stmt))
