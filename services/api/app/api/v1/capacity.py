"""``GET /capacity/forecast``: daily yard/berth utilization forecast (backend spec sections 8 and 9)."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Query, Request
from sqlalchemy import and_, func, select

from app.core.deps import CurrentUser, DbSession
from app.core.errors import AppError, request_id_of
from app.models import CapacityForecast
from app.repositories import operator_ports as operator_ports_repo
from app.repositories import ports as ports_repo
from app.schemas.capacity import CapacityBucketResponse
from app.schemas.enums import ResourceType, Role
from app.schemas.envelope import ErrorDetail, Pagination, envelope
from app.schemas.shipments import utc_z

router = APIRouter(prefix="/capacity", tags=["capacity"])

Page = Annotated[int, Query(ge=1)]
PageSize = Annotated[int, Query(ge=1, le=100)]


def _not_found() -> AppError:
    return AppError(404, "NOT_FOUND", "Not found")


def _invalid(field: str, issue: str) -> AppError:
    return AppError(
        422, "VALIDATION_ERROR", "Validation failed", [ErrorDetail(field=field, issue=issue)]
    )


@router.get("/forecast")
def get_capacity_forecast(
    request: Request,
    user: CurrentUser,
    session: DbSession,
    port_id: UUID,
    resource_type: ResourceType,
    from_date: Annotated[date, Query(alias="from")],
    to_date: Annotated[date, Query(alias="to")],
    page: Page = 1,
    page_size: PageSize = 20,
) -> dict[str, Any]:
    # 1. Date range validation (max 31 days per Section 4.3 & Section 8)
    if to_date < from_date:
        raise _invalid("to", "must be on or after from")
    if (to_date - from_date).days > 31:
        raise _invalid("to", "forecast range cannot exceed 31 days")

    # 2. Port existence & role scope check (Section 7 & Section 8)
    port = ports_repo.get_by_id(session, port_id)
    if port is None:
        raise _not_found()

    if user.role is Role.PORT_OPERATOR:
        allowed_port_ids = set(operator_ports_repo.list_port_ids(session, user.id))
        if port_id not in allowed_port_ids:
            raise _not_found()

    # 3. Query valid stored buckets (Section 9 validity rules)
    start_dt = datetime.combine(from_date, time.min, tzinfo=UTC)
    end_dt = datetime.combine(to_date + timedelta(days=1), time.min, tzinfo=UTC)

    filters = and_(
        CapacityForecast.port_id == port_id,
        CapacityForecast.resource_type == resource_type,
        CapacityForecast.bucket_start >= start_dt,
        CapacityForecast.bucket_start < end_dt,
        CapacityForecast.total_capacity > 0,
        CapacityForecast.predicted_occupied >= 0,
        CapacityForecast.predicted_occupied <= 1.2 * CapacityForecast.total_capacity,
    )

    total = session.scalar(select(func.count()).select_from(CapacityForecast).where(filters)) or 0

    offset = (page - 1) * page_size
    rows = session.scalars(
        select(CapacityForecast)
        .where(filters)
        .order_by(CapacityForecast.bucket_start.asc())
        .offset(offset)
        .limit(page_size)
    ).all()

    data = [
        CapacityBucketResponse(
            bucket_start=utc_z(row.bucket_start),
            bucket_end=utc_z(row.bucket_end),
            resource_type=row.resource_type,
            predicted_occupied=round(float(row.predicted_occupied), 2),
            total_capacity=round(float(row.total_capacity), 2),
            utilization_pct=round(float(row.utilization_pct), 2),
            source_type=row.source_type,
            model_or_rule_version=row.model_or_rule_version,
            generated_at=utc_z(row.generated_at),
        ).model_dump(mode="json")
        for row in rows
    ]

    pagination = Pagination(page=page, page_size=page_size, total=total)
    return envelope(data, request_id_of(request), pagination)