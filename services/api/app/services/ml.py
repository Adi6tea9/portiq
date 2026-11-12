import logging
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

logger = logging.getLogger("portiq.ml")


class DwellTimeModel:
    def __init__(self) -> None:
        self.model = None
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
        except Exception as e:
            logger.error(f"Failed to load ML model: {e}")
            self._is_loaded = False

    @property
    def is_loaded(self) -> bool:
        return self._is_loaded

    def predict(self, features: dict[str, Any]) -> float:
        """Generates a dwell time prediction, matching exact schema and numpy types."""
        if not self.is_loaded or self.model is None:
            raise RuntimeError("Model is not loaded. Cannot generate prediction.")

        row = dict(features)

        preprocessor = getattr(self.model, "named_steps", {}).get("preprocessor")
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
                    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
                    d_val = row.get("arrival_day_of_week", "Tuesday")
                    row[col] = days.index(d_val) if d_val in days else 1
                else:
                    row[col] = 0

        if preprocessor is not None and hasattr(preprocessor, "transformers_"):
            for name, trans, cols in preprocessor.transformers_:
                if name == "cat" and hasattr(trans, "categories_"):
                    for col, cats in zip(cols, trans.categories_):
                        if col in row and len(cats) > 0:
                            if np.issubdtype(cats.dtype, np.number):
                                try:
                                    row[col] = int(row[col])
                                except (ValueError, TypeError):
                                    pass
                            else:
                                row[col] = str(row[col]).zfill(2) if col == "hs_chapter" else str(row[col])
                elif name == "num":
                    for col in cols:
                        if col in row:
                            row[col] = float(row[col])

        df = pd.DataFrame([[row[c] for c in expected_cols]], columns=expected_cols)
        prediction = self.model.predict(df)[0]
        return float(prediction)


dwell_model = DwellTimeModel()