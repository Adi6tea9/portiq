# PortIQ · Backend Master Spec v1.1 (one-person scope)

> v1.1 (6 Nov 2026): dwell times calibrated to India's published 2020 and 2021 port dwell averages (sections 4, 9, 10, 12, 14); `direction` and `port_code` added as model features.

Single source of truth for the backend coding agent. It builds the FastAPI service, the Postgres database, the capacity simulator, the synthetic data, the ML model, SHAP and the cost engine.
The API shapes are defined in `docs/FRONTEND_SPEC.md` **section 5** (endpoints, enums, error table, TypeScript types). That section is the contract: the backend must produce exactly those JSON shapes. This file defines behaviour, data and decisions. If this file and the frontend contract conflict, **stop and report**; do not pick one.

## 0. How to use this file

- The agent receives this file, `docs/FRONTEND_SPEC.md`, and one prompt from `PortIQ_Backend_Agent_Prompts.md`. Build only the section named (B01 to B11).
- Precedence: section 2 (protocol) > section 5 (global rules) > frontend contract section 5.4 shapes > section 4 (frozen decisions) > feature section > everything else.
- Anything not written in these two files does not exist. Do not invent endpoints, fields, enum values, tables, libraries or business rules.

## 1. Scope and honesty

A planning prototype. All data is synthetic. No live terminal integration. Estimates are not guarantees and not an official customs assessment. The model result on synthetic data says nothing about real-world accuracy and must never be described as if it did.

## 2. Anti-hallucination protocol (mandatory)

1. **Only use what is written.** If you need something undefined, do not guess: add an entry to `services/api/CONTRACT_GAPS.md` (what, where, assumption), isolate the assumption in one named function, mark it `# CONTRACT-GAP: <id>`, and continue.
2. **Verify, don't recall.** Before using a package or API, check it: `pip index versions <pkg>` or `pip show <pkg>`, then read the installed package's docs or source. Pin versions in `requirements.txt`. Add only libraries listed in section 3.
3. **No claim without evidence.** Never say "works", "passes" or "done" unless you ran the command in this session and can paste the output (with real pass/fail counts).
4. **Call the real thing.** After each feature, start the API and call each new endpoint with real HTTP requests (httpx or curl) and paste request and response. Do not describe responses you did not receive.
5. **Do not tune to hit a number.** The synthetic data generator is written once from the documented assumptions (section 10) and then frozen. Do not change it after seeing model metrics. Report the metrics you get, even if the model barely beats the baseline.
6. **No placeholder business values.** All tariffs, capacities and parameters come from this file or from seed data labelled demo.
7. **One feature per session.** Do not edit other features' files except for backwards-compatible additions you list.
8. **Inspect before editing.** Read what exists first and report a file-level plan. Never overwrite working code without understanding it.
9. **Stop and report** if requirements conflict, a test can only pass by weakening it, or the environment blocks you. Never delete or weaken a test.
10. **End every session** with: Summary · Files created/changed · Commands run with results · Sample requests and responses · Assumptions and CONTRACT-GAP entries · Known limitations · Human decisions needed · Next step.

## 3. Stack, layout, environment

- Python 3.11 or newer, virtual environment (`python -m venv .venv`), no global installs.
- FastAPI, Pydantic v2, Uvicorn, SQLAlchemy 2.x (sync) with `psycopg` (v3), Alembic, PyJWT (with crypto) for token verification, httpx.
- ML: pandas, numpy, scikit-learn, shap, joblib.
- Tests/quality: pytest, pytest-cov, ruff, mypy.
- Database: PostgreSQL 15 or newer (local via Docker Compose or a local install; Supabase cloud for the final integration).
- No other libraries without a written reason in `CONTRACT_GAPS.md`.

```
services/api/
  app/main.py
  app/core/        config.py logging.py errors.py security.py deps.py ratelimit.py
  app/api/v1/      me.py config.py ports.py shipments.py predictions.py capacity.py operator.py admin.py
  app/schemas/     (Pydantic models; one module per area; enums.py is the single enum source)
  app/models/      (SQLAlchemy tables)
  app/repositories/
  app/services/    capacity_sim.py cost_engine.py prediction.py model_service.py explain.py atrisk.py
  migrations/      (Alembic)
  scripts/         seed_dev.py seed_capacity.py export_openapi.py
  tests/  tests/fixtures/
  CONTRACT_GAPS.md  README.md  .env.example  requirements.txt  pyproject.toml
ml/
  scripts/ generate_synthetic.py prepare_data.py train.py evaluate.py
  data/raw/ data/processed/   (CSVs are git-ignored; scripts are committed)
  artifacts/  reports/  tests/
docs/ architecture.md data-dictionary.md model-card.md
```

Environment variables (and no others): `APP_ENV` (local|test|staging|production), `LOG_LEVEL`, `DATABASE_URL`, `ALLOWED_ORIGINS`, `AUTH_MODE` (dev|supabase), `SUPABASE_URL`, `SUPABASE_JWT_JWKS_URL`, `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUDIENCE`, `MODEL_PATH`, `MODEL_VERSION`, `PREDICTION_TIMEOUT_SECONDS` (default 5). No service-role key unless a gap forces it.

## 4. Frozen decisions (these close every [PROPOSED] and [CONFIRM] in the frontend contract)

