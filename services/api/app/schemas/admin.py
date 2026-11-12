from pydantic import BaseModel, field_validator
from typing import Optional, Any
from datetime import date, datetime
from app.schemas.enums import CostComponent, ShippingLine, CargoType, ContainerSizeFt, RateType, Currency

class TariffRuleBase(BaseModel):
    rule_type: CostComponent
    port_id: Optional[str] = None
    hs_code_prefix: Optional[str] = None
    shipping_line: Optional[ShippingLine] = None
    cargo_type: Optional[CargoType] = None
    container_size_ft: Optional[ContainerSizeFt] = None
    rate_type: RateType
    rate_value: str
    currency: Currency = Currency.INR
    free_days: Optional[int] = None
    tier_config: Optional[Any] = None
    valid_from: date
    valid_to: Optional[date] = None
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