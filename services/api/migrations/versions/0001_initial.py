"""Initial schema: every table in backend spec section 6.

Revision ID: 0001_initial
Revises:
Create Date: 2026-11-07
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Postgres enum types, mirroring app/schemas/enums.py exactly.
ENUMS: dict[str, tuple[str, ...]] = {
    "role": ("importer_exporter", "port_operator", "platform_admin"),
    "direction": ("import", "export"),
    "cargo_type": ("general_container", "reefer", "hazardous", "oversized"),
    "shipping_line": ("Line A", "Line B", "Line C", "Line D", "other"),
    "vessel_size_band": ("small", "medium", "large"),
    "documentation_status": ("complete", "incomplete", "unknown"),
    "shipment_status": ("submitted", "arrived", "cleared"),
    "resource_type": ("yard", "berth"),
    "source_type": ("synthetic", "imported"),
    "currency": ("INR",),
    "rule_type": ("customs_duty", "port_storage", "demurrage", "other_charge"),
    "rate_type": ("per_day", "percent_of_value", "flat", "tiered"),
}

TABLES = (
    "profiles",
    "ports",
    "operator_ports",
    "shipments",
    "shipment_events",
    "prediction_runs",
    "capacity_forecasts",
    "tariff_rules",
    "audit_logs",
)


def _enum(name: str) -> postgresql.ENUM:
    return postgresql.ENUM(*ENUMS[name], name=name, create_type=False)


def _uuid_pk() -> sa.Column:
    return sa.Column(
        "id",
        sa.UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )


def _timestamptz(column: str, *, nullable: bool = False) -> sa.Column:
    return sa.Column(
        column, sa.DateTime(timezone=True), nullable=nullable, server_default=sa.text("now()")
    )


def upgrade() -> None:
    bind = op.get_bind()
    for enum_name, values in ENUMS.items():
        postgresql.ENUM(*values, name=enum_name).create(bind, checkfirst=True)

    op.create_table(
        "profiles",
        _uuid_pk(),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("display_name", sa.String(80), nullable=True),
        sa.Column("role", _enum("role"), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        _timestamptz("created_at"),
    )

    op.create_table(
        "ports",
        _uuid_pk(),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("port_code", sa.String(5), nullable=False, unique=True),
        sa.Column("country", sa.String(80), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        _timestamptz("created_at"),
    )

    op.create_table(
        "operator_ports",
        sa.Column(
            "user_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("profiles.id"),
            primary_key=True,
        ),
        sa.Column("port_id", sa.UUID(as_uuid=True), sa.ForeignKey("ports.id"), primary_key=True),
    )

    op.create_table(
        "shipments",
        _uuid_pk(),
        sa.Column(
            "owner_user_id", sa.UUID(as_uuid=True), sa.ForeignKey("profiles.id"), nullable=False
        ),
        sa.Column("port_id", sa.UUID(as_uuid=True), sa.ForeignKey("ports.id"), nullable=False),
        sa.Column("reference", sa.String(64), nullable=False, unique=True),
        sa.Column("direction", _enum("direction"), nullable=False),
        sa.Column("cargo_type", _enum("cargo_type"), nullable=False),
        sa.Column("container_size_ft", sa.SmallInteger(), nullable=False),
        sa.Column("hs_code", sa.CHAR(6), nullable=False),
        sa.Column("weight_kg", sa.Numeric(10, 2), nullable=False),
        sa.Column("declared_value", sa.Numeric(18, 2), nullable=False),
        sa.Column("currency", _enum("currency"), nullable=False),
        sa.Column("shipping_line", _enum("shipping_line"), nullable=False),
        sa.Column("vessel_size_band", _enum("vessel_size_band"), nullable=False),
        sa.Column("expected_arrival_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actual_arrival_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_cleared_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("documentation_status", _enum("documentation_status"), nullable=False),
        sa.Column("status", _enum("shipment_status"), nullable=False),
        _timestamptz("created_at"),
        _timestamptz("updated_at"),
        sa.CheckConstraint("container_size_ft IN (20, 40)", name="ck_shipments_container_size_ft"),
        sa.CheckConstraint("hs_code ~ '^[0-9]{6}$'", name="ck_shipments_hs_code"),
        sa.CheckConstraint("weight_kg > 0 AND weight_kg <= 60000", name="ck_shipments_weight_kg"),
        sa.CheckConstraint(
            "declared_value >= 0 AND declared_value <= 1000000000000",
            name="ck_shipments_declared_value",
        ),
    )
    op.create_index("ix_shipments_owner_created", "shipments", ["owner_user_id", "created_at"])
    op.create_index(
        "ix_shipments_port_status_arrival",
        "shipments",
        ["port_id", "status", "expected_arrival_at"],
    )

    op.create_table(
        "shipment_events",
        _uuid_pk(),
        sa.Column(
            "shipment_id", sa.UUID(as_uuid=True), sa.ForeignKey("shipments.id"), nullable=False
        ),
        sa.Column(
            "actor_user_id", sa.UUID(as_uuid=True), sa.ForeignKey("profiles.id"), nullable=False
        ),
        sa.Column("event_type", sa.String(32), nullable=False),
        sa.Column("from_status", _enum("shipment_status"), nullable=True),
        sa.Column("to_status", _enum("shipment_status"), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        _timestamptz("recorded_at"),
        sa.Column("note", sa.Text(), nullable=True),
    )
    op.create_index(
        "ix_shipment_events_shipment_occurred",
        "shipment_events",
        ["shipment_id", "occurred_at"],
    )

    op.create_table(
        "prediction_runs",
        _uuid_pk(),
        sa.Column(
            "shipment_id", sa.UUID(as_uuid=True), sa.ForeignKey("shipments.id"), nullable=False
        ),
        sa.Column(
            "requested_by", sa.UUID(as_uuid=True), sa.ForeignKey("profiles.id"), nullable=False
        ),
        sa.Column("idempotency_key", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("input_hash", sa.String(64), nullable=False),
        sa.Column("predicted_dwell_days", sa.Numeric(10, 4), nullable=False),
        sa.Column("predicted_clearance_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("currency", _enum("currency"), nullable=False),
        sa.Column("total_estimated_cost", sa.Numeric(18, 2), nullable=True),
        sa.Column("total_is_partial", sa.Boolean(), nullable=False),
        sa.Column("cost_breakdown", postgresql.JSONB(), nullable=False),
        sa.Column("explanation", postgresql.JSONB(), nullable=False),
        sa.Column("capacity_snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("warnings", postgresql.JSONB(), nullable=False),
        sa.Column("input_snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("model_version", sa.String(64), nullable=False),
        sa.Column("dataset_version", sa.String(64), nullable=False),
        sa.Column("tariff_rule_versions", postgresql.JSONB(), nullable=False),
        sa.Column("data_source", _enum("source_type"), nullable=False),
        sa.Column("is_demo_data", sa.Boolean(), nullable=False),
        _timestamptz("created_at"),
        sa.UniqueConstraint(
            "shipment_id", "idempotency_key", name="uq_prediction_runs_shipment_idempotency"
        ),
    )
    op.create_index(
        "ix_prediction_runs_shipment_created", "prediction_runs", ["shipment_id", "created_at"]
    )

    op.create_table(
        "capacity_forecasts",
        _uuid_pk(),
        sa.Column("port_id", sa.UUID(as_uuid=True), sa.ForeignKey("ports.id"), nullable=False),
        sa.Column("resource_type", _enum("resource_type"), nullable=False),
        sa.Column("bucket_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("bucket_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("predicted_occupied", sa.Numeric(12, 3), nullable=False),
        sa.Column("total_capacity", sa.Numeric(12, 3), nullable=False),
        sa.Column("utilization_pct", sa.Numeric(6, 2), nullable=False),
        sa.Column("source_type", _enum("source_type"), nullable=False),
        sa.Column("model_or_rule_version", sa.String(32), nullable=False),
        _timestamptz("generated_at"),
        sa.CheckConstraint("bucket_end > bucket_start", name="ck_capacity_forecasts_bucket_order"),
        sa.UniqueConstraint(
            "port_id",
            "resource_type",
            "bucket_start",
            "model_or_rule_version",
            name="uq_capacity_forecasts_bucket",
        ),
    )
    op.create_index(
        "ix_capacity_forecasts_port_resource_bucket",
        "capacity_forecasts",
        ["port_id", "resource_type", "bucket_start"],
    )

    op.create_table(
        "tariff_rules",
        _uuid_pk(),
        sa.Column("rule_type", _enum("rule_type"), nullable=False),
        sa.Column("port_id", sa.UUID(as_uuid=True), sa.ForeignKey("ports.id"), nullable=True),
        sa.Column("hs_code_prefix", sa.String(6), nullable=True),
        sa.Column("shipping_line", _enum("shipping_line"), nullable=True),
        sa.Column("cargo_type", _enum("cargo_type"), nullable=True),
        sa.Column("container_size_ft", sa.SmallInteger(), nullable=True),
        sa.Column("rate_type", _enum("rate_type"), nullable=False),
        sa.Column("rate_value", sa.Numeric(18, 4), nullable=False),
        sa.Column("currency", _enum("currency"), nullable=False),
        sa.Column("free_days", sa.Integer(), nullable=True),
        sa.Column("tier_config", postgresql.JSONB(), nullable=True),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.Column("source_note", sa.Text(), nullable=False),
        sa.Column("version", sa.String(32), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by", sa.UUID(as_uuid=True), sa.ForeignKey("profiles.id"), nullable=True),
        _timestamptz("created_at"),
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
    )
    op.create_index(
        "ix_tariff_rules_type_validity", "tariff_rules", ["rule_type", "valid_from", "valid_to"]
    )

    op.create_table(
        "audit_logs",
        _uuid_pk(),
        sa.Column(
            "actor_user_id", sa.UUID(as_uuid=True), sa.ForeignKey("profiles.id"), nullable=False
        ),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("entity_type", sa.String(64), nullable=False),
        sa.Column("entity_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("before", postgresql.JSONB(), nullable=True),
        sa.Column("after", postgresql.JSONB(), nullable=True),
        sa.Column("request_id", sa.String(64), nullable=False),
        _timestamptz("created_at"),
    )

    # Backend spec 4.7: RLS on every table, no policies. Direct Supabase access is denied
    # by default; the API connects as the table owner and enforces authorization itself.
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
    for enum_name in ENUMS:
        op.execute(f"DROP TYPE IF EXISTS {enum_name}")
