"""SHAP explanation for one prediction (backend spec 11.9).

One-hot SHAP values are summed back onto the 12 original features. If anything fails
or the values do not add up to the prediction, the explanation is reported as
unavailable; contributions are never invented.

Two artifact layouts are supported:

* v1: a ``Pipeline(preprocessor, regressor)`` predicting days directly.
* v2: a bundle dict whose ``point_model`` is ``Pipeline(prep, reg)`` and ``reg`` is a
  ``TransformedTargetRegressor`` with a log1p target. TreeExplainer works in log space, so
  the values are first checked for additivity there, then mapped to days: the base is
  ``expm1(base_log)`` and the gap to the prediction is shared in proportion to each
  feature's log-space SHAP value (signs and ranking preserved, exactly additive).
  Inputs the API always fills with fixed defaults (the v2-only columns) are folded into
  the base value, so the contract keeps its 12 features.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
import shap
from sklearn.compose import TransformedTargetRegressor

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


def _unwrap(model: Any) -> tuple[Any, Any, bool]:
    """Return (preprocessor, tree regressor, predicts_log1p) for a v1 pipeline or v2 bundle."""
    pipeline = model["point_model"] if isinstance(model, dict) else model
    steps = pipeline.named_steps
    preprocessor = steps["prep"] if "prep" in steps else steps["preprocessor"]
    regressor = steps["reg"] if "reg" in steps else steps["regressor"]
    if isinstance(regressor, TransformedTargetRegressor):
        if regressor.func is not np.log1p or regressor.inverse_func is not np.expm1:
            raise ValueError("unsupported target transform")
        return preprocessor, regressor.regressor_, True
    return preprocessor, regressor, False


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
    if dwell_model.model is None or not dwell_model.is_loaded:
        return unavailable("Model is not loaded")

    try:
        preprocessor, regressor, log_target = _unwrap(dwell_model.model)
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

        # SHAP must add up to the tree's own output before anything is converted.
        raw_output = float(np.asarray(regressor.predict(transformed)).reshape(-1)[0])
        if abs(base_value + contributions.sum() - raw_output) > ADDITIVITY_TOLERANCE_DAYS:
            logger.error("shap_additivity_failed")
            return unavailable("SHAP contributions do not add up to the model prediction")

        if log_target:
            log_shift = float(contributions.sum())
            base_value = float(np.expm1(base_value))
            scale = (prediction - base_value) / log_shift if abs(log_shift) > 1e-12 else 0.0
            contributions = contributions * scale

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
            else:
                # Fixed API defaults (v2-only inputs) are the same for every request.
                base_value += float(contribution)
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
