"""Admin endpoints: tariff rules and the audit trail (backend spec sections 8 and 12)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import and_, func, or_, select

from app.core.deps import DbSession, require_role
from app.core.errors import AppError, error_response, request_id_of
from app.models.tables import AuditLog, Profile, TariffRule
from app.repositories import audit_logs as audit_logs_repo
from app.repositories import ports as ports_repo
from app.schemas.admin import TariffRuleCreate, TariffRulePatch
from app.schemas.enums import Role, RuleType, ShippingLine
from app.schemas.envelope import ErrorDetail, Pagination, envelope
from app.schemas.shipments import utc_z

router = APIRouter(prefix="/admin", tags=["admin"])

Admin = Annotated[Profile, Depends(require_role(Role.PLATFORM_ADMIN))]
Page = Annotated[int, Query(ge=1)]
PageSize = Annotated[int, Query(ge=1, le=100)]

_CENT = Decimal("0.01")


def _rate(value: Decimal) -> str:
    """Two decimals like the contract's money strings, unless the rate needs more precision."""
    return f"{value:.2f}" if value == value.quantize(_CENT) else str(value.normalize())


def tariff_payload(rule: TariffRule) -> dict[str, Any]:
    """One rule as the contract ``TariffRule``."""
    return {
        "id": str(rule.id),
        "rule_type": rule.rule_type.value,
        "port_id": str(rule.port_id) if rule.port_id else None,
        "hs_code_prefix": rule.hs_code_prefix,
        "shipping_line": rule.shipping_line.value if rule.shipping_line else None,
        "cargo_type": rule.cargo_type.value if rule.cargo_type else None,
        "container_size_ft": rule.container_size_ft,
        "rate_type": rule.rate_type.value,
        "rate_value": _rate(rule.rate_value),
        "currency": rule.currency.value,
        "free_days": rule.free_days,
        "tier_config": rule.tier_config,
        "valid_from": rule.valid_from.isoformat(),
        "valid_to": rule.valid_to.isoformat() if rule.valid_to else None,
        "source_note": rule.source_note,
        "version": rule.version,
        "is_active": rule.is_active,
    }


