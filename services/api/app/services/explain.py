"""SHAP explanation for one prediction (backend spec 11.9).

One-hot SHAP values are summed back onto the 12 original features. If anything fails
or the values do not add up to the prediction, the explanation is reported as
unavailable; contributions are never invented.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
import shap

from app.services.ml import dwell_model
from app.services.model_service import FEATURE_NAMES

logger = logging.getLogger("portiq.ml")

ADDITIVITY_TOLERANCE_DAYS = 1e-3

_explainer: Any = None
_explainer_model_id: int | None = None


def _get_explainer(regressor: Any) -> Any:
    global _explainer, _explainer_model_id

    if _explainer is None or _explainer_model_id != id(regressor):
        _explainer = shap.TreeExplainer(regressor)
        _explainer_model_id = id(regressor)
    return _explainer


def unavailable(reason: str) -> dict[str, Any]:
    return {"status": "unavailable", "reason": reason, "features": []}


def _original_name(encoded_name: str, categorical: list[str]) -> str:
    """Map ``port_code_INNSA`` back to ``port_code``; unknown names are kept as-is."""
    for name in sorted(categorical, key=len, reverse=True):
        if encoded_name == name or encoded_name.startswith(f"{name}_"):
            return name
    return encoded_name


def explain(features: dict[str, Any], prediction: float) -> dict[str, Any]:
    """Return the contract ``Explanation`` dict for one already-made prediction."""
    pipeline = dwell_model.model
    if pipeline is None or not dwell_model.is_loaded:
        return unavailable("Model is not loaded")

    try:
        preprocessor = pipeline.named_steps["preprocessor"]
        regressor = pipeline.named_steps["regressor"]
        # The same frame the model predicts on, so SHAP explains that exact row.
        frame = dwell_model.model_frame(features)
        transformed = preprocessor.transform(frame)
        if hasattr(transformed, "toarray"):
            transformed = transformed.toarray()

        values = _get_explainer(regressor).shap_values(transformed)
        if isinstance(values, list):
            values = values[0]
        contributions = np.asarray(values, dtype=float).reshape(-1)

        base_value = float(np.asarray(_get_explainer(regressor).expected_value).reshape(-1)[0])

        encoded_names = [str(name) for name in preprocessor.get_feature_names_out()]
        categorical = [
            column
            for name, _transformer, columns in preprocessor.transformers_
            if name == "cat"
            for column in columns
        ]

        totals: dict[str, float] = {name: 0.0 for name in FEATURE_NAMES}
        for encoded, contribution in zip(encoded_names, contributions, strict=True):
            original = _original_name(encoded.split("__", 1)[-1], categorical)
            if original in totals:
                totals[original] += float(contribution)
    except Exception as exc:  # noqa: BLE001 - an explanation failure must not fail the prediction
        logger.exception("shap_failed")
        return unavailable(f"SHAP explanation failed: {type(exc).__name__}")

    if abs(base_value + sum(totals.values()) - prediction) > ADDITIVITY_TOLERANCE_DAYS:
        logger.error("shap_additivity_failed")
        return unavailable("SHAP contributions do not add up to the model prediction")

    return {
        "status": "available",
        "reason": None,
        "method": "SHAP",
        "base_value_days": base_value,
        "unit": "days",
        "features": [
            {
                "name": name,
                "value": features[name],
                "contribution": round(totals[name], 6),
            }
            for name in FEATURE_NAMES
        ],
    }