1. Enums exactly as in frontend contract section 5.2. `currency` is `INR` only. `hs_code` is a 6-digit string.
2. Two seeded ports: `INNSA` Nhava Sheva (JNPA) and `INMUN` Mundra, both timezone `Asia/Kolkata`.
3. Capacity buckets are **1 day**. Forecast range max **31 days**. `GET /config` returns `{capacity_thresholds:{moderate_pct:60, high_pct:85}, max_forecast_range_days:31, default_bucket:"day"}`.
4. `predicted_clearance_at = expected_arrival_at + predicted_dwell_days` (days as a fractional number).
5. The model **excludes** `declared_value` and the raw `port_id`. Model features (12, exact names, used in the dataset, pipeline and SHAP):
   `direction`, `port_code`, `cargo_type`, `container_size_ft`, `hs_chapter`, `weight_kg`, `shipping_line`, `vessel_size_band`, `documentation_status`, `arrival_day_of_week`, `arrival_month`, `forecast_capacity_utilization_pct`.
   Reason: the published Indian data shows export dwell is 3 to 5 times import dwell and ports differ a lot, so direction and port must be model inputs.
6. Auth: Supabase Auth issues tokens. The API verifies them. `AUTH_MODE=dev` exists for local development and tests only (section 7). The API refuses to start with `AUTH_MODE=dev` when `APP_ENV` is `staging` or `production`.
7. Database access: FastAPI connects with `DATABASE_URL`. **All authorization is enforced in the API.** Enable RLS on every table with **no policies** (deny by default for any direct Supabase API access). Document this in `docs/architecture.md`.
8. Migrations: Alembic in `services/api/migrations/`.
9. Not found vs forbidden: a resource the user may not access returns **404**. A role that may never call an endpoint returns **403**.
10. Duplicate shipment `reference` returns 422 `VALIDATION_ERROR` with `details: [{"field":"reference","issue":"already exists"}]`. Uniqueness is global.
11. `PATCH /me` body `{"display_name": string}` trimmed, 1 to 80 chars. Blank or too long returns 422 with field `display_name`.
12. Idempotency: required header `Idempotency-Key` (UUID) on the prediction POST. Stored on `prediction_runs` with a unique `(shipment_id, idempotency_key)`. Same key and same shipment input returns the original result with 200. Same key but the shipment inputs changed returns 409 `IDEMPOTENCY_CONFLICT`. A new prediction returns 201.
13. Rate limit: 10 prediction requests per minute per user (in-memory), then 429 `RATE_LIMITED`.
14. Prediction timeout `PREDICTION_TIMEOUT_SECONDS`; on timeout return 503 `MODEL_UNAVAILABLE`.
15. At-risk thresholds (config constants): high capacity 85%, dwell above **3.0 days**.
16. Weight must be > 0 and <= 60000 kg. `declared_value` >= 0 and <= 1e12, stored as numeric(18,2).
17. Admin role: may call `/admin/*`, `/operator/overview`, `/operator/shipments`, `/capacity/forecast`, `/me`, `/config`, `/ports`. Admin gets 403 on `/shipments*` (owner flows).

## 5. Global rules

1. **UTC everywhere** in storage and responses (ISO-8601 ending `Z`).
2. **Money is `Decimal`**, serialized as a string with 2 decimal places. Never `float`. Rounding: `ROUND_HALF_UP`, applied only at the final line amount.
3. **Envelopes** exactly as frontend contract 5.1: success `{data, meta:{request_id, generated_at, pagination?}}`; error `{error:{code,message,details?,request_id}}`. Every response carries a `request_id` (also returned as `X-Request-ID`). Unexpected errors return a generic `INTERNAL_ERROR` with no traceback; the traceback is logged server-side with the request id.
4. **Error codes** exactly as the table in frontend contract 5.1.
5. **Never trust the body** for role, owner, status or port scope. Role comes from the `profiles` table.
6. **Validation:** Pydantic is authoritative. Field errors return 422 with `details[{field, issue}]` where `field` is the JSON field name.
7. **Pagination:** `page` (>= 1), `page_size` (1 to 100, default 20), `meta.pagination`.
8. **No fabricated outputs.** If the model cannot load, return 503. Never return a plausible hard-coded number.
9. **Logging:** structured JSON with request_id, route, latency, status, actor id, model version, error code. Never log tokens, secrets or full JWTs.
10. **CORS:** only `ALLOWED_ORIGINS`, never `*` with credentials.
11. **Immutability:** prediction snapshots and shipment events are append-only. Never updated or deleted by the API.
12. **Training never runs in a request handler.** The model loads once at startup.

## 6. Database (Alembic migrations; Postgres)

Use UUID primary keys (`gen_random_uuid()`), `timestamptz` for times. Enums as Postgres enum types or `CHECK` constraints that mirror `app/schemas/enums.py`.

