from datetime import date
from typing import Any

from pydantic import BaseModel, field_validator

from app.schemas.enums import (
    CargoType,
    ContainerSizeFt,
    CostComponent,
    Currency,
    RateType,
    ShippingLine,
)


class TariffRuleBase(BaseModel):
    rule_type: CostComponent
    port_id: str | None = None
    hs_code_prefix: str | None = None
    shipping_line: ShippingLine | None = None
    cargo_type: CargoType | None = None
    container_size_ft: ContainerSizeFt | None = None
    rate_type: RateType
    rate_value: str
    currency: Currency = Currency.INR
    free_days: int | None = None
    tier_config: Any | None = None
    valid_from: date
    valid_to: date | None = None
    source_note: str

class TariffRuleCreate(TariffRuleBase):
    @field_validator('rate_value')
    def validate_rate(cls, v):
        if float(v) < 0:
            raise ValueError("rate_value must be >= 0")
        return v
        
    @field_validator('valid_to')
    def validate_dates(cls, v, info):
        if v and 'valid_from' in info.data and v <= info.data['valid_from']:
            raise ValueError("valid_to must be after valid_from")
        return v

class TariffRulePatch(BaseModel):
    is_active: bool
    
    @field_validator('is_active')
    def validate_deactivation(cls, v):
        if v is True:
            raise ValueError("is_active can only be set to false")
        return v