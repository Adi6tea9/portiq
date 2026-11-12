"""``GET /config``: UI thresholds and limits (backend spec section 4)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from app.core.config import (
    CAPACITY_HIGH_PCT,
    CAPACITY_MODERATE_PCT,
    DEFAULT_FORECAST_BUCKET,
    MAX_FORECAST_RANGE_DAYS,
)
from app.core.deps import CurrentUser
from app.core.errors import request_id_of
from app.schemas.app_config import AppConfigResponse, CapacityThresholds
from app.schemas.envelope import envelope

router = APIRouter(tags=["config"])


@router.get("/config")
def read_config(
    request: Request,
    _user: CurrentUser,
) -> dict[str, Any]:
    data = AppConfigResponse(
        capacity_thresholds=CapacityThresholds(
            moderate_pct=CAPACITY_MODERATE_PCT,
            high_pct=CAPACITY_HIGH_PCT,
        ),
        max_forecast_range_days=MAX_FORECAST_RANGE_DAYS,
        default_bucket=DEFAULT_FORECAST_BUCKET,
    )
    return envelope(data.model_dump(mode="json"), request_id_of(request))