| Table | Columns | Notes |
| --- | --- | --- |
| `profiles` | id uuid PK (= auth user id), email, display_name null, role, is_active bool, created_at | Role never set by a normal user path |
| `ports` | id, name, port_code unique, country, timezone, created_at | |
| `operator_ports` | user_id, port_id (PK both) | Operator scope |
| `shipments` | id, owner_user_id FK, port_id FK, reference unique, direction, cargo_type, container_size_ft smallint check in (20,40), hs_code char(6) check `^[0-9]{6}$`, weight_kg numeric check > 0 and <= 60000, declared_value numeric(18,2) check >= 0, currency, shipping_line, vessel_size_band, expected_arrival_at, actual_arrival_at null, actual_cleared_at null, documentation_status, status, created_at, updated_at | `actual_dwell_days` is computed in the API, not stored |
| `shipment_events` | id, shipment_id FK, actor_user_id FK, event_type, from_status null, to_status, occurred_at, recorded_at, note null | Append-only |
| `prediction_runs` | id, shipment_id FK, requested_by FK, idempotency_key, input_hash, predicted_dwell_days, predicted_clearance_at, currency, total_estimated_cost numeric null, total_is_partial bool, cost_breakdown jsonb, explanation jsonb, capacity_snapshot jsonb, warnings jsonb, input_snapshot jsonb, model_version, dataset_version, tariff_rule_versions jsonb, data_source, is_demo_data bool, created_at | Unique (shipment_id, idempotency_key). Immutable |
| `capacity_forecasts` | id, port_id FK, resource_type, bucket_start, bucket_end, predicted_occupied numeric, total_capacity numeric, utilization_pct numeric, source_type, model_or_rule_version, generated_at | Unique (port_id, resource_type, bucket_start, model_or_rule_version) |
| `tariff_rules` | id, rule_type, port_id null, hs_code_prefix null, shipping_line null, cargo_type null, container_size_ft null, rate_type, rate_value numeric(18,4), currency, free_days null, tier_config jsonb null, valid_from date, valid_to date null, source_note, version, is_active bool, created_by, created_at | Check valid_to > valid_from, rate_value >= 0. Never deleted |
| `audit_logs` | id, actor_user_id, action, entity_type, entity_id, before jsonb null, after jsonb null, request_id, created_at | Append-only |

Indexes: shipments(owner_user_id, created_at), shipments(port_id, status, expected_arrival_at), shipment_events(shipment_id, occurred_at), prediction_runs(shipment_id, created_at), capacity_forecasts(port_id, resource_type, bucket_start), tariff_rules(rule_type, valid_from, valid_to).

Seed (`scripts/seed_dev.py`, idempotent, dev only, all labelled demo): 2 ports; users `importer@portiq.demo`, `importer2@portiq.demo`, `operator@portiq.demo` (both ports), `operator2@portiq.demo` (INNSA only), `admin@portiq.demo`; demo tariffs (section 12); 12 shipments across statuses with events (one cleared with actual times).

## 7. Authentication and authorization

**Token verification (`AUTH_MODE=supabase`):** verify the signature using the JWKS from `SUPABASE_JWT_JWKS_URL`, verify issuer, audience, expiry and required claims; use `sub` as the user id. Do not just decode the payload. Cache the JWKS with a sensible TTL. If the Supabase project uses a legacy shared secret instead of JWKS, log a CONTRACT-GAP and stop for the human.

**Dev mode (`AUTH_MODE=dev`):** the bearer token is `dev:<email>` for a seeded user, for example `dev:operator@portiq.demo`. The user id is looked up from `profiles`; the role still comes from `profiles`. This mode exists only for local development and tests (refuse startup otherwise, test this).

**Profile provisioning:** if a valid token's user has no profile, create one with role `importer_exporter`. This is the only automatic path and cannot create operator or admin.

**Dependencies:** `get_current_user`, `require_role(*roles)`, and per-resource checks in the service layer. Every shipment operation authorizes the specific shipment (owner for importers, `operator_ports` for operators).

| Endpoint | importer | operator | admin |
| --- | --- | --- | --- |
| `/me`, `PATCH /me`, `/config`, `/ports` | yes | yes | yes |
| `GET /shipments` | own | scoped (read) | 403 |
| `GET /shipments/summary` | own | 403 | 403 |
| `POST /shipments`, `PATCH /shipments/{id}` | own | 403 | 403 |
| `GET /shipments/{id}` | own | scoped | 403 |
| `POST /shipments/{id}/events` | 403 | scoped | 403 |
| `POST /shipments/{id}/prediction`, `GET .../predictions[/{pid}]` | own | scoped | 403 |
| `GET /capacity/forecast` | yes | scoped ports | all ports |
| `GET /operator/*` | 403 | scoped | all ports |
| `/admin/*` | 403 | 403 | yes |

`GET /ports` returns: importers all ports; operators their assigned ports; admin all. The importer's `assigned_port_ids` in `/me` is `[]`.

Mandatory authorization tests: no token on every protected route returns 401; importer A cannot read, patch, predict or list importer B's shipment (404); importer cannot call operator or admin routes (403); an operator cannot access a shipment or capacity outside their ports; a role in the request body is ignored; self-promotion is impossible; tariff changes are admin only.

## 8. Endpoint behaviour (shapes come from frontend contract 5.3 and 5.4)