@router.get("/tariffs")
def list_tariffs(
    request: Request,
    session: DbSession,
    _admin: Admin,
    rule_type: RuleType | None = None,
    port_id: UUID | None = None,
    hs_code_prefix: str | None = None,
    shipping_line: ShippingLine | None = None,
    is_active: bool | None = None,
    valid_on: date | None = None,
    page: Page = 1,
    page_size: PageSize = 20,
) -> dict[str, Any]:
    """Every filter from spec section 12; ``valid_on`` keeps rules valid that day (inclusive)."""
    conditions: list[Any] = []
    if rule_type is not None:
        conditions.append(TariffRule.rule_type == rule_type)
    if port_id is not None:
        conditions.append(TariffRule.port_id == port_id)
    if hs_code_prefix:
        conditions.append(TariffRule.hs_code_prefix == hs_code_prefix)
    if shipping_line is not None:
        conditions.append(TariffRule.shipping_line == shipping_line)
    if is_active is not None:
        conditions.append(TariffRule.is_active.is_(is_active))
    if valid_on is not None:
        conditions.append(TariffRule.valid_from <= valid_on)
        conditions.append(or_(TariffRule.valid_to.is_(None), TariffRule.valid_to >= valid_on))

    total = session.scalar(select(func.count()).select_from(TariffRule).where(*conditions)) or 0
    rules = session.scalars(
        select(TariffRule)
        .where(*conditions)
        .order_by(TariffRule.created_at.desc(), TariffRule.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return envelope(
        [tariff_payload(rule) for rule in rules],
        request_id_of(request),
        Pagination(page=page, page_size=page_size, total=total),
    )


@router.post("/tariffs", status_code=201, response_model=None)
def create_tariff(
    request: Request,
    payload: TariffRuleCreate,
    session: DbSession,
    admin: Admin,
) -> dict[str, Any] | JSONResponse:
    """New rule version; 409 ``TARIFF_CONFLICT`` if an active same-scope rule overlaps."""
    if payload.port_id is not None and ports_repo.get_by_id(session, payload.port_id) is None:
        raise AppError(
            422,
            "VALIDATION_ERROR",
            "Validation failed",
            [ErrorDetail(field="port_id", issue="unknown port")],
        )

    rule_type = RuleType(payload.rule_type.value)
    shipping_line = payload.shipping_line
    scope = [
        TariffRule.is_active.is_(True),
        TariffRule.rule_type == rule_type,
        _same(TariffRule.port_id, payload.port_id),
        _same(TariffRule.hs_code_prefix, payload.hs_code_prefix),
        _same(TariffRule.shipping_line, shipping_line),
        _same(TariffRule.cargo_type, payload.cargo_type),
        _same(TariffRule.container_size_ft, payload.container_size_ft),
        # Validity overlap: existing [from, to] meets the new [from, to]; null `to` is open-ended.
        or_(TariffRule.valid_to.is_(None), TariffRule.valid_to >= payload.valid_from),
    ]
    if payload.valid_to is not None:
        scope.append(TariffRule.valid_from <= payload.valid_to)

    conflict = session.scalars(select(TariffRule).where(and_(*scope))).first()
    request_id = request_id_of(request)
    if conflict is not None:
        request.state.error_code = "TARIFF_CONFLICT"
        return error_response(
            request_id,
            409,
            "TARIFF_CONFLICT",
            "An active rule with the same scope overlaps these dates.",
            [ErrorDetail(field="rule", issue=str(conflict.id))],
            extra={"conflicting_rule": tariff_payload(conflict)},
        )

    rule = TariffRule(
        rule_type=rule_type,
        port_id=payload.port_id,
        hs_code_prefix=payload.hs_code_prefix,
        shipping_line=shipping_line,
        cargo_type=payload.cargo_type,
        container_size_ft=payload.container_size_ft,
        rate_type=payload.rate_type,
        rate_value=Decimal(payload.rate_value),
        currency=payload.currency,
        free_days=payload.free_days,
        tier_config=payload.tier_config,
        valid_from=payload.valid_from,
        valid_to=payload.valid_to,
        source_note=payload.source_note,
        version=payload.version,
        is_active=True,
        created_by=admin.id,
    )
    session.add(rule)
    session.flush()
    audit_logs_repo.add(
        session,
        actor_user_id=admin.id,
        action="create",
        entity_type="tariff_rule",
        entity_id=rule.id,
        before=None,
        after=tariff_payload(rule),
        request_id=request_id,
    )
    return envelope(tariff_payload(rule), request_id)


@router.patch("/tariffs/{rule_id}")
def deactivate_tariff(
    request: Request,
    rule_id: UUID,
    payload: TariffRulePatch,
    session: DbSession,
    admin: Admin,
) -> dict[str, Any]:
    """``{"is_active": false}`` only; rules are never deleted."""
    rule = session.get(TariffRule, rule_id)
    if rule is None:
        raise AppError(404, "NOT_FOUND", "Not found")

    before = {"is_active": rule.is_active}
    rule.is_active = payload.is_active
    session.flush()
    audit_logs_repo.add(
        session,
        actor_user_id=admin.id,
        action="deactivate",
        entity_type="tariff_rule",
        entity_id=rule.id,
        before=before,
        after={"is_active": rule.is_active},
        request_id=request_id_of(request),
    )
    return envelope(tariff_payload(rule), request_id_of(request))


def _same(column: Any, value: Any) -> Any:
    """Scope equality where both null counts as the same scope."""
    return column.is_(None) if value is None else column == value


@router.get("/audit-logs")
def list_audit_logs(
    request: Request,
    session: DbSession,
    _admin: Admin,
    page: Page = 1,
    page_size: PageSize = 20,
) -> dict[str, Any]:
    """Append-only audit trail, newest first (backend spec section 8)."""
    total = session.scalar(select(func.count()).select_from(AuditLog)) or 0
    rows = session.execute(
        # Accounts from Supabase sign-up have no display name; admins still need to see who acted.
        select(AuditLog, func.coalesce(Profile.display_name, Profile.email))
        .outerjoin(Profile, Profile.id == AuditLog.actor_user_id)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    data = [
        {
            "id": str(log.id),
            "actor_display_name": display_name,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": str(log.entity_id),
            "before": log.before,
            "after": log.after,
            "created_at": utc_z(log.created_at),
            "request_id": log.request_id,
        }
        for log, display_name in rows
    ]
    return envelope(
        data, request_id_of(request), Pagination(page=page, page_size=page_size, total=total)
    )
