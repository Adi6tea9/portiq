from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func

from app.core.config import MAX_FORECAST_RANGE_DAYS
from app.core.deps import DbSession, require_role
from app.core.errors import AppError, request_id_of
from app.models.tables import Profile, Shipment
from app.repositories import capacity as capacity_repo
from app.repositories import operator_ports as operator_ports_repo
from app.repositories import shipments as shipments_repo
from app.schemas.capacity import bucket_payload
from app.schemas.enums import ResourceType, Role, ShipmentStatus, WarningCode
from app.schemas.envelope import ErrorDetail, Pagination, envelope
from app.schemas.shipments import shipment_response
from app.services import at_risk

router = APIRouter(prefix="/operator", tags=["operator"])

Operator = Annotated[Profile, Depends(require_role(Role.PORT_OPERATOR))]
# Section 7: /operator/* is scoped for operators and covers every port for the admin.
OperatorOrAdmin = Annotated[
    Profile, Depends(require_role(Role.PORT_OPERATOR, Role.PLATFORM_ADMIN))
]

DEFAULT_OVERVIEW_DAYS = 14


def _invalid(field: str, issue: str) -> AppError:
    return AppError(
        422, "VALIDATION_ERROR", "Validation failed", [ErrorDetail(field=field, issue=issue)]
    )


def _midnight(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=UTC)


def _as_utc(moment: datetime) -> datetime:
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


@router.get("/dashboard/summary")
def read_operator_summary(
    request: Request,
    session: DbSession,
    user: Operator
) -> dict[str, Any]:
    """Returns aggregated metrics for the ports assigned to this operator."""
    port_ids = operator_ports_repo.list_port_ids(session, user.id)

    # Query shipments arriving at these assigned ports
    counts = session.query(
        Shipment.status, func.count(Shipment.id)
    ).filter(
        Shipment.port_id.in_(port_ids)
    ).group_by(Shipment.status).all()

    status_counts = {status.value: 0 for status in ShipmentStatus}
    total = 0
    for status, count in counts:
        # Handle SQLAlchemy enum objects safely
        status_key = status.value if hasattr(status, 'value') else status
        status_counts[status_key] = count
        total += count

    return envelope({
        "total_incoming": total,
        "status_counts": status_counts,
        "assigned_ports": [str(pid) for pid in port_ids]
    }, request_id_of(request))


@router.get("/overview")
def read_operator_overview(
    request: Request,
    session: DbSession,
    user: OperatorOrAdmin,
    from_date: Annotated[date | None, Query(alias="from")] = None,
    to_date: Annotated[date | None, Query(alias="to")] = None,
    port_id: UUID | None = None,
) -> dict[str, Any]:
    """KPIs for shipments expected in [from, to) at the ports in scope (section 14)."""
    start_day = from_date or datetime.now(UTC).date()
    end_day = to_date or start_day + timedelta(days=DEFAULT_OVERVIEW_DAYS)
    if end_day <= start_day:
        raise _invalid("to", "must be after from")
    if (end_day - start_day).days > MAX_FORECAST_RANGE_DAYS:
        raise _invalid("to", f"range cannot exceed {MAX_FORECAST_RANGE_DAYS} days")

    ports = at_risk.scope_ports(session, user)
    port_ids = [port.id for port in ports]
    if port_id is not None and port_id not in port_ids:
        raise AppError(404, "NOT_FOUND", "Not found")
    selected = port_id or (port_ids[0] if port_ids else None)

    start, end = _midnight(start_day), _midnight(end_day)
    shipments = shipments_repo.list_matching(
        session, port_ids=port_ids, arrival_from=start, arrival_to=end
    )
    latest = shipments_repo.latest_predictions(session, [shipment.id for shipment in shipments])
    yard = at_risk.yard_series(session, shipments, latest)

    status_counts = {status.value: 0 for status in ShipmentStatus}
    at_risk_items: list[dict[str, Any]] = []
    for shipment in shipments:
        status_counts[shipment.status.value] += 1
        reasons = at_risk.at_risk_reasons(shipment, latest.get(shipment.id), yard)
        if reasons:
            at_risk_items.append(
                {
                    "shipment_id": str(shipment.id),
                    "reference": shipment.reference,
                    "reasons": reasons,
                }
            )

    def utilization(resource_type: ResourceType) -> list[dict[str, Any]]:
        if selected is None:
            return []
        rows = capacity_repo.list_buckets(
            session, port_ids=[selected], resource_type=resource_type, start=start, end=end
        )
        return [bucket_payload(row) for row in rows]

    data = {
        "port_scope": [{"id": str(port.id), "name": port.name} for port in ports],
        "range": {"from": start_day.isoformat(), "to": end_day.isoformat()},
        "status_counts": status_counts,
        "utilization": {
            "yard": utilization(ResourceType.YARD),
            "berth": utilization(ResourceType.BERTH),
        },
        "at_risk_count": len(at_risk_items),
        "at_risk": at_risk_items,
        "dwell_distribution": at_risk.dwell_distribution(
            float(run.predicted_dwell_days) for run in latest.values()
        ),
    }
    return envelope(data, request_id_of(request))


@router.get("/shipments")
def list_operator_shipments(
    request: Request,
    session: DbSession,
    user: OperatorOrAdmin,
    status: ShipmentStatus | None = None,
    arrival_from: datetime | None = None,
    arrival_to: datetime | None = None,
    min_predicted_dwell_days: Annotated[float | None, Query(ge=0)] = None,
    warning_code: WarningCode | None = None,
    is_at_risk: Annotated[bool | None, Query(alias="at_risk")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> dict[str, Any]:
    """Shipments in scope with their at-risk reasons and latest warning codes (section 14).

    ``arrival_to`` is inclusive, matching the end-of-day timestamp the frontend sends.
    """
    if arrival_from and arrival_to and _as_utc(arrival_to) < _as_utc(arrival_from):
        raise _invalid("arrival_to", "must be on or after arrival_from")

    port_ids = [port.id for port in at_risk.scope_ports(session, user)]
    shipments = shipments_repo.list_matching(
        session,
        port_ids=port_ids,
        status=status,
        arrival_from=_as_utc(arrival_from) if arrival_from else None,
        arrival_to=_as_utc(arrival_to) + timedelta(microseconds=1) if arrival_to else None,
    )
    latest = shipments_repo.latest_predictions(session, [shipment.id for shipment in shipments])
    yard = at_risk.yard_series(session, shipments, latest)

    # shortcut: the dwell, warning and at-risk filters run in Python over the SQL-filtered
    # set, which is fine for thousands of shipments; push them into SQL if the table grows.
    rows: list[dict[str, Any]] = []
    for shipment in shipments:
        run = latest.get(shipment.id)
        reasons = at_risk.at_risk_reasons(shipment, run, yard)
        codes = at_risk.warning_codes(run)
        if min_predicted_dwell_days is not None and (
            run is None or float(run.predicted_dwell_days) < min_predicted_dwell_days
        ):
            continue
        if warning_code is not None and warning_code.value not in codes:
            continue
        if is_at_risk is not None and bool(reasons) != is_at_risk:
            continue
        rows.append(
            {
                "shipment": shipment_response(shipment, run).model_dump(mode="json"),
                "at_risk_reasons": reasons,
                "warning_codes": codes,
            }
        )

    offset = (page - 1) * page_size
    return envelope(
        rows[offset : offset + page_size],
        request_id_of(request),
        Pagination(page=page, page_size=page_size, total=len(rows)),
    )