- `GET /me`: `{user_id, email, display_name, role, assigned_port_ids}`.
- `GET /shipments`: filters `status`, `arrival_from`, `arrival_to`, `q` (reference contains, case-insensitive). **Sorted by `created_at` descending.** Items are `Shipment` objects including `latest_prediction` (the newest prediction summary or null) and computed `actual_dwell_days` (`actual_cleared_at - actual_arrival_at` in days, rounded to 2 decimals, null unless both exist).
- `GET /shipments/summary`: **importer only** (operator and admin get 403). `{total, status_counts}` for the caller's own shipments (all three statuses present, zero where none). Operators get scoped counts from `/operator/overview`.
- `POST /shipments`: validates the body (frontend `ShipmentCreate`); port must exist and be permitted; creates the shipment with `status="submitted"`, owner from the token, and the first `shipment_events` row (`event_type="created"`, `to_status="submitted"`). Returns 201 with `ShipmentDetail`.
- `GET /shipments/{id}`: `ShipmentDetail` with `events` ordered by `occurred_at` ascending.
- `PATCH /shipments/{id}`: only `ShipmentPatch` fields, only when status is `submitted`, only the owner. Anything else returns 422 (unknown field) or 409 `STATE_CONFLICT` (not submitted). Returns the updated shipment.
- `POST /shipments/{id}/events`: scoped operator only. Allowed transitions: `submitted → arrived`, `arrived → cleared`. Others return 409 `STATE_CONFLICT`. Sets `actual_arrival_at` or `actual_cleared_at` from `occurred_at`; `occurred_at` cannot be in the future by more than 5 minutes and, for `cleared`, must not be before `actual_arrival_at`. Appends the event row and an audit log. A prediction never changes status.
- `POST /shipments/{id}/prediction`: section 13.
- `GET /shipments/{id}/predictions`: paginated `PredictionHistoryItem`, newest first. `GET .../predictions/{prediction_id}`: full `Prediction` as stored (never recomputed).
- `GET /capacity/forecast`: required `port_id`, `resource_type`, `from`, `to`. Range over 31 days returns 422 (field `to`). Port must be permitted. Returns the stored buckets ordered by `bucket_start`, paginated. Bucket validity rules in section 9.
- `GET /operator/overview` and `GET /operator/shipments`: section 14.
- Admin tariffs: section 12. `GET /admin/audit-logs`: paginated, newest first, `AuditLogItem`.
- `GET /health`: the standard success envelope with `data: {"status":"ok"}` and no secrets (decided after B01, CG-002). `GET /ready`: checks database connectivity and that the model is loaded; returns 503 if not.

## 9. Capacity simulator (`services/capacity_sim.py`)

Deterministic and seeded. Purpose: produce future daily buckets and the `forecast_capacity_utilization_pct` feature (used both when generating the dataset and at prediction time, so they match).

- Resources per port: `yard` with `total_capacity = 1000` container slots; `berth` with `total_capacity = 8` berth-slots per day. (INMUN: yard 1200, berth 10.)
- Starting occupancy (day 0): yard 65% and berth 55% of capacity.
- Per day `t`: `arrivals_t = Poisson(base_arrivals * seasonality(t))`; `departures_t = occupied_{t-1} / mean_dwell_days` with `mean_dwell_days = 2.0` (yard, a blend of import and export dwell) and `1.0` (berth); `occupied_t = occupied_{t-1} + arrivals_t - departures_t`. `base_arrivals` is chosen so the steady state is about 70% yard and 60% berth. `seasonality(t) = 1 + 0.15*sin(2π·dayofyear/365) + weekday effect (+0.08 Mon to Thu, -0.12 Sat and Sun)`.
- The RNG seed is derived from `(port_code, resource_type, date)` so results are reproducible.
- `utilization_pct = 100 * predicted_occupied / total_capacity`. If `total_capacity <= 0` the bucket is invalid and is never stored or served. If `predicted_occupied < 0` or `> 1.2 * total_capacity` the bucket is **flagged invalid and not served**, not smoothed.
- Every row has `source_type="synthetic"`, `model_or_rule_version="sim-1.0"`, `generated_at` (when generated).
- `scripts/seed_capacity.py --start YYYY-MM-DD --days N` fills `capacity_forecasts` (default: start today, 120 days, both ports, both resources). Re-running is idempotent.
- Function `utilization_for(port_code, resource_type, date)` returns the simulator value for a date (used by the dataset generator and the prediction service).

## 10. Synthetic data generator (`ml/scripts/generate_synthetic.py`)

Fixed seed (`--seed 42`), versioned (`dataset_version = "synthetic-v1"`), documented in `docs/data-dictionary.md`. **Write it once; do not change it after seeing model metrics.** Never describe the output as real port history.

