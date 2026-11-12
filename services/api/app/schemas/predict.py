"""Pydantic schemas for ML predictions."""

from __future__ import annotations

from pydantic import BaseModel, Field

class DwellPredictionRequest(BaseModel):
    direction: str
    port_code: str
    cargo_type: str
    container_size_ft: int
    hs_chapter: str = Field(..., min_length=2, max_length=2)
    weight_kg: float
    shipping_line: str
    vessel_size_band: str
    documentation_status: str
    arrival_month: str
    arrival_day_of_week: str
    forecast_capacity_utilization_pct: float
    
    model_config = {
        "json_schema_extra": {
            "example": {
                "direction": "import",
                "port_code": "INNSA",
                "cargo_type": "general_container",
                "container_size_ft": 40,
                "hs_chapter": "85",
                "weight_kg": 15500.0,
                "shipping_line": "Line A",
                "vessel_size_band": "medium",
                "documentation_status": "complete",
                "arrival_month": "November",
                "arrival_day_of_week": "Tuesday",
                "forecast_capacity_utilization_pct": 78.5
            }
        }
    }