"""Builds the privacy-filtered load plan and the per-container versions (CG-022).

Other shipments' parcels leave this module as geometry only unless the viewer sees all
(port operator or admin); that filter is the privacy boundary, so nothing else may build plans.
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import CargoItem, SharedContainer, Shipment
from app.repositories import cargo as cargo_repo
from app.schemas.enums import BookingType, CargoCategory
from app.services.packing import CONTAINERS, ContainerSpec, Line, PackResult, pack

FULL_KEY = "full"


def line_of(item: CargoItem) -> Line:
    return Line(
        key=str(item.id),
        category=CargoCategory(item.category),
        length=float(item.length_cm),
        width=float(item.width_cm),
        height=float(item.height_cm),
        weight=float(item.weight_kg),
        quantity=item.quantity,
        stackable=item.stackable,
    )


def summary(
    spec: ContainerSpec, lines: Sequence[Line], result: PackResult | None = None
) -> dict[str, float]:
    """Volume counts placed units when a packing result is given, every unit otherwise."""
    volume = {line.key: line.unit_volume for line in lines}
    used_cm3 = (
        sum(volume[p.key] for p in result.placements)
        if result is not None
        else sum(line.unit_volume * line.quantity for line in lines)
    )
    weight = sum(line.weight * line.quantity for line in lines)
    return {
        "used_volume_m3": round(used_cm3 / 1e6, 3),
        "remaining_volume_m3": round(max(spec.volume_cm3 - used_cm3, 0) / 1e6, 3),
        "volume_utilization_pct": round(used_cm3 / spec.volume_cm3 * 100, 1),
        "total_weight_kg": round(weight, 2),
        "remaining_payload_kg": round(spec.max_payload_kg - weight, 2),
    }


def _opaque_id(container_key: str, version: int, index: int) -> str:
    digest = hashlib.sha256(f"{container_key}:{version}:{index}".encode()).hexdigest()
    return f"o-{digest[:16]}"


def _container_plan(
    *,
    container_id: UUID | None,
    sequence: int,
    size_ft: int,
    version: int,
    items: Sequence[CargoItem],
    own_shipment_id: UUID,
    viewer_sees_all: bool,
) -> dict[str, Any]:
    spec = CONTAINERS[size_ft]
    lines = [line_of(item) for item in items]
    by_key = {str(item.id): item for item in items}
    result = pack(spec, lines)
    container_key = FULL_KEY if container_id is None else str(container_id)

    parcels = []
    for index, p in enumerate(result.placements):
        item = by_key[p.key]
        own = item.shipment_id == own_shipment_id
        details = None
        if own or viewer_sees_all:
            details = {
                "cargo_item_id": str(item.id),
                "name": item.name,
                "category": CargoCategory(item.category).value,
                "weight_kg": float(item.weight_kg),
                "unit": p.unit,
                "quantity": item.quantity,
                "stackable": item.stackable,
            }
        parcels.append(
            {
                "id": f"{item.id}:{p.unit}" if own else _opaque_id(container_key, version, index),
                "own": own,
                "position_cm": {"x": p.x, "y": p.y, "z": p.z},
                "size_cm": {"length": p.length, "width": p.width, "height": p.height},
                "rotation_y": p.rotation_y,
                "details": details,
            }
        )

    return {
        "id": None if container_id is None else str(container_id),
        "sequence": sequence,
        "container_size_ft": size_ft,
        "internal_cm": {"length": spec.length, "width": spec.width, "height": spec.height},
        "max_payload_kg": spec.max_payload_kg,
        "version": version,
        "parcels": parcels,
        "unplaced_count": len(result.unplaced),
        "summary": summary(spec, lines, result),
    }


def build_plan(session: Session, shipment: Shipment, *, viewer_sees_all: bool) -> dict[str, Any]:
    if shipment.booking_type == BookingType.FULL:
        containers = [
            _container_plan(
                container_id=None,
                sequence=1,
                size_ft=shipment.container_size_ft,
                version=shipment.cargo_version,
                items=cargo_repo.list_for_shipment(session, shipment.id),
                own_shipment_id=shipment.id,
                viewer_sees_all=viewer_sees_all,
            )
        ]
    else:
        containers = [
            _container_plan(
                container_id=c.id,
                sequence=c.sequence,
                size_ft=c.container_size_ft,
                version=c.version,
                items=cargo_repo.list_in_container(session, c.id),
                own_shipment_id=shipment.id,
                viewer_sees_all=viewer_sees_all,
            )
            for c in cargo_repo.containers_of_shipment(session, shipment.id)
        ]
    return {
        "shipment_id": str(shipment.id),
        "booking_type": BookingType(shipment.booking_type).value,
        "viewer_sees_all": viewer_sees_all,
        "containers": containers,
    }


def plan_versions(session: Session, shipment_id: UUID) -> dict[str, int]:
    """``{"full": n}`` or ``{container_id: n}`` for every container in this shipment's plan."""
    shipment = session.get(Shipment, shipment_id)
    if shipment is None:
        return {}
    if shipment.booking_type == BookingType.FULL:
        return {FULL_KEY: shipment.cargo_version}
    containers: list[SharedContainer] = cargo_repo.containers_of_shipment(session, shipment_id)
    return {str(c.id): c.version for c in containers}