- Rows: 10,000 main rows with arrival dates spread over 2025-01-01 to 2026-10-31. Output `ml/data/raw/synthetic_v1.csv`. Read `hs_chapter` as a string.
- **Calibration reference (real, aggregate):** commit the two supplied files as `ml/data/reference/port_dwell_2020.csv` (from `DGQI.csv`) and `ml/data/reference/port_dwell_2021.csv` (from `DGQI_2021.csv`). They hold monthly average dwell by port and Import/Export for 2020 and 2021 (16 rows per month group, 13 ports plus 3 regional averages; the 2021 XML file is an identical duplicate and is not needed). Record the source URL, download date and licence in `docs/data-dictionary.md` (check the licence on the source page). Values are believed to be **hours** (confirm on the source page). They are used **only** to calibrate the generator's port-level means and to run the calibration check and the disruption stress scenario. They are aggregates, not individual-container ground truth, and must never be described as such. Known data quirks: some port/category pairs are missing (for example Kandla export, NMPT export has 4 months): missing is not zero. April to June 2020 is a COVID lockdown disruption (JNPT import 50 to 65 h against about 21 h normally; NMPT import 308 h in April 2020).
- Input distributions (documented ranges): `port_code` (INNSA 60%, INMUN 40%); `direction` (import 60%, export 40%); `cargo_type` (general_container 70%, reefer 15%, hazardous 8%, oversized 7%); `container_size_ft` (20: 35%, 40: 65%); `hs_chapter` from a fixed list of 20 chapters including "02","08","29","84","85" with weights; `weight_kg` lognormal within 500 to 40000; `shipping_line` (A 30, B 25, C 20, D 15, other 10); `vessel_size_band` (small 25, medium 45, large 30); `documentation_status` (complete 70, incomplete 20, unknown 10); `forecast_capacity_utilization_pct` taken from the capacity simulator for the arrival date and port (yard).
- **Target `dwell_days`** is not a deterministic function of one feature. Build it multiplicatively:
  `dwell = base(port, direction) × cargo × documentation × congestion × hs_inspection × weight × weekend × shipping_line × noise`
  - `base(port, direction)` in days, from the 24 months of 2020 and 2021 **excluding Apr to Jun 2020** (JNPT = Nhava Sheva = INNSA; APSEZ = Adani Ports and SEZ, Mundra = INMUN; confirm the mapping): INNSA import 0.87 (20.9 h), INMUN import 1.17 (28.1 h), INNSA export 3.14 (75.4 h), INMUN export 5.18 (124.4 h). Real month-to-month variation in these means is small (for example JNPT import standard deviation about 2.7 h), so do **not** add a month effect.
  - cargo: general 1.0, reefer 0.85, hazardous 1.5, oversized 1.8. documentation: complete 1.0, incomplete 1.8, unknown 1.3. congestion: `1 + 0.012 × max(0, utilization − 70)`. hs_inspection: chapters "29","30" ×1.2, "84","85" ×1.1, others 1.0. weight: `1 + weight_kg / 200000`. weekend arrival ×1.15. shipping line: D ×1.1, other ×1.25, others 1.0.
  - `noise` is lognormal with sigma 0.6 (container dwell is heavy-tailed: mean above median).
  - After generating, rescale per (port, direction) so the dataset mean equals the base value above (this is the calibration step). Clip to [0.1, 30] days. Document every coefficient.
- **Calibration check** (in `evaluate.py` or a separate script): compare the simulated mean dwell per port and direction with the reference means, for 2020 (excluding Apr to Jun) and for 2021 separately, and report the percentage difference (target: within 15%). Report both years, because the real means differ between years (for example Mundra import 31.2 h in 2020 against 25.8 h in 2021). This checks the data, not the model's accuracy, and the report must say so. The container-level spread (noise sigma 0.6) cannot be derived from monthly averages: state that it is an assumption.
- A separate **stress holdout** file `synthetic_v1_stress.csv` (1,500 rows, different seed): high utilization (75 to 98%), unknown/other shipping line 30%, rare categories (hazardous and oversized 35%), incomplete/unknown documentation 50%, plus some weights near the extremes. Same generator code, shifted parameters. Also include a **disruption scenario** (about 20% of stress rows): multiply import dwell by a factor drawn between 2.0 and 3.0, based on the Apr to Jun 2020 lockdown months in the reference data (JNPT import 50 to 65 h against about 21 h normal).
- Edge scenarios are included in both files: unknown documentation, high and low capacity, rare cargo, `other` shipping line, extreme weights.

## 11. Training, evaluation, artifact, SHAP

Scripts: `prepare_data.py` (validate schema, ranges, no nulls in features, `hs_chapter` as string, derive `arrival_day_of_week` and `arrival_month`), `train.py`, `evaluate.py`.

