from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.schemas.enums import CostComponent, Currency, ResourceType, SourceType, WarningCode


class CostLine(BaseModel):
    component: CostComponent
    amount: str | None
    status: str
    reason: str | None
    rule_version: str | None

class CapacitySnapshot(BaseModel):
    status: str
    reason: str | None
    resource_type: ResourceType | None = None
    utilization_pct: float | None = None
    source_type: SourceType | None = None
    bucket_start: datetime | None = None
    bucket_end: datetime | None = None

class ExplanationFeature(BaseModel):
    name: str
    value: Any
    contribution: float

class Explanation(BaseModel):
    status: str
    reason: str | None
    method: str | None = None
    base_value_days: float | None = None
    unit: str | None = None
    features: list[ExplanationFeature] = []

class WarningDetail(BaseModel):
    code: WarningCode
    message: str

class Provenance(BaseModel):
    model_version: str
    dataset_version: str
    tariff_rule_versions: list[str]
    generated_at: datetime
    data_source: SourceType
    is_demo_data: bool

class PredictionResponse(BaseModel):
    prediction_id: str
    shipment_id: str
    predicted_dwell_days: float
    predicted_clearance_at: datetime
    currency: Currency
    cost_breakdown: list[CostLine]
    total_estimated_cost: str | None
    total_is_partial: bool
    capacity_snapshot: CapacitySnapshot | None
    explanation: Explanation | None
    warnings: list[WarningDetail]
    provenance: Provenance
    