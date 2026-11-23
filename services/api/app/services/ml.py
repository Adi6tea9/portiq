import json
import logging
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

logger = logging.getLogger("portiq.ml")


def v2_defaults(features: dict[str, Any]) -> dict[str, Any]:
    """Values for the five v2-only inputs the API does not collect, in the generator's own
    vocabulary (``ml/scripts/generate_synthetic_v2.py``); unknown strings would be encoded as
    "none of the above" by the one-hot encoder.

    shortcut: is_holiday stays 0 because the features carry no date (wrong on 5 days a year);
    pass the arrival date through if holidays start to matter.
    """
    utilization = float(features.get("forecast_capacity_utilization_pct") or 0.0)
    return {
        "customs_channel": "unknown",  # not known before arrival; 35% of training rows
        "importer_type": "regular",    # most common type, neutral multiplier
        "cargo_priority": "standard",  # the generator's default
        "is_holiday": 0,
        # The generator's queue formula without its noise term.
        "exam_queue_len": float(max(0, round(10 + 0.9 * (utilization - 50)))),
    }


class DwellTimeModel:
    def __init__(self) -> None:
        self.model = None
        self.metadata: dict[str, Any] = {}
        self._is_loaded = False

    def load(self, model_path: Path) -> None:
        """Loads the trained joblib model into memory on server startup."""
        if not model_path.exists():
            logger.error(f"Model file not found at {model_path}")
            return

        try:
            self.model = joblib.load(model_path)
            self._is_loaded = True
            logger.info(f"Successfully loaded ML model from {model_path}")
            self.metadata = self._read_metadata(model_path)
        except Exception as e:
            logger.error(f"Failed to load ML model: {e}")
            self._is_loaded = False

    def _read_metadata(self, model_path: Path) -> dict[str, Any]:
        """``model_metadata_<version>.json`` beside the artifact (spec 11.6); {} if absent."""
        version = self.model.get("version") if isinstance(self.model, dict) else None
        path = model_path.with_name(f"model_metadata_{version or 'v1'}.json")
        try:
            return dict(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            logger.warning(f"Model metadata not found or unreadable at {path}")
            return {}

    @property
    def is_loaded(self) -> bool:
        return self._is_loaded

    def predict(self, features: dict[str, Any]) -> float:
        """Generates a dwell time prediction, matching exact schema and numpy types."""
        if not self.is_loaded or self.model is None:
            raise RuntimeError("Model is not loaded. Cannot generate prediction.")

        return float(self.model['point_model'].predict(self.model_frame(features))[0])

    def model_frame(self, features: dict[str, Any]) -> pd.DataFrame:
        """Build the frame exactly as the artifact expects it.

        The trained ``ColumnTransformer`` is the source of truth for column types (the v1
        artifact encodes ``hs_chapter`` as integers, v2 as two-digit strings).
        """
        row = dict(features)
        for col, default_val in v2_defaults(row).items():
            row.setdefault(col, default_val)

        if self.model is None:
            raise RuntimeError("Model is not loaded. Cannot build its input frame.")
        steps = getattr(self.model["point_model"], "named_steps", {})
        # v2 bundles name the step "prep"; v1 pipelines used "preprocessor".
        preprocessor = steps["prep"] if "prep" in steps else steps.get("preprocessor")
        expected_cols = list(getattr(preprocessor, "feature_names_in_", row.keys()))

        for col in expected_cols:
            if col not in row:
                if col == "is_weekend":
                    row[col] = int(row.get("arrival_day_of_week") in ("Saturday", "Sunday"))
                elif col in ("month", "arrival_month_num"):
                    months = [
                        "January", "February", "March", "April", "May", "June",
                        "July", "August", "September", "October", "November", "December",
                    ]
                    m_val = row.get("arrival_month", "November")
                    row[col] = months.index(m_val) + 1 if m_val in months else 11
                elif col in ("day_of_week", "arrival_dow"):
                    days = [
                        "Monday", "Tuesday", "Wednesday", "Thursday",
                        "Friday", "Saturday", "Sunday",
                    ]
                    d_val = row.get("arrival_day_of_week", "Tuesday")
                    row[col] = days.index(d_val) if d_val in days else 1
                else:
                    row[col] = 0

        if preprocessor is not None and hasattr(preprocessor, "transformers_"):
            for name, trans, cols in preprocessor.transformers_:
                if name == "cat" and hasattr(trans, "categories_"):
                    for col, cats in zip(cols, trans.categories_, strict=True):
                        if col in row and len(cats) > 0:
                            if np.issubdtype(cats.dtype, np.number):
                                try:
                                    row[col] = int(row[col])
                                except (ValueError, TypeError):
                                    pass
                            else:
                                row[col] = (
                                    str(row[col]).zfill(2)
                                    if col == "hs_chapter"
                                    else str(row[col])
                                )
                elif name == "num":
                    for col in cols:
                        if col in row:
                            row[col] = float(row[col])

        df = pd.DataFrame([[row[c] for c in expected_cols]], columns=expected_cols)
        return df


dwell_model = DwellTimeModel()