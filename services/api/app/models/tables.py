"""SQLAlchemy tables for every table in backend spec section 6.

Enums are Postgres enum types generated from ``app.schemas.enums`` so the database
and the API share one value list. Money is ``Numeric`` (never float).
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.schemas.enums import (
    CargoType,
    Currency,
    Direction,
    DocumentationStatus,
    RateType,
    ResourceType,
    Role,
    RuleType,
    ShipmentStatus,
    ShippingLine,
    SourceType,
    VesselSizeBand,
)

_TS = sa.DateTime(timezone=True)


def _enum(enum_cls: type[StrEnum], name: str) -> sa.Enum:
    """Postgres enum type storing member *values* (``importer_exporter``)."""
    return sa.Enum(
        enum_cls,
        name=name,
        values_callable=lambda members: [member.value for member in members],
        validate_strings=True,
    )


def _uuid_pk() -> Mapped[UUID]:
    return mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )


def _created_at() -> Mapped[datetime]:
    return mapped_column(_TS, nullable=False, server_default=sa.text("now()"))


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[UUID] = _uuid_pk()
    email: Mapped[str] = mapped_column(sa.String(320), nullable=False, unique=True)
    display_name: Mapped[str | None] = mapped_column(sa.String(80))
    role: Mapped[Role] = mapped_column(_enum(Role, "role"), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, server_default=sa.text("true")
    )
    created_at: Mapped[datetime] = _created_at()


class Port(Base):
    __tablename__ = "ports"

    id: Mapped[UUID] = _uuid_pk()
    name: Mapped[str] = mapped_column(sa.String(120), nullable=False)
    port_code: Mapped[str] = mapped_column(sa.String(5), nullable=False, unique=True)
    country: Mapped[str] = mapped_column(sa.String(80), nullable=False)
    timezone: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    created_at: Mapped[datetime] = _created_at()


class OperatorPort(Base):
    __tablename__ = "operator_ports"

    user_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("profiles.id"), primary_key=True
    )
    port_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("ports.id"), primary_key=True
    )


class Shipment(Base):
    __tablename__ = "shipments"
    __table_args__ = (
        sa.CheckConstraint("container_size_ft IN (20, 40)", name="ck_shipments_container_size_ft"),
        sa.CheckConstraint("hs_code ~ '^[0-9]{6}$'", name="ck_shipments_hs_code"),
        sa.CheckConstraint("weight_kg > 0 AND weight_kg <= 60000", name="ck_shipments_weight_kg"),
        sa.CheckConstraint(
            "declared_value >= 0 AND declared_value <= 1000000000000",
            name="ck_shipments_declared_value",
        ),
        sa.Index("ix_shipments_owner_created", "owner_user_id", "created_at"),
        sa.Index("ix_shipments_port_status_arrival", "port_id", "status", "expected_arrival_at"),
    )

    id: Mapped[UUID] = _uuid_pk()
    owner_user_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("profiles.id"), nullable=False
    )
    port_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("ports.id"), nullable=False
    )
    reference: Mapped[str] = mapped_column(sa.String(64), nullable=False, unique=True)
    direction: Mapped[Direction] = mapped_column(_enum(Direction, "direction"), nullable=False)
    cargo_type: Mapped[CargoType] = mapped_column(_enum(CargoType, "cargo_type"), nullable=False)
    container_size_ft: Mapped[int] = mapped_column(sa.SmallInteger, nullable=False)
    hs_code: Mapped[str] = mapped_column(sa.CHAR(6), nullable=False)
    weight_kg: Mapped[Decimal] = mapped_column(sa.Numeric(10, 2), nullable=False)
    declared_value: Mapped[Decimal] = mapped_column(sa.Numeric(18, 2), nullable=False)
    currency: Mapped[Currency] = mapped_column(_enum(Currency, "currency"), nullable=False)
    shipping_line: Mapped[ShippingLine] = mapped_column(
        _enum(ShippingLine, "shipping_line"), nullable=False
    )
    vessel_size_band: Mapped[VesselSizeBand] = mapped_column(
        _enum(VesselSizeBand, "vessel_size_band"), nullable=False
    )
    expected_arrival_at: Mapped[datetime] = mapped_column(_TS, nullable=False)
    actual_arrival_at: Mapped[datetime | None] = mapped_column(_TS)
    actual_cleared_at: Mapped[datetime | None] = mapped_column(_TS)
    documentation_status: Mapped[DocumentationStatus] = mapped_column(
        _enum(DocumentationStatus, "documentation_status"), nullable=False
    )
    status: Mapped[ShipmentStatus] = mapped_column(
        _enum(ShipmentStatus, "shipment_status"), nullable=False
    )
    created_at: Mapped[datetime] = _created_at()
    updated_at: Mapped[datetime] = mapped_column(
        _TS, nullable=False, server_default=sa.text("now()")
    )


class ShipmentEvent(Base):
    """Append-only: the API never updates or deletes these rows (backend spec 5.11)."""

    __tablename__ = "shipment_events"
    __table_args__ = (
        sa.Index("ix_shipment_events_shipment_occurred", "shipment_id", "occurred_at"),
    )

    id: Mapped[UUID] = _uuid_pk()
    shipment_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("shipments.id"), nullable=False
    )
    actor_user_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("profiles.id"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    from_status: Mapped[ShipmentStatus | None] = mapped_column(
        _enum(ShipmentStatus, "shipment_status")
    )
    to_status: Mapped[ShipmentStatus] = mapped_column(
        _enum(ShipmentStatus, "shipment_status"), nullable=False
    )
    occurred_at: Mapped[datetime] = mapped_column(_TS, nullable=False)
    recorded_at: Mapped[datetime] = _created_at()
    note: Mapped[str | None] = mapped_column(sa.Text)


class PredictionRun(Base):
    """Immutable prediction snapshot (backend spec 5.11)."""

    __tablename__ = "prediction_runs"
    __table_args__ = (
        sa.UniqueConstraint(
            "shipment_id", "idempotency_key", name="uq_prediction_runs_shipment_idempotency"
        ),
        sa.Index("ix_prediction_runs_shipment_created", "shipment_id", "created_at"),
    )

    id: Mapped[UUID] = _uuid_pk()
    shipment_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("shipments.id"), nullable=False
    )
    requested_by: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("profiles.id"), nullable=False
    )
    idempotency_key: Mapped[UUID] = mapped_column(sa.UUID(as_uuid=True), nullable=False)
    input_hash: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    predicted_dwell_days: Mapped[Decimal] = mapped_column(sa.Numeric(10, 4), nullable=False)
    predicted_clearance_at: Mapped[datetime] = mapped_column(_TS, nullable=False)
    currency: Mapped[Currency] = mapped_column(_enum(Currency, "currency"), nullable=False)
    total_estimated_cost: Mapped[Decimal | None] = mapped_column(sa.Numeric(18, 2))
    total_is_partial: Mapped[bool] = mapped_column(sa.Boolean, nullable=False)
    cost_breakdown: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    explanation: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    capacity_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    warnings: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)
    input_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    model_version: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    dataset_version: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    tariff_rule_versions: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    data_source: Mapped[SourceType] = mapped_column(
        _enum(SourceType, "source_type"), nullable=False
    )
    is_demo_data: Mapped[bool] = mapped_column(sa.Boolean, nullable=False)
    created_at: Mapped[datetime] = _created_at()


class CapacityForecast(Base):
    __tablename__ = "capacity_forecasts"
    __table_args__ = (
        sa.UniqueConstraint(
            "port_id",
            "resource_type",
            "bucket_start",
            "model_or_rule_version",
            name="uq_capacity_forecasts_bucket",
        ),
        sa.CheckConstraint("bucket_end > bucket_start", name="ck_capacity_forecasts_bucket_order"),
        sa.Index(
            "ix_capacity_forecasts_port_resource_bucket",
            "port_id",
            "resource_type",
            "bucket_start",
        ),
    )

    id: Mapped[UUID] = _uuid_pk()
    port_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("ports.id"), nullable=False
    )
    resource_type: Mapped[ResourceType] = mapped_column(
        _enum(ResourceType, "resource_type"), nullable=False
    )
    bucket_start: Mapped[datetime] = mapped_column(_TS, nullable=False)
    bucket_end: Mapped[datetime] = mapped_column(_TS, nullable=False)
    predicted_occupied: Mapped[Decimal] = mapped_column(sa.Numeric(12, 3), nullable=False)
    total_capacity: Mapped[Decimal] = mapped_column(sa.Numeric(12, 3), nullable=False)
    utilization_pct: Mapped[Decimal] = mapped_column(sa.Numeric(6, 2), nullable=False)
    source_type: Mapped[SourceType] = mapped_column(
        _enum(SourceType, "source_type"), nullable=False
    )
    model_or_rule_version: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    generated_at: Mapped[datetime] = _created_at()


class TariffRule(Base):
    """Never deleted; deactivation sets ``is_active`` false (backend spec section 12)."""

    __tablename__ = "tariff_rules"
    __table_args__ = (
        sa.CheckConstraint(
            "valid_to IS NULL OR valid_to > valid_from", name="ck_tariff_rules_validity"
        ),
        sa.CheckConstraint("rate_value >= 0", name="ck_tariff_rules_rate_value"),
        sa.CheckConstraint(
            "container_size_ft IS NULL OR container_size_ft IN (20, 40)",
            name="ck_tariff_rules_container_size_ft",
        ),
        sa.CheckConstraint(
            "hs_code_prefix IS NULL OR hs_code_prefix ~ '^[0-9]{1,6}$'",
            name="ck_tariff_rules_hs_code_prefix",
        ),
        sa.Index("ix_tariff_rules_type_validity", "rule_type", "valid_from", "valid_to"),
    )

    id: Mapped[UUID] = _uuid_pk()
    rule_type: Mapped[RuleType] = mapped_column(_enum(RuleType, "rule_type"), nullable=False)
    port_id: Mapped[UUID | None] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("ports.id"))
    hs_code_prefix: Mapped[str | None] = mapped_column(sa.String(6))
    shipping_line: Mapped[ShippingLine | None] = mapped_column(_enum(ShippingLine, "shipping_line"))
    cargo_type: Mapped[CargoType | None] = mapped_column(_enum(CargoType, "cargo_type"))
    container_size_ft: Mapped[int | None] = mapped_column(sa.SmallInteger)
    rate_type: Mapped[RateType] = mapped_column(_enum(RateType, "rate_type"), nullable=False)
    rate_value: Mapped[Decimal] = mapped_column(sa.Numeric(18, 4), nullable=False)
    currency: Mapped[Currency] = mapped_column(_enum(Currency, "currency"), nullable=False)
    free_days: Mapped[int | None] = mapped_column(sa.Integer)
    tier_config: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    valid_from: Mapped[date] = mapped_column(sa.Date, nullable=False)
    valid_to: Mapped[date | None] = mapped_column(sa.Date)
    source_note: Mapped[str] = mapped_column(sa.Text, nullable=False)
    version: Mapped[str] = mapped_column(sa.String(32), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, server_default=sa.text("true")
    )
    created_by: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("profiles.id")
    )
    created_at: Mapped[datetime] = _created_at()


class AuditLog(Base):
    """Append-only (backend spec 5.11)."""

    __tablename__ = "audit_logs"

    id: Mapped[UUID] = _uuid_pk()
    actor_user_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True), sa.ForeignKey("profiles.id"), nullable=False
    )
    action: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    entity_type: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    entity_id: Mapped[UUID] = mapped_column(sa.UUID(as_uuid=True), nullable=False)
    before: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    after: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    request_id: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    created_at: Mapped[datetime] = _created_at()
