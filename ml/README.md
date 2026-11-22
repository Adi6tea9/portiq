# ML Engine

Dwell-time model for PortIQ: synthetic data calibrated to published Indian port dwell averages, a
trained scikit-learn model served by the API, and SHAP explanations. All results are on synthetic
data and are not real-world accuracy.

## Status (22 Nov 2026)

- v2 pipeline complete and reproducible: `generate_synthetic_v2.py` → `prepare_data.py --version v2`
  → `train.py --version v2`.
- Served model: `artifacts/dwell_model_v2.joblib`, HistGradientBoosting with a log1p target, plus
  10th/90th-percentile range models. Test MAE 0.611 days (best baseline 0.942), stress MAE 1.327
  (baseline 2.030). Details in `reports/metrics_v2.json`.
- `artifacts/model_metadata_v2.json`: versions, feature schema, numeric training ranges, metrics.
- `scripts/evaluate.py`: calibration report (`reports/calibration_v2.json`).
- `data/reference/port_dwell_{2020,2021,2022}.csv`: real monthly port dwell averages in hours.
  They reproduce the generator's base means, and `evaluate.py` checks every year (all within 15%).
  Source URL, download date and licence are not recorded.
- Docs: `docs/model-card.md`, `docs/data-dictionary.md`. Tests: `python -m pytest ml/tests`
  from the repo root (19 tests).

Build the model inside the API's Docker image so scikit-learn matches the server; the command is in
the root `README.md`. The generator imports the API's capacity simulator from `../services/api`.

## Folder Structure

- **data/raw** - Original, immutable data sources (git-ignored)
- **data/processed** - Cleaned and transformed datasets ready for modeling (git-ignored)
- **scripts** - Training, evaluation, and data processing scripts
- **artifacts** - Trained models, encoders, scalers (git-ignored)
- **reports** - Performance metrics, visualizations, experiment logs
- **tests** - Unit and integration tests for ML components

## Setup

Activate the virtual environment:
```bash
source .venv/Scripts/activate  # Windows Git Bash
# or: .venv\Scripts\activate   # Windows CMD
# or: source .venv/bin/activate # Linux/Mac
```

Install dependencies:
```bash
pip install -r requirements.txt
```
