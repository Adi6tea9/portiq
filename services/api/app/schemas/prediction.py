from pydantic import BaseModel
from typing import List, Optional, Any
from datetime import datetime
from app.schemas.enums import Currency, CostComponent, ResourceType, SourceType, WarningCode

class CostLine(BaseModel):
    component: CostComponent
    amount: Optional[str]
    status: str
    reason: Optional[str]
    rule_version: Optional[str]

class CapacitySnapshot(BaseModel):
    status: str
    reason: Optional[str]
    resource_type: Optional[ResourceType] = None
    utilization_pct: Optional[float] = None
    source_type: Optional[SourceType] = None
    bucket_start: Optional[datetime] = None
    bucket_end: Optional[datetime] = None

class ExplanationFeature(BaseModel):
    name: str
    value: Any
    contribution: float

class Explanation(BaseModel):
    status: str
    reason: Optional[str]
    method: Optional[str] = None
    base_value_days: Optional[float] = None
    unit: Optional[str] = None
    features: List[ExplanationFeature] = []

class WarningDetail(BaseModel):
    code: WarningCode
    message: str

class Provenance(BaseModel):
    model_version: str
    dataset_version: str
    tariff_rule_versions: List[str]
    generated_at: datetime
    data_source: SourceType
    is_demo_data: bool

class PredictionResponse(BaseModel):
    prediction_id: str
    shipment_id: str
    predicted_dwell_days: float
    predicted_clearance_at: datetime
    currency: Currency
    cost_breakdown: List[CostLine]
    total_estimated_cost: Optional[str]
    total_is_partial: bool
    capacity_snapshot: Optional[CapacitySnapshot]
    explanation: Optional[Explanation]
    warnings: List[WarningDetail]
    provenance: Provenance
    