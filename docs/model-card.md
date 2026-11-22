# Model card — PortIQ dwell-time model (`dwell-model-v2`)

> **Performance on synthetic data does not indicate real-world accuracy.** Every relationship the
> model learns was planted by the data generator. A good score shows the pipeline works, not that
> real ports behave this way.

| | |
|---|---|
| Model version | `dwell-model-v2` (`ml/artifacts/dwell_model_v2.joblib`) |
| Dataset version | `synthetic-v2` (see `docs/data-dictionary.md`) |
| Trained | 2026-11-22T11:00:07Z (`model_metadata_v2.json` → `created_at`) |
| Training source | synthetic (`training_source_type`) |
| Served decision | **model** (it beats every baseline on both test and stress) |
| Code | `ml/scripts/train.py --version v2` |

## Intended use

Planning demonstration for PortIQ. It gives an indicative dwell estimate with a SHAP explanation
and a 10th–90th percentile range. It is **not** a customs assessment, an operational guarantee or
a quote. It covers two ports (INNSA Nhava Sheva, INMUN Mundra) only.

## Target

`dwell_days`: days from arrival to clearance for one container, a fractional number clipped to
[0.1, 30]. The API turns it into `predicted_clearance_at = expected_arrival_at + dwell`.

## Features

The model is trained on 17 columns.

**12 frozen API features** (spec 4.5):
- `direction`, `port_code`, `cargo_type`, `container_size_ft`, `hs_chapter` (two-digit string)
- `weight_kg`, `shipping_line`, `vessel_size_band`, `documentation_status`
- `arrival_day_of_week`, `arrival_month`
- `forecast_capacity_utilization_pct` (stored yard bucket, or the capacity simulator)

**5 v2-only inputs** the API does not collect:
- `customs_channel`, `importer_type`, `cargo_priority`, `is_holiday`, `exam_queue_len`

At prediction time the API fills those five with values from the training vocabulary:

| Input | Value at prediction time |
|---|---|
| `customs_channel` | `unknown` (not known before arrival) |
| `importer_type` | `regular` |
| `cargo_priority` | `standard` |
| `is_holiday` | 0 |
| `exam_queue_len` | derived from utilization |

Their SHAP share is folded into the base value, so explanations list the 12 API features. See
"Served accuracy" for what this costs.

`declared_value` and the raw `port_id` are never inputs.

## Data and split

- 10,000 main rows and a separate 1,500-row stress holdout (different seed).
- Main rows are split **by arrival date**: first 70% train (7,000), next 15% validation (1,500),
  last 15% test (1,500).
- All preprocessing is fitted on training rows only. A test enforces this
  (`ml/tests/test_pipeline.py`).
- Preprocessing: one-hot encoding (`handle_unknown="ignore"`) for categoricals, numerics passed
  through, and a `log1p` target with `expm1` on output.

## Model selection

- **Candidates:** RandomForest (300 trees, depth 12 or unlimited, min leaf 2 or 5) and
  HistGradientBoosting (learning rate 0.05 or 0.1, 15 or 31 leaves), each with and without a log
  target. That's 16 configurations.
- **Tuning:** validation set only.
- **Chosen:** HistGradientBoosting, log target, learning rate 0.05, 15 leaves, 300 iterations, L2
  1.0. Validation MAE 0.702.
- **Deviation from the spec:** spec 11.2 names a RandomForest. Random forests were in the search,
  and gradient boosting won on validation. The selection rule (spec 11.5) still applies: the model
  is served only because it beats the baselines on both test and stress.
- **Range models:** 10th and 90th percentile gradient-boosting models give the range. A
  calibration margin (0.075 days) learned on validation widens it towards 80% coverage.

## Metrics (scored once on test and stress)

MAE is in days and is the primary metric.

| | Test MAE | Test RMSE | Test R² | Stress MAE | Stress RMSE | Stress R² |
|---|---|---|---|---|---|---|
| **Model** | **0.611** | 1.183 | 0.749 | **1.327** | 2.443 | 0.621 |
| Baseline: training median (spec 11.3) | 1.357 | — | — | 2.658 | — | — |
| Baseline: per port/direction median | 0.942 | — | — | 2.200 | — | — |
| Baseline: per port/direction mean | 1.054 | — | — | 2.030 | — | — |

Full numbers, including the RMSE and R² for every baseline, are in `ml/reports/metrics_v2.json`.

**Range coverage** (target 80%):

| | Test | Stress |
|---|---|---|
| After calibration | 82% (mean width 1.87 days) | 68% (mean width 2.92 days) |
| Raw | 74% | 63% |

### Served accuracy

The figures above use all 17 true inputs. The API does not collect the five v2-only inputs, so on
the same test rows:

| Inputs the API sends | Test MAE | Average bias |
|---|---|---|
| All 17 true inputs | 0.611 | — |
| **Current defaults** | **0.732** | +0.01 days |
| Defaults before 22 Nov (`"Standard"`, `"Green"`; unknown to the model) | 0.755 | −0.42 days |

So the accuracy a user actually gets is about 0.73 days, still clearly better than the best
baseline (0.942).

### Per-category MAE (model / per port/direction median baseline, test set)

| Column | Value (rows): model / baseline |
|---|---|
| direction | import (908): 0.27 / 0.42 · export (592): 1.13 / 1.75 |
| port_code | INNSA (896): 0.48 / 0.73 · INMUN (604): 0.80 / 1.26 |
| cargo_type | general (1067): 0.57 / 0.84 · reefer (210): 0.44 / 0.92 · hazardous (117): 0.93 / 1.31 · oversized (106): 0.96 / 1.56 |
| shipping_line | A (453): 0.55 / 0.83 · B (380): 0.58 / 0.87 · C (284): 0.56 / 0.84 · D (239): 0.70 / 1.16 · other (144): 0.81 / 1.32 |
| documentation | complete (1049): 0.51 / 0.79 · incomplete (296): 0.94 / 1.51 · unknown (155): 0.66 / 0.86 |

Stress-set breakdowns are in `metrics_v2.json` → `per_category.stress`. The model beats the
baseline in every category on both sets. Errors are largest for export, Mundra, hazardous or
oversized cargo, the `other` line and incomplete documentation, which are the slowest and most
variable groups.

### Checks (spec 11.4)

- **No negative predictions and none above 30 days**, on test or stress.
- **Bias:** test +0.07 days. Stress **+0.63 days**: the model underpredicts there, because the stress
  set's disruption scenario (import dwell ×2–3) leaves no trace in any feature. This is expected
  and is why stress errors are higher.
- **Out-of-range inputs:** 8 test rows have utilization above the training maximum. The API flags
  such inputs with `OUT_OF_RANGE_INPUT`.
- **Ablations (test / stress MAE):**
  - full features: 0.611 / 1.327
  - without utilization signals: 0.714 / 1.633
  - v1 features only: 0.731 / 1.509

  Utilization carries real signal in this data.

## Training ranges (numeric inputs)

| Input | Min | Max |
|---|---|---|
| `weight_kg` | 500 | 40,000 |
| `forecast_capacity_utilization_pct` | 50.6 | 97.98 |
| `container_size_ft` | 20 | 40 |
| `exam_queue_len` | 0 | 73 |
| `is_holiday` | 0 | 1 |

The API accepts weights up to 60,000 kg, so heavier shipments are extrapolation and get the
warning.

## Limitations

- **Synthetic data only**, calibrated to published monthly average dwell per port and direction
  (2020–2021, lockdown months excluded; `ml/data/reference/`). The averages match by construction,
  and they agree with each real year within 15%, 2022 included. The container-level
  spread is an assumption.
- **Planted effects:** the multipliers for cargo, documentation, congestion and the rest are
  planted. The priority and importer-type effects are assumptions with no published source.
- **Two ports and fixed category lists.** An unseen category is encoded as "none of the above".
- **`is_holiday` is always 0 at prediction time** (the features carry no date), and the other
  v2-only inputs use fixed defaults. That costs about 0.12 days of MAE.
- **The reference data's source URL, download date and licence are not recorded** (units confirmed
  as hours). The per-year calibration check passes for 2020, 2021 and 2022: every port/direction
  mean is within 15%, and 2022 is an out-of-sample year (`docs/data-dictionary.md`).

## Reproduce

Run inside the API image, so scikit-learn matches the server:

```powershell
docker run --rm -v "${PWD}\ml:/repo/ml" -v "${PWD}\services\api:/repo/services/api:ro" `
  -w /repo/ml/scripts api-api sh -c "python generate_synthetic_v2.py && python prepare_data.py --version v2 && python train.py --version v2 && python evaluate.py"
```

The fixed seed reproduces the data and metrics exactly. Tests: `python -m pytest ml/tests` from the
repo root.
