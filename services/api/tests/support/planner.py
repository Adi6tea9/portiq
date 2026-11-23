"""Shared helpers for the load-planner tests (CG-022)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.repositories import shipments as shipments_repo

IMPORTER = "importer@portiq.demo"
IMPORTER2 = "importer2@portiq.demo"
OPERATOR = "operator@portiq.demo"  # INMUN
OPERATOR2 = "operator2@portiq.demo"  # INNSA
ADMIN = "admin@portiq.demo"

SHARED_OWN = "DEMO-2026-001"  # importer@, shared, INNSA, shares a container with DEMO-2026-013
SHARED_OTHER = "DEMO-2026-013"  # importer2@
FULL = "DEMO-2026-002"  # importer@, full, INMUN, 20 ft
ARRIVED = "DEMO-2026-008"  # importer@, arrived


def bearer(email: str) -> dict[str, str]:
    return {"Authorization": f"Bearer dev:{email}"}


def shipment_id(session: Session, reference: str) -> str:
    shipment = shipments_repo.get_by_reference(session, reference)
    assert shipment is not None
    return str(shipment.id)


def cargo_line(**overrides: Any) -> dict[str, Any]:
    line: dict[str, Any] = {
        "name": "Carton A",
        "category": "box",
        "length_cm": 60,
        "width_cm": 40,
        "height_cm": 40,
        "weight_kg": 12.5,
        "quantity": 2,
        "stackable": True,
    }
    line.update(overrides)
    return line
