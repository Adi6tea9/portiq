"""Tariff rule reads and writes. Rules are never deleted, only deactivated."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import TariffRule
from app.schemas.enums import Currency, RateType, RuleType


def get_by_id(session: Session, rule_id: UUID) -> TariffRule | None:
    return session.get(TariffRule, rule_id)


def list_all(session: Session) -> list[TariffRule]:
    return list(
        session.scalars(select(TariffRule).order_by(TariffRule.rule_type, TariffRule.valid_from))
    )


def create(
    session: Session,
    *,
    rule_type: RuleType,
    rate_type: RateType,
    rate_value: Decimal,
    currency: Currency,
    valid_from: date,
    source_note: str,
    version: str,
    port_id: UUID | None = None,
    hs_code_prefix: str | None = None,
    shipping_line: Any = None,
    cargo_type: Any = None,
    container_size_ft: int | None = None,
    free_days: int | None = None,
    tier_config: dict[str, Any] | None = None,
    valid_to: date | None = None,
    is_active: bool = True,
    created_by: UUID | None = None,
    rule_id: UUID | None = None,
) -> TariffRule:
    rule = TariffRule(
        id=rule_id,
        rule_type=rule_type,
        rate_type=rate_type,
        rate_value=rate_value,
        currency=currency,
        valid_from=valid_from,
        valid_to=valid_to,
        source_note=source_note,
        version=version,
        port_id=port_id,
        hs_code_prefix=hs_code_prefix,
        shipping_line=shipping_line,
        cargo_type=cargo_type,
        container_size_ft=container_size_ft,
        free_days=free_days,
        tier_config=tier_config,
        is_active=is_active,
        created_by=created_by,
    )
    session.add(rule)
    session.flush()
    return rule
