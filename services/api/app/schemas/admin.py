from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Annotated, Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.schemas.enums import (
    CargoType,
    ContainerSizeFt,
    CostComponent,
    Currency,
    RateType,
    ShippingLine,
)

HsPrefix = Annotated[str, StringConstraints(pattern=r"^[0-9]{1,6}$")]


class TariffRuleBase(BaseModel):
    rule_type: CostComponent
    port_id: UUID | None = None
    hs_code_prefix: HsPrefix | None = None
    shipping_line: ShippingLine | None = None
    cargo_type: CargoType | None = None
    container_size_ft: ContainerSizeFt | None = None
    rate_type: RateType
    rate_value: str
    currency: Currency = Currency.INR
    free_days: Annotated[int, Field(ge=0)] | None = None
    tier_config: Any | None = None
    valid_from: date
    valid_to: date | None = None
    source_note: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class TariffRuleCreate(TariffRuleBase):
    # The frontend's TariffRuleCreate carries a version label; other unknown fields are ignored.
    version: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)
    ] = "1.0"

    @field_validator("rate_value")
    @classmethod
    def validate_rate(cls, v: str) -> str:
        try:
            value = Decimal(v)
        except InvalidOperation:
            raise ValueError("must be a decimal string") from None
        if not value.is_finite() or value < 0:
            raise ValueError("rate_value must be >= 0")
        return v

    @field_validator("valid_to")
    @classmethod
    def validate_dates(cls, v: date | None, info: Any) -> date | None:
        if v and "valid_from" in info.data and v <= info.data["valid_from"]:
            raise ValueError("valid_to must be after valid_from")
        return v


class TariffRulePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_active: bool

    @field_validator("is_active")
    @classmethod
    def validate_deactivation(cls, v: bool) -> bool:
        if v is True:
            raise ValueError("is_active can only be set to false")
        return v
