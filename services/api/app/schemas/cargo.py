"""Cargo line request/response shapes (CG-022). Centimetres and kilograms."""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.models import CargoItem
from app.schemas.enums import CargoCategory
from app.schemas.shipments import utc_z

NAME = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
DIMENSION = Annotated[Decimal, Field(ge=1, le=1203, max_digits=7, decimal_places=2)]
WEIGHT = Annotated[Decimal, Field(ge=Decimal("0.1"), le=30000, max_digits=9, decimal_places=2)]
QUANTITY = Annotated[int, Field(ge=1, le=500)]


class CargoItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: NAME
    category: CargoCategory
    length_cm: DIMENSION
    width_cm: DIMENSION
    height_cm: DIMENSION
    weight_kg: WEIGHT
    quantity: QUANTITY
    stackable: bool = True


class CargoItemAdd(CargoItemCreate):
    container_id: UUID | None = None
    allow_split: bool = False


class CargoItemPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: NAME | None = None
    category: CargoCategory | None = None
    length_cm: DIMENSION | None = None
    width_cm: DIMENSION | None = None
    height_cm: DIMENSION | None = None
    weight_kg: WEIGHT | None = None
    quantity: QUANTITY | None = None
    stackable: bool | None = None


def cargo_item_response(item: CargoItem) -> dict[str, object]:
    return {
        "id": str(item.id),
        "shipment_id": str(item.shipment_id),
        "name": item.name,
        "category": CargoCategory(item.category).value,
        "length_cm": float(item.length_cm),
        "width_cm": float(item.width_cm),
        "height_cm": float(item.height_cm),
        "weight_kg": float(item.weight_kg),
        "quantity": item.quantity,
        "stackable": item.stackable,
        "container_id": None if item.container_id is None else str(item.container_id),
        "created_at": utc_z(item.created_at),
        "updated_at": utc_z(item.updated_at),
    }
