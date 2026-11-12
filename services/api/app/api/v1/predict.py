"""``POST /predict/dwell``: ML live inference endpoint (backend spec section 10)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.core.deps import CurrentUser
from app.core.errors import request_id_of
from app.schemas.envelope import envelope
from app.schemas.predict import DwellPredictionRequest
from app.services.ml import dwell_model

router = APIRouter(prefix="/predict", tags=["ml-predict"])


@router.post("/dwell")
def predict_dwell_time(
    payload: DwellPredictionRequest,
    request: Request,
    user: CurrentUser,
) -> Any:
    if not dwell_model.is_loaded:
        return JSONResponse(
            status_code=503,
            content={
                "error": {
                    "code": "MODEL_UNAVAILABLE",
                    "message": "The ML prediction engine is currently offline.",
                    "details": [],
                    "request_id": request_id_of(request),
                }
            },
        )

    features = payload.model_dump()
    prediction = dwell_model.predict(features)

    data = {
        "predicted_dwell_days": round(prediction, 2),
        "model_version": "v1",
    }

    return envelope(data, request_id_of(request))