1. **Split by time order before fitting anything:** sort by arrival date; first 70% train, next 15% validation, last 15% test. The stress file is a second, separate test set. Fit all preprocessing only on training data.
2. **One scikit-learn `Pipeline`:** `ColumnTransformer` (OneHotEncoder with `handle_unknown="ignore"` for categoricals, numerics passed through) followed by `RandomForestRegressor` (fixed `random_state`). Tune hyperparameters on the validation set only.
3. **Baseline:** median dwell of the training set. Compare on test and on stress.
4. **Metrics:** MAE (primary, days), RMSE, R², sample sizes, baseline metrics, for test and stress, plus per-category MAE (direction, port_code, cargo_type, shipping_line, documentation_status). Inspect residuals, negative or extreme predictions, and out-of-range inputs.
5. **Selection rule:** the Random Forest is used only if its MAE beats the baseline MAE on **both** test and stress. Otherwise the served model is the baseline (`model_version = "dwell-baseline-1.0.0"`, `explanation.status = "unavailable"` with a reason) and the model card says so plainly.
6. **Artifacts** (in `ml/artifacts/`): `dwell_model_<version>.joblib` (full pipeline) and `model_metadata_<version>.json` with: model_version, dataset_version, created_at, target_name and units, feature_schema and preprocessing schema, numeric training ranges (min and max per numeric feature), evaluation_metrics, baseline_metrics, training_source_type `synthetic`, limitations, intended use. Do not commit model files unless the human says so.
7. **Model card** `docs/model-card.md`: target definition, dataset and version, features, split strategy, metrics (honest), limitations, intended use, training timestamp. State that performance on synthetic data does not indicate real-world accuracy.
8. **Inference (`model_service.py`):** load the pipeline and metadata once at startup. Build the input row from the shipment and the simulator utilization. Reject NaN, Infinity or negative output (503 `MODEL_UNAVAILABLE`). Missing artifact means `/ready` returns 503 and predictions return 503.
9. **SHAP (`explain.py`):** `shap.TreeExplainer` on the fitted forest using the transformed features. Aggregate the one-hot SHAP values back to the original feature names by summing. Return `{status:"available", method:"SHAP", base_value_days, unit:"days", features:[{name, value, contribution}]}` with **all 12 features** and `value` as the original (untransformed) input. Test additivity: `base_value + sum(contributions)` equals the model prediction within 1e-3 days. If SHAP fails, the prediction still returns with `explanation.status="unavailable"`, `features=[]`, a reason, and an `EXPLANATION_UNAVAILABLE` warning. Never fabricate contributions.

## 12. Cost engine (`services/cost_engine.py`) and tariffs

Decimal arithmetic only. Pure functions that are easy to unit test.

- **Rule selection** for a component: active rules with the right `rule_type`, `valid_from <= effective_date <= valid_to` (or `valid_to` null), and every non-null scope field matching (port, `hs_code` startswith `hs_code_prefix`, shipping line, cargo type, container size). `effective_date = expected_arrival_at` date in the port timezone. If several match, the **most specific** (most non-null scope fields) wins. If two share the top specificity, the line is `unavailable` with reason "Ambiguous tariff rules". Rule currency must equal the shipment currency, otherwise `unavailable`.
- **Components and formulas:**
  - `customs_duty` (rate_type `percent_of_value`): `declared_value * rate_value / 100`.
  - `port_storage` and `demurrage` (`per_day`): `chargeable_days * rate_value`; (`tiered`): marginal tiers over `chargeable_days`; (`flat`): `rate_value`.
  - `chargeable_days = ceil(max(0, predicted_dwell_days - free_days))`; `free_days` null means 0.
  - `other_charge` is included **only** if a rule matches (for example the hazardous surcharge). If none matches, omit the line (it is not applicable).
  - `tier_config`: `{"tiers":[{"up_to_days":3,"rate":"1000.00"},{"up_to_days":null,"rate":"2000.00"}]}`; day `n` is charged at the tier covering it.
- **Core lines** `customs_duty`, `port_storage`, `demurrage` always appear. No matching rule means `{amount:null, status:"unavailable", reason:"No active <component> rule for <scope> on <date>", rule_version:null}` and a `TARIFF_MISSING` warning. Zero is never used for a missing rule.
- **Total:** sum of lines with `status="estimated"`; `total_is_partial = true` if any core line is unavailable; `total_estimated_cost = null` if no line was estimated.
- **Demo seed tariffs** (free days are short on purpose, because the calibrated import dwell is only about 1 day; real free periods vary by port and carrier) (all `source_note="Demo tariff data"`, valid from 2026-01-01, currency INR, global port scope):
  - customs_duty, percent_of_value, by HS prefix: `85` 10.00, `84` 7.50, `29` 5.00, `02` 30.00, `08` 20.00. (Other chapters have no rule, on purpose, to demonstrate a partial result.)
  - port_storage, per_day, free_days 1: container 20 ft rate 400.00, 40 ft rate 700.00.
  - demurrage: Line A tiered (free_days 1; up to 3 chargeable days 1000.00, after that 2000.00); Line B per_day 1500.00 free 2; Line C per_day 1800.00 free 1; Line D per_day 2200.00 free 1. `other` has no rule.
  - other_charge: flat 5000.00 for cargo_type hazardous.
- **Admin endpoints:** `GET /admin/tariffs` with filters (`rule_type`, `port_id`, `hs_code_prefix`, `shipping_line`, `is_active`, `valid_on`), paginated. `POST` creates a new rule version (validate `valid_to > valid_from`, `rate_value >= 0`, `source_note` present; reject with 409 `TARIFF_CONFLICT` if an active rule with the same `rule_type` and identical scope tuple has overlapping validity, and return the conflicting rule in `details`). `PATCH /admin/tariffs/{id}` accepts `{"is_active": false}` only. No delete. Every create and deactivate writes an `audit_logs` row with before and after.
- Past predictions keep the rule versions they used (stored in the snapshot); changing tariffs never alters stored predictions.

## 13. Prediction orchestration (`services/prediction.py`)

`POST /shipments/{id}/prediction`, header `Idempotency-Key` required (missing or not a UUID means 422).

1. Authorize the shipment (owner or scoped operator) and apply the rate limit.
2. Compute `input_hash` from the shipment's prediction inputs. Look up `(shipment_id, idempotency_key)`: same hash returns the stored prediction (200); different hash returns 409 `IDEMPOTENCY_CONFLICT`.
3. Capacity snapshot: look up the `yard` bucket containing `expected_arrival_at` for the shipment's port. Found: `{status:"available", resource_type:"yard", utilization_pct, source_type, bucket_start, bucket_end}`. Not found: `{status:"unavailable", reason:"No forecast for the expected arrival date", ...null}` plus a `CAPACITY_UNAVAILABLE` warning. The model feature `forecast_capacity_utilization_pct` uses the stored bucket when found, else the simulator function.
4. Run the model (with the timeout). Compute `predicted_clearance_at`.
5. Run SHAP (failures isolated as above).
6. Run the cost engine.
7. Warnings: `DEMO_DATA` always (message "Rates and model are for planning demonstration only."); `OUT_OF_RANGE_INPUT` if a numeric input is outside the training range in the metadata; `TARIFF_MISSING`, `CAPACITY_UNAVAILABLE`, `EXPLANATION_UNAVAILABLE` as described.
8. Persist an immutable `prediction_runs` row and return 201 with the full `Prediction` (including `provenance`: model_version, dataset_version, tariff_rule_versions, generated_at, data_source `synthetic`, is_demo_data `true`).
9. Do not change shipment status. A rerun with a new key creates a new row.

## 14. Operator overview and at-risk

- **Scope:** operators see their `operator_ports`; admin sees all ports. `port_scope` lists them.
- `GET /operator/overview?from&to&port_id`: `from` and `to` default to today and today + 14 days (max 31 days). `status_counts` over shipments in scope with expected arrival in range. `utilization.yard` and `.berth` are the stored buckets for the selected port (`port_id` or the first port in scope, which must be in scope). `at_risk` and `at_risk_count` over non-cleared shipments in scope and range. `dwell_distribution`: bins of 1 day (0 to 14, plus a final 14+ bin) over the latest prediction per shipment in scope and range.
- **At-risk reasons** (only for shipments not `cleared`):
  - `FORECAST_THRESHOLD_CROSSED`: any yard bucket from the arrival day to the predicted clearance day has `utilization_pct >= 85`. Message: "Forecast yard utilization reaches <n>% during the expected stay."
  - `DWELL_ABOVE_THRESHOLD`: the latest prediction exceeds 3.0 days. Message: "Predicted dwell of <n> days exceeds <t> days."
  - `DOCUMENTATION_INCOMPLETE`: `documentation_status = "incomplete"`. Message: "Documentation is incomplete."
