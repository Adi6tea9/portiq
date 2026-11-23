"""Load planner: shipments.booking_type and cargo_version, shared_containers, cargo_items (CG-022).

Existing shipments become full bookings with no cargo.

Revision ID: 0003_load_planner
Revises: 0002_shipment_model_inputs
Create Date: 2026-11-24
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_load_planner"
down_revision: str | None = "0002_shipment_model_inputs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Mirrors app/schemas/enums.py.
BOOKING_TYPES = ("full", "shared")
CARGO_CATEGORIES = ("box", "crate", "pallet", "drum", "fragile")

_UUID = sa.UUID(as_uuid=True)
_TS = sa.DateTime(timezone=True)


def _pk() -> sa.Column[Any]:
    return sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()"))


def upgrade() -> None:
    bind = op.get_bind()
    postgresql.ENUM(*BOOKING_TYPES, name="booking_type").create(bind, checkfirst=True)
    postgresql.ENUM(*CARGO_CATEGORIES, name="cargo_category").create(bind, checkfirst=True)

    op.add_column(
        "shipments",
        sa.Column(
            "booking_type",
            postgresql.ENUM(*BOOKING_TYPES, name="booking_type", create_type=False),
            nullable=False,
            server_default="full",
        ),
    )
    op.add_column(
        "shipments",
        sa.Column("cargo_version", sa.Integer, nullable=False, server_default=sa.text("1")),
    )

    op.create_table(
        "shared_containers",
        _pk(),
        sa.Column("port_id", _UUID, sa.ForeignKey("ports.id"), nullable=False),
        sa.Column(
            "direction",
            postgresql.ENUM(name="direction", create_type=False),
            nullable=False,
        ),
        sa.Column("container_size_ft", sa.SmallInteger, nullable=False),
        sa.Column("arrival_date", sa.Date, nullable=False),
        sa.Column("sequence", sa.Integer, nullable=False),
        sa.Column("version", sa.Integer, nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", _TS, nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint(
            "port_id",
            "direction",
            "container_size_ft",
            "arrival_date",
            "sequence",
            name="uq_shared_containers_group_sequence",
        ),
    )

    op.create_table(
        "cargo_items",
        _pk(),
        sa.Column(
            "shipment_id",
            _UUID,
            sa.ForeignKey("shipments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("container_id", _UUID, sa.ForeignKey("shared_containers.id")),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column(
            "category",
            postgresql.ENUM(*CARGO_CATEGORIES, name="cargo_category", create_type=False),
            nullable=False,
        ),
        sa.Column("length_cm", sa.Numeric(7, 2), nullable=False),
        sa.Column("width_cm", sa.Numeric(7, 2), nullable=False),
        sa.Column("height_cm", sa.Numeric(7, 2), nullable=False),
        sa.Column("weight_kg", sa.Numeric(9, 2), nullable=False),
        sa.Column("quantity", sa.Integer, nullable=False),
        sa.Column("stackable", sa.Boolean, nullable=False),
        sa.Column("created_at", _TS, nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", _TS, nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_cargo_items_shipment_id", "cargo_items", ["shipment_id"])
    op.create_index("ix_cargo_items_container", "cargo_items", ["container_id"])


def downgrade() -> None:
    op.drop_table("cargo_items")
    op.drop_table("shared_containers")
    op.drop_column("shipments", "cargo_version")
    op.drop_column("shipments", "booking_type")
    bind = op.get_bind()
    postgresql.ENUM(name="cargo_category").drop(bind, checkfirst=True)
    postgresql.ENUM(name="booking_type").drop(bind, checkfirst=True)
