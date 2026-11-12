"""``GET /config`` shape (frontend contract 5.4)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class CapacityThresholds(BaseModel):
    moderate_pct: int
    high_pct: int


class AppConfigResponse(BaseModel):
    capacity_thresholds: CapacityThresholds
    max_forecast_range_days: int
    default_bucket: Literal["day"]
