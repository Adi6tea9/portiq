"""Shipment model inputs: customs_channel, importer_type, cargo_priority (CG-021).

Existing rows get the values the API used before ("unknown", "regular", "standard").

Revision ID: 0002_shipment_model_inputs
Revises: 0001_initial
Create Date: 2026-11-23
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_shipment_model_inputs"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# name -> (values, default for existing rows); mirrors app/schemas/enums.py.
COLUMNS: dict[str, tuple[tuple[str, ...], str]] = {
    "customs_channel": (("green", "orange", "red", "unknown"), "unknown"),
    "importer_type": (("AEO", "regular", "new"), "regular"),
    "cargo_priority": (("standard", "expedited", "government"), "standard"),
}


def upgrade() -> None:
    for name, (values, default) in COLUMNS.items():
        enum = postgresql.ENUM(*values, name=name)
        enum.create(op.get_bind(), checkfirst=True)
        op.add_column(
            "shipments",
            sa.Column(
                name,
                postgresql.ENUM(*values, name=name, create_type=False),
                nullable=False,
                server_default=default,
            ),
        )


def downgrade() -> None:
    for name, (values, _default) in COLUMNS.items():
        op.drop_column("shipments", name)
        postgresql.ENUM(*values, name=name).drop(op.get_bind(), checkfirst=True)