- `GET /operator/shipments`: filters `status`, `arrival_from`, `arrival_to`, `min_predicted_dwell_days`, `warning_code` (matches the latest prediction's warning codes), `at_risk` (bool); paginated; rows are `OperatorShipmentRow`. Importers get 403.
- Never return counts or rows outside the operator's ports.

## 15. Features (build one per session)

Each lists scope, tests, and the human check. Always: lint (`ruff`), types (`mypy`), tests (`pytest`) must pass with real output shown.

### B01 · Scaffold
Needs nothing. Create the layout, config (env vars), logging, request id middleware, error handlers and envelopes, CORS, `/health` and `/ready`, `docker-compose.yml` for local Postgres (and README instructions for a local install without Docker), Alembic setup, pytest/ruff/mypy config, `.env.example`, `requirements.txt` with verified pinned versions, `README.md`.
Tests: error envelope shapes, request id header, 404 and 422 shapes, CORS.
Human check: `uvicorn app.main:app --reload` runs; `http://localhost:8000/health` returns ok; `http://localhost:8000/docs` opens; tests pass.

### B02 · Database, migrations, seed
Needs B01. Implement section 6 as SQLAlchemy models and Alembic migrations (enums, constraints, indexes, RLS enabled with no policies), repositories, `seed_dev.py` (users, ports, tariffs from section 12, 12 shipments with events).
Tests: constraints reject bad data (weight 0, bad hs_code, valid_to before valid_from), migrations apply from empty, seed is idempotent.
Human check: `alembic upgrade head` then `python scripts/seed_dev.py`; inspect the tables in a DB client; run the seed twice.

### B03 · Auth, profiles, config, ports
Needs B02. Section 7: JWKS verification, dev mode with its startup guard, auto profile creation, `get_current_user`, `require_role`, `GET /me`, `PATCH /me`, `GET /config`, `GET /ports`.
Tests: every mandatory authorization test that applies so far; dev-mode guard; invalid, expired and wrong-audience tokens return 401; `PATCH /me` validation.
Human check: in `/docs` use Authorize with `dev:importer@portiq.demo`, call `/me`; try `dev:admin@portiq.demo`; call without a token and confirm 401; try a made-up dev user.

### B04 · Shipments and events
Needs B03. All shipment endpoints and events (sections 7 and 8), summary, filters, pagination, audit on events.
Tests: create, list (sorted newest first, filters, pagination), detail, PATCH allowlist and state rule, cross-user 404s, operator scope, transition rules, computed `actual_dwell_days`, duplicate reference 422.
Human check: create a shipment in `/docs` as importer; list it; try to read it as `importer2` (404); record events as the operator and watch status change; try an invalid transition (409).

### B05 · Capacity simulator and forecast endpoint
Needs B02, B03. Section 9: `capacity_sim.py`, `seed_capacity.py`, `GET /capacity/forecast`.
Tests: determinism (same inputs, same outputs), invalid-bucket rules, 31-day cap, port scope, empty result is an empty list.
Human check: run the seed, call the endpoint for yard and berth, confirm daily buckets and `utilization_pct` values between about 40 and 100, and a 40-day range returns 422.

### B06 · Synthetic data and training
Needs B05. Section 10 and 11 (steps 1 to 7). Scripts in `ml/scripts/`, model card, data dictionary. Report metrics honestly (test and stress, baseline and model, per category). Apply the selection rule.
Tests: reproducibility (same seed, same file hash), schema and range validation, `hs_chapter` stays a string, no preprocessing fitted on test rows, artifact loads and predicts.
Human check: read the metrics report and model card yourself; confirm the baseline comparison and the stress results are shown; note whether the forest was selected or the baseline.

### B07 · Model service and SHAP
Needs B06. Section 11 steps 8 and 9: `model_service.py`, `explain.py`, load at startup, `/ready` reflects the model.
Tests: model-missing returns 503, NaN and negative rejection, SHAP additivity, SHAP failure isolation, original feature values returned.
Human check: call an internal test script or the temporary debug route listed in the report to see a prediction and contributions that add up; remove any debug route afterwards.

### B08 · Cost engine and tariff admin
Needs B02, B03. Section 12: engine, endpoints, audit, seed rules.
Tests: every formula, free days, tiers, ceil, most-specific selection, ambiguity, currency mismatch, missing rule gives unavailable (never 0), conflict on create (409 with details), no delete, admin-only access, audit rows.
Human check: in `/docs` as admin, list rules, create a new version, create a conflicting one (409), deactivate; confirm importer gets 403.

### B09 · Prediction orchestration
Needs B04 to B08. Section 13 plus history endpoints and `latest_prediction` on shipments.
Tests: full path; partial cost (a shipment with shipping line `other`); explanation unavailable; capacity unavailable; idempotency same key twice returns the same id; changed inputs with the same key returns 409; rate limit 429; timeout 503; snapshot immutability after a tariff change; operator can predict only in scope; status unchanged by a prediction.
Human check: run a prediction in `/docs` with a new UUID key twice; compare IDs; change the shipment and reuse the key; change a tariff and confirm an old prediction's numbers don't change.

### B10 · Operator, hardening, contract tests
Needs B09. Section 14 endpoints; per-user rate limit; request body size and date-range caps; `export_openapi.py` writing `docs/openapi.json`; **contract tests**: load the example payloads from `apps/web/lib/mocks` (copy them into `tests/fixtures/` with a note) and validate that every response model serializes to the same field names and types; full authorization test matrix from section 7.
Tests: at-risk rules, scope isolation, distribution bins, contract tests, all auth denials.
Human check: as the operator, open overview; confirm only assigned ports appear; try the importer (403); read the contract test results.

### B11 · Integration with the frontend and Supabase
Needs everything. Human steps first (section 18), then: set the API to `AUTH_MODE=supabase`, point the frontend at it (`NEXT_PUBLIC_USE_MOCKS=false`), run a full manual pass.
The agent's part: verify the JWT settings against the real project, write `docs/architecture.md`, `docs/security-checklist.md`, the final README, and a smoke-test script that signs in with a real Supabase user and calls `/me`, creates a shipment, runs a prediction.
Human check: sign up in the UI; confirm an importer profile is created; run the whole importer flow; confirm the operator account (assigned by you with a SQL insert) sees only its ports.

## 16. Definition of done (every feature)
Protocol followed; real command output shown; authorization and validation tested; no secrets committed; no fabricated values; money never a float; UTC everywhere; `CONTRACT_GAPS.md` updated; README commands work from a clean clone.

## 17. Time plan (about 4 weeks from 5 Nov; deadline early Dec)

| Dates | Work |
| --- | --- |
| 5 to 8 Nov | B01, B02, B03 |
| 9 to 11 Nov | B04, B05 |
| 12 to 16 Nov | B06, B07 (model work needs the most care) |
| 17 to 19 Nov | B08 |
| 20 to 23 Nov | B09 |
| 24 to 26 Nov | B10 |
| 27 to 30 Nov | B11 integration, fix bugs |
| 1 to 4 Dec | Buffer, demo script, report, slides |

If you fall behind, cut in this order: (1) rate limiting, (2) `PATCH /shipments`, (3) operator shipment filters beyond status and arrival window, (4) audit log endpoint, (5) the dwell distribution chart data. Never cut authorization tests, the baseline comparison, honest metrics or the missing-tariff behaviour.

## 18. Human setup before B11
1. Create a free Supabase project. Note the project URL.
2. In Authentication settings, check how tokens are signed (look for JWT signing keys / JWKS). Note the JWKS URL, issuer and audience (`authenticated`).
3. In Project Settings, copy the Postgres connection string for `DATABASE_URL` (use the pooled string if told to).
4. Put the public URL and publishable key into the frontend `.env.local`. Put the server values into the API `.env`. Never commit them.
5. Run `alembic upgrade head` and `seed_dev.py` against the Supabase database. Create operator and admin users by signing up, then change their `role` in `profiles` with SQL, and add `operator_ports` rows.
6. Add the frontend origin to `ALLOWED_ORIGINS`.
