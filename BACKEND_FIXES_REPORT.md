# PortIQ backend and ML — check, fixes and Supabase setup (2026-11-22)

Scope: the Dockerised FastAPI backend (`services/api`), the ML pipeline (`ml/`) and the Supabase sign-in wiring.
The OneDrive copy of the project is now the one Docker runs.

## Result

| Check | Before | After |
|---|---|---|
| Backend tests (pytest, in Docker against Postgres 15) | 114 passed, **5 failed** | **121 passed, 0 failed** (+2 new tests) |
| `/ready` | 503 `MODEL_UNAVAILABLE` | `ready` — database ok, model loaded |
| Live prediction | 503 (no model) | 1.97 days, SHAP explanation available and adding up exactly |
| SHAP explanation with the served v2 model | always "unavailable" | available |
| ruff | clean | clean |
| mypy | 26 errors | 26 errors (all from before; none added) |
| Container source | `D:\portiq\portiq-main` | this OneDrive copy |

## What was found and how each one was fixed

### 1. No trained model, which caused 4 of the 5 failing tests and the 503
- **Cause:** `ml/artifacts/` was empty in both copies, so the API started with "Model file not found".
- **Measure:** ran the real pipeline in Docker, using the **API's own image**:
  1. `generate_synthetic_v2.py`
  2. `prepare_data.py --version v2`
  3. `train.py --version v2`

  Using the API image means the model is trained with the exact scikit-learn and joblib versions that load it. A
  version mismatch is the usual reason a joblib model refuses to load.
- **Output:** `ml/artifacts/dwell_model_v2.joblib` (1.7 MB) and its `.meta.json`. `ml/data/` is regenerated
  (git-ignored). The scores match the committed report exactly (test MAE 0.611, stress 1.327 days). Because the
  random seed is fixed, the run is reproducible. The serve decision is MODEL: it beats both baselines.

### 2. SHAP explanations broke with the v2 model (the fifth failing test, and a live bug)
- **Cause:** `app/services/explain.py` only understood the v1 file, a plain `Pipeline(preprocessor, regressor)`.
  The v2 file that Docker serves is a dictionary bundle whose `point_model` is
  `Pipeline(prep → TransformedTargetRegressor(HistGradientBoosting, log1p/expm1))`. That gave an `AttributeError`,
  so every prediction's explanation said "unavailable". On top of that, the v2 model predicts in log space, so raw
  SHAP values add up to `log1p(days)`, not to days.
- **Measure:** the explainer now unwraps both layouts and, for the log-target model:
  - **checks integrity first**, in the model's own units. SHAP base + contributions must equal the tree's raw
    output, otherwise it reports "unavailable" as before. Contributions are still never invented.
  - **converts to days.** The base is turned back with `expm1(base)`, and the gap between base and prediction is
    shared out in proportion to each feature's log-space SHAP value. Signs and ranking are kept, and the result
    adds up exactly. The existing days-level check still runs on top.
  - **folds in the fixed inputs.** The five v2-only inputs, which the API always fills with fixed defaults, go into
    the base value, so the API contract keeps its 12 features.
  - v1 files still work exactly as before.

### 3. `app/main.py` crashed at start-up without `MODEL_PATH`
- **Cause:** it found the model folder with `Path(__file__).parents[3]`. In the Docker layout
  (`/app/app/main.py`) there aren't three parent folders, so it raised `IndexError` and the app never started.
  Compose happened to set `MODEL_PATH`, which hid the bug.
- **Measure:** it now walks up with `.parent`, which never raises. A shallow path just doesn't find the file, and
  the API starts with the model marked unavailable (503 on predictions) instead of crashing. The default file is
  now `dwell_model_v2.joblib`, the same one Compose uses, so tests and Docker load the same model.

### 4. `docker-compose.yml`: health check on the wrong service
- **Cause:** the `pg_isready` health check sat on the API container. The slim Python image doesn't include
  `pg_isready`, so the API would always be reported unhealthy. The database had no health check, so the API
  could start before Postgres was ready.
- **Measure:** the health check moved to the `db` service, where `pg_isready` exists. The API now uses
  `depends_on: db: condition: service_healthy`, so it starts only once Postgres accepts connections.

### 5. `ml/scripts/train.py` saved v1 under the v2 name
- **Cause:** the save path was hard-coded as `dwell_model_v2.joblib`, so `train.py --version v1` silently
  overwrote the v2 model.
- **Measure:** the path is now `dwell_model_{version}.joblib`. The `.meta.json` already used the version name.

### 6. `services/api/.env` was missing, so `docker compose up` failed from this copy
- **Measure:** created it (git-ignored), with today's settings and the Supabase section described below.

### 7. Docker ran a different copy of the project
- **Cause:** the containers were built from `D:\portiq\portiq-main`. That copy also has its own bug: `ml.py`
  reads `self.model['poin_model']` (a typo), which would crash every prediction once a model loads.
- **Measure:** the containers were rebuilt and recreated from this OneDrive copy, which never had the typo. The
  database volume `api_portiq-pgdata` was reused, so **no data was lost**. `docker compose ls` now lists only the
  OneDrive compose file. The D: copy was not modified. It is no longer used and can be archived or deleted.

### 8. Found on the way: `/load-planner` missing from the frontend's protected routes
- **Cause:** `apps/web/middleware.ts` keeps its own list of signed-in-only routes, and the new Load planner tab
  wasn't in it. With real Supabase on, a signed-out visitor would see the page shell.
- **Measure:** added `/load-planner` to the list.

## Supabase: ready for your keys

The sign-in code was already complete: the frontend uses `@supabase/ssr`, and the backend verifies tokens
against the project's JWKS (signature, issuer, audience, expiry) and creates a profile on first login. The tests
for all of this pass. What was missing was configuration, and the backend needed three URLs that are really one
value.

**Boilerplate added:**
- **Backend derives everything from the project URL.** With `AUTH_MODE=supabase` you only set `SUPABASE_URL`; the
  backend works out:
  - the JWKS URL: `<url>/auth/v1/.well-known/jwks.json`
  - the issuer: `<url>/auth/v1`
  - the audience: `authenticated`

  Explicit `SUPABASE_JWT_*` values still override these. Two new tests cover it
  (`tests/test_config.py`).
- **`services/api/.env`**, with step-by-step comments. It defaults to `AUTH_MODE=dev`, so nothing changes yet.
- **`apps/web/.env.local`**, with placeholders for the Supabase URL and publishable key. It defaults to mocks on.
- **`.gitignore`** now covers `.env.local` and `.env.*.local`. Before this, `.env.local` was not ignored.
- `services/api/.env.example` is updated to explain the derived values.

**To switch it on (only keys to paste):**
1. In the Supabase dashboard, open Project Settings → API and copy the **Project URL** and the
   **publishable (anon) key**.
2. In `apps/web/.env.local`:
   - set `NEXT_PUBLIC_SUPABASE_URL=<project URL>`
   - set `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>`
   - set `NEXT_PUBLIC_USE_MOCKS=false`
3. In `services/api/.env`:
   - set `AUTH_MODE=supabase`
   - set `SUPABASE_URL=<the same project URL>`
4. Restart the API with `docker compose up -d --build api` (from `services/api`), then restart `npm run dev`. If
   you start the web app through the preview config that forces `NEXT_PUBLIC_USE_MOCKS=true`, start it with
   plain `npm run dev` instead.
5. Optional check: `scripts/smoke_supabase.py` signs in with a real user, calls `/me`, creates a shipment and runs a
   prediction.

**Requirement:** the project must use Supabase's asymmetric JWT signing keys (the default for new projects). The
API verifies RS256/ES256 tokens through JWKS. Old projects that still sign with the legacy shared secret (HS256)
need their signing keys migrated in the Supabase dashboard first.

**Not checked:** a real Supabase project, because there are no keys yet.

## Development progress

**Backend:**
- **B01–B09 (done, tested):** config, database and migrations, auth (dev and Supabase), shipments and events,
  capacity simulator, model service, cost engine, prediction with explanation.
- **B10 (incomplete).** The frontend already calls these, and they work only with mock data:
  - `GET /operator/overview`
  - `GET /operator/shipments`
  - `GET /admin/audit-logs`
  - `GET /shipments/{id}/predictions/{prediction_id}`

  The backend instead has `GET /operator/dashboard/summary` and the list `GET /shipments/{id}/predictions`. The
  frontend contract tests are also missing.
- **B11 (written, not yet run for real):** Supabase docs and smoke script exist. The real-project check waits on
  your keys.
- **Code health:** 26 mypy type errors from before, mostly annotation gaps such as `admin.py` passing `str` where
  `Role` or `UUID` is expected. `datetime.utcnow()` deprecation warnings in `admin.py`.

**ML:**
- **Data and training (done):**
  - synthetic data generator, v1 and v2
  - data preparation with train / val / test / stress splits
  - a trainer that compares baselines, random forest and gradient boosting, with and without a log target
  - quantile range models with calibration
  - ablations, and an automatic decision whether to serve the model or the baseline
- **Model quality** (synthetic data only, so it says nothing about real-world accuracy):
  - test MAE 0.61 days against 0.94 for the best baseline
  - stress MAE 1.33 against 2.03
  - the 10th–90th percentile range covers 82% of test cases after calibration
- **Missing:** `ml/tests/` is empty, so there are no unit tests for the ML scripts. There is also no real dataset.

## Files changed

| File | Change |
|---|---|
| `services/api/app/main.py` | start-up path no longer crashes; default model is v2 |
| `services/api/app/services/explain.py` | SHAP works with the v2 bundle and log target |
| `services/api/app/core/config.py` | Supabase JWKS/issuer/audience derived from `SUPABASE_URL` |
| `services/api/tests/test_config.py` | 2 new tests for the derivation |
| `services/api/docker-compose.yml` | health check on `db`; API waits for a healthy database |
| `services/api/pyproject.toml` | sklearn added to mypy's untyped-library list |
| `services/api/.env` *(new, git-ignored)* | local settings and Supabase section |
| `services/api/.env.example` | documents the derived Supabase values |
| `ml/scripts/train.py` | saves `dwell_model_{version}.joblib` |
| `ml/artifacts/dwell_model_v2.joblib`, `.meta.json` *(new, git-ignored)* | trained model |
| `ml/reports/metrics_v2.json` | rewritten by the training run (same numbers) |
| `apps/web/middleware.ts` | `/load-planner` is protected |
| `apps/web/.env.local` *(new, git-ignored)* | Supabase placeholders, mocks on |
| `.gitignore` | ignores `.env.local` / `.env.*.local` |

## How the tests were run

The suite only accepts a local database named `portiq_test`. It was run in a throwaway container from the API
image that shares the Postgres container's network, so `localhost:5432` is the real database. Only `portiq_test`
is reset; the `portiq` dev data is untouched:

```powershell
docker run --rm --network container:portiq-db `
  -v "${PWD}\services\api:/repo/services/api" -v "${PWD}\ml:/repo/ml:ro" `
  -w /repo/services/api api-api python -m pytest -q
```

Run it from the repo root. Mounting the code at `/repo/services/api` mirrors the repo layout.

---

# Part 2 — the four missing B10 endpoints (2026-11-22)

The frontend already called these. Until now they worked only against mock data.

## Result

| Check | Before | After |
|---|---|---|
| Backend tests | 121 passed | **140 passed**, 0 failed (+19 new) |
| ruff | clean | clean |
| mypy | 26 | 26 (none added) |
| Endpoints checked live in Docker against the dev database | — | all four return the contract shape, and their denials (401/403/404) behave correctly |

## What was built

### `GET /shipments/{id}/predictions/{prediction_id}`
- Returns one stored prediction in exactly the shape `POST …/prediction` returns. The spec says "as stored, never
  recomputed".
- **Measure:** the POST's response builder moved into `_prediction_payload()`, and both routes use it. A live
  check confirmed the GET body equals the POST body.
- **Access:** the owner, or an operator for that port (the same `_visible_shipment` rule as the other shipment
  routes). Another importer gets 404, the admin gets 403, no token gets 401. A real prediction id under the
  wrong shipment is also 404, so ids can't be probed across shipments.

### `GET /admin/audit-logs`
- Admin only. Newest first, paginated (`page`, `page_size` 1–100).
- Each row includes the actor's display name, joined from `profiles`, with the fields the frontend's
  `AuditLogItem` type expects.
- Importers and operators get 403.

### `GET /operator/shipments`
- Rows are `{shipment, at_risk_reasons, warning_codes}`, as in the frontend's `OperatorShipmentRow`.
- Filters:
  - `status`
  - `arrival_from` and `arrival_to`. `arrival_to` is inclusive, matching the end-of-day timestamp the frontend
    sends.
  - `min_predicted_dwell_days`
  - `warning_code` (matches codes in the latest prediction)
  - `at_risk=true|false`
- Paginated. Ordered by expected arrival, earliest first.
- **Scope:** operators see only their ports, the admin sees all, importers get 403.
- Bad input returns 422 with the field named, for example `arrival_to` before `arrival_from`, or an unknown
  warning code.

### `GET /operator/overview`
- Covers shipments expected in `[from, to)`. Defaults to today plus 14 days; the range must be at least one day
  and at most 31 days, otherwise 422 on `to`. The returned fields:
  - `port_scope`
  - `status_counts` (all three statuses)
  - yard and berth utilization buckets for the chosen port (`port_id`, or the first port in scope; a port
    outside scope gives 404)
  - `at_risk_count` and `at_risk`
  - `dwell_distribution`

### At-risk rules (spec section 14), in `app/services/at_risk.py`, shared by both operator endpoints

| Code | Rule | Message |
|---|---|---|
| `FORECAST_THRESHOLD_CROSSED` | any valid yard bucket from the arrival day to the predicted clearance day is at or above 85% | "Forecast yard utilization reaches N% during the expected stay." |
| `DWELL_ABOVE_THRESHOLD` | the latest prediction is above 3.0 days | "Predicted dwell of N days exceeds 3.0 days." |
| `DOCUMENTATION_INCOMPLETE` | `documentation_status = incomplete` | "Documentation is incomplete." |

How the rules are applied:
- Cleared shipments are never at risk.
- The stay starts on the actual arrival day once a shipment has arrived. With no prediction yet, the stay is
  just the arrival day.
- Yard buckets use the same validity rule as `/capacity/forecast`. That rule now lives in one place
  (`repositories/capacity.valid_bucket_conditions`), so the two can't drift apart.
- The capacity bucket serializer is shared too (`schemas/capacity.bucket_payload`), so overview buckets are
  exactly the same objects the Capacity page receives.

**Dwell distribution:** 1-day bins from 0 to 14, then a 14+ bin, built from each shipment's latest prediction.
Every bin is returned, zeros included, so the chart axis stays stable. The contract needs a number for the last
bin's end, so the 14+ bin ends at its longest dwell, rounded up (at least 15).

## Tests added (19)

- **`tests/test_at_risk.py`** (11 unit tests, no database):
  - each rule, including both exact edges: 85% counts as crossed, and exactly 3.0 days does not
  - a peak outside the stay or at another port is ignored
  - cleared shipments
  - reasons appear in spec order
  - the stay window uses actual arrival
  - warning codes
  - dwell bins, including the 14+ bin and an empty set
- **`tests/test_b10_endpoints.py`** (8 endpoint tests on the seeded demo data):
  - single prediction equals the POST response; denied to another importer, the admin and no token; wrong-parent
    and unknown ids give 404
  - audit logs are admin only, newest first, carry the actor's name, and have the contract field set; 403 for
    importer and operator; 401 without a token
  - operator shipments: port scope for one-port and two-port operators and the admin; 403 for importers;
    incomplete-documentation rows carry the reason; at-risk true and false together cover every row; status,
    arrival window and pagination; 422 on bad input
  - overview: contract field set, scope, counts that agree with `/operator/shipments` for the same window, 15
    bins, 404 for a port outside scope, 422 on the range, the 14-day default, admin access, importer 403

## Also done

- **Seeded demo capacity into the dev database.** It had none, so the overview utilization and the Capacity page
  were empty against the real API. I ran the README's own `scripts/seed_capacity.py --start 2026-10-15`, which
  adds 475 synthetic yard and berth buckets and skips any that exist. The overview now returns 30 days of yard
  data. The demo yard peak is 84.84%, just under the 85% threshold, so no forecast risk fires on this data.
- **Updated the status docs:** the root `README.md` status table, `services/api/README.md` and
  `docs/architecture.md`.

## Still not done (rest of spec B10)

- **Contract tests:** checks that each backend response matches the frontend mocks field for field.
- **`export_openapi.py`**, request-body size limits, and the full section 7 auth test matrix as one suite. The
  endpoints added here do test their own denials.
- **Not checked through the browser.** The real frontend needs Supabase keys to send a token, so the screens
  could not be driven against this API yet. The endpoints were checked with live HTTP calls instead.
- The older `GET /operator/dashboard/summary` route is kept as it was. The frontend doesn't use it.

## Files

New:
- `app/services/at_risk.py`
- `app/repositories/capacity.py`
- `tests/test_at_risk.py`
- `tests/test_b10_endpoints.py`

Changed:
- `app/api/v1/operator.py`: overview and shipments routes
- `app/api/v1/admin.py`: audit logs route
- `app/api/v1/shipments.py`: single-prediction GET and the shared payload builder
- `app/api/v1/capacity.py`: uses the shared validity rule and serializer
- `app/schemas/capacity.py`: `bucket_payload`
- `app/repositories/shipments.py`: `list_matching`
- `README.md`, `services/api/README.md`, `docs/architecture.md`

---

# Part 3 — B10 completed (2026-11-22)

## Result

| Check | Before | After |
|---|---|---|
| Backend tests | 140 passed | **172 passed**, 0 failed (+32 new) |
| ruff | clean | clean |
| mypy | 26 errors | **11** (the tariff routes are now typed; the rest are older modules) |
| B10 items left | 5 | **0** |

## What was done, item by item (spec B10)

| B10 item | Measure | Evidence |
|---|---|---|
| Section 14 endpoints | Done in part 2 | `tests/test_b10_endpoints.py`, `tests/test_at_risk.py` |
| Per-user rate limit | Already in place: 10 predictions/min/user, then 429 (spec 4.13) | `tests/test_predict.py` |
| Request body size cap | 1 MiB in `RequestContextMiddleware`. A declared oversize `Content-Length` is refused before the app runs. A streamed body is counted, and refused once it passes the cap. That raises a 413 `HTTPException`, the one error FastAPI's body reader re-raises (anything else becomes a 400). Both paths return the standard error envelope with the request id. Recorded as **CG-019**. | `tests/test_hardening.py` (declared, chunked, normal) |
| Date-range caps | Forecast and overview ranges were already capped at 31 days. `GET /shipments` now rejects a backwards arrival range with 422 (`/operator/shipments` already did). No span cap on list filters, because the spec doesn't give one and an invented cap could hide shipments. Recorded as **CG-020**. | `tests/test_hardening.py` |
| `export_openapi.py` | `scripts/export_openapi.py` writes `docs/openapi.json` (20 paths). It needs no database. | `docs/openapi.json` |
| Contract tests | `tests/fixtures/frontend_contract/*.json` holds 14 payloads generated from the frontend's TypeScript mocks (bundled with the installed esbuild, not hand-copied; a README explains). `tests/test_contract.py` builds one real response per type and compares field names (both directions, every level) and JSON types. A self-test proves the checker catches missing fields, extra fields and type changes. | 3 tests |
| Full section 7 auth matrix | `tests/test_auth_matrix.py` encodes the spec table: 20 routes × 3 roles, plus no-token 401. Separate checks make hidden resources (another importer's shipment, an operator outside the port) return 404 on every shipment route, capacity and overview. A guard fails if a new `/api/v1` route is missing from the matrix. | 22 tests |

## Found and fixed while doing it

- **Tariff routes rewritten.** The contract tests needed this, and it closes review finding 9.5 and the B08 gap.
  - They now use the committing `DbSession`, the `Role` enum, `AppError` and the standard envelope.
  - One `tariff_payload` serializer matches the frontend's `TariffRule`, with `rate_value` as a 2-decimal string.
  - Every spec filter works: `rule_type`, `port_id`, `hs_code_prefix`, `shipping_line`, `is_active`, `valid_on`.
  - A conflict returns 409 `TARIFF_CONFLICT` with the conflicting rule in both `details` and
    `conflicting_rule` (what the UI's conflict dialog reads).
  - The frontend's `version` label is accepted.
  - Input is validated at the boundary: HS prefix pattern, unknown port 422, blank source note,
    negative or non-decimal rate, `free_days >= 0`, `PATCH` accepts only `{"is_active": false}`.
  - Create and deactivate still write audit rows.
- **The unused `app.db.get_db` session helper was deleted.** It never committed; nothing uses it now.
- **The capacity router was mounted twice.** The OpenAPI export surfaced this as a duplicate operation
  id. The router is now mounted once.
- `error_response` gained an optional `extra` for contract fields such as `conflicting_rule`.

## Checked live (rebuilt container)

- `/ready` returns ready.
- `/admin/tariffs?rule_type=demurrage` returns 4 rules in the standard envelope, with `request_id`.
- A 1.1 MB body gets 413.
- A backwards `/shipments` range gets 422 with `field: arrival_to`.

## Files

New:
- `scripts/export_openapi.py`
- `docs/openapi.json`
- `tests/test_contract.py`
- `tests/test_auth_matrix.py`
- `tests/test_hardening.py`
- `tests/fixtures/frontend_contract/` (14 JSON files and a README)

Changed:
- `app/main.py`: body cap; capacity router mounted once
- `app/core/config.py`: `MAX_REQUEST_BODY_BYTES`
- `app/core/errors.py`: `extra` on `error_response`
- `app/api/v1/admin.py`: tariff routes rewritten
- `app/schemas/admin.py`
- `app/api/v1/shipments.py`: backwards-range 422
- `app/db.py`: unused `get_db` removed
- `tests/test_admin.py`
- `CONTRACT_GAPS.md`: CG-019, CG-020
- `README.md`, `services/api/README.md`, `docs/architecture.md`, `docs/security-checklist.md`,
  `docs/PROJECT_STATUS.md`

## Still open (not B10)

- **B11:** a live run with Supabase keys.
- **B06:** the model card, the data dictionary, `ml/tests/` and training ranges.
- **Not compared by the contract tests:** values, and every nullable variant. For example, an
  "unavailable" explanation has fewer fields than the mock's "available" example, and only the
  available case is checked.

---

# Part 4 — B06 completed (2026-11-22)

## Result

| Check | Before | After |
|---|---|---|
| Backend tests | 172 passed | **176 passed** (+4) |
| ML tests | none (`ml/tests` empty) | **15 passed** |
| ruff / mypy | clean / 11 | clean / 11 |
| Model scores | test 0.611, stress 1.327 | unchanged (the retrain reproduced them exactly) |
| Served prediction bias (test set) | **−0.42 days** | **+0.01 days** |

## What was done, item by item (spec B06, sections 10–11)

| Item | Measure |
|---|---|
| Spec baseline (training median) | Added as `global_median` (test 1.357, stress 2.658). The served decision still compares against the best baseline (the per port/direction median). |
| Per-category MAE (11.4) | `metrics_v2.json` → `per_category` for test and stress: model vs baseline by direction, port, cargo type, shipping line and documentation. The model wins in every category. |
| Prediction checks (11.4) | Negative / over-30-day predictions (none), residual bias (test +0.07, stress +0.63, because the stress disruption is invisible to the features), out-of-range input counts. |
| Metadata (11.6) | `model_metadata_v2.json` with every spec field: versions, `created_at`, target and units, feature schema with categories, preprocessing, numeric training ranges, evaluation and baseline metrics, `training_source_type: synthetic`, limitations, intended use, serve decision. It replaces the thin `.meta.json`. |
| `prepare_data.py` validation (11) | New `validate()`: required columns, no nulls (it used to drop rows silently), allowed category values, ranges (weight within (0, 60000], utilization 0–120, dwell 0.1–30), two-digit `hs_chapter`. It fails loudly. `hs_chapter` is read as text. |
| Calibration check (10) | New `evaluate.py` → `reports/calibration_v2.json`: all four port/direction means within 0.2% of the reference (by construction). It states that this checks data, not the model, and that the per-year check needs the missing reference files. |
| Tests | `ml/tests/test_pipeline.py`, 15 tests, all calling the real scripts: <br>• same seed gives an identical file hash, a different seed differs<br>• generated data passes validation and keeps `hs_chapter` as text<br>• calibration within 15%<br>• stress set reuses the calibration and is harder<br>• six bad-data cases are rejected<br>• time-ordered 70/15/15 split<br>• encoder categories come from training rows only, and an unseen test category is ignored<br>• baseline and metric maths<br>• the artifact loads and predicts finite, non-negative days<br>• the metadata has every spec field and matches the selection rule |
| Model card (11.7) | `docs/model-card.md`. It covers the target, data, split, selection, and metrics vs baselines including served accuracy and per-category results. It also covers checks, training ranges, limitations, intended use, timestamp and reproduce steps. The deviation (gradient boosting, not the spec's RandomForest, chosen on validation from both) is stated. |
| Data dictionary (10) | `docs/data-dictionary.md`. Every column with type and distribution, every dwell multiplier, assumptions marked, the stress set, the reference-data mapping, and changes from v1. |
| CG-015 (B07/B09) | The API loads the metadata with the model. Provenance shows `dwell-model-v2` / `synthetic-v2` (it had reported `synthetic-v1`). `OUT_OF_RANGE_INPUT` fires for API numeric inputs outside the training ranges; fixed defaults are not checked. Verified live: a 59,000 kg shipment gets the warning. |

## Found and fixed while doing it

- **The API's defaults for the five v2-only inputs were wrong.**
  - What was wrong: `cargo_priority="Standard"` and `customs_channel="Green"` didn't match the
    model's lowercase categories, and `importer_type="Standard"` isn't an importer type at all.
    The encoder treated all three as "none of the above", and `exam_queue_len` was fixed at 0.
  - Impact, measured on the 1,500 test rows: **MAE 0.755 and predictions 0.42 days too low on
    average.**
  - Fix: training-vocabulary values (`unknown`, `regular`, `standard`) and the queue derived from
    utilization. MAE is now 0.732 with +0.01 bias.
  - A test pins every default to the trained categories and ranges.
- **The v2 step-name lookup in `model_frame` is fixed** (review item 9.7). It finds `prep` (v2) as well
  as `preprocessor` (v1), so inputs are converted to the artifact's own column types.
- **`DATASET_VERSION` was hard-coded to `synthetic-v1`.** It is now read from the metadata.

## Still open

- **Reference data (needs you):** `ml/data/reference/port_dwell_2020.csv` and `_2021.csv` (from the
  supplied `DGQI.csv` / `DGQI_2021.csv`), with source URL, download date, licence and confirmation
  that the values are hours. Then the per-year calibration check can be added to `evaluate.py`.
- **`is_holiday` is always 0 at prediction time** (the features carry no date). That's wrong on
  five days a year.
- **The served accuracy (~0.73) is below the full-input figure (0.611)**, because the API doesn't
  collect the five v2-only inputs. Collecting them in the shipment form would close the gap.

## Files

New:
- `ml/scripts/evaluate.py`
- `ml/tests/test_pipeline.py`
- `docs/model-card.md`
- `docs/data-dictionary.md`
- `services/api/tests/test_model_metadata.py`
- `ml/artifacts/model_metadata_v2.json`
- `ml/reports/calibration_v2.json`

Changed:
- `ml/scripts/train.py`
- `ml/scripts/prepare_data.py`
- `ml/reports/metrics_v2.json`
- `services/api/app/services/ml.py`
- `services/api/app/services/model_service.py`
- `services/api/app/services/prediction.py`
- `services/api/CONTRACT_GAPS.md` (CG-015 resolved)
- `README.md`, `ml/README.md`, `docs/architecture.md`, `docs/security-checklist.md`,
  `docs/PROJECT_STATUS.md`

Removed:
- `ml/artifacts/dwell_model_v2.meta.json` (superseded by the metadata file)

## Addendum — reference data and per-year calibration (2026-11-22)

You added `ml/data/reference/port_dwell_2020.csv`, `_2021.csv` and `_2022.csv`, and confirmed the
values are **hours**. The source URL, download date and licence could not be confirmed, and the data
dictionary records them as "not recorded".

**What I checked:**
- **Format:** long, with columns `port, month, year, category, dwell_hours`.
- **Contents:** 13 ports plus 3 regional averages. 2020 and 2021 are complete. 2022 runs Jan–Nov.
- **Quality:** no duplicates and no empty values.
- **Encoding:** the 2022 file has a byte-order mark, which the loader handles.

**They reproduce the generator exactly.** The 2020–21 JNPT/APSEZ means, lockdown excluded, are 20.9,
28.1, 75.4 and 124.4 hours. That's 0.870, 1.172, 3.144 and 5.182 days, matching the generator's base
values to two decimals.

**Per-year check** (`evaluate.py` → `reports/calibration_v2.json`): all 12 comparisons are within
the 15% target.

| Year | INNSA import | INMUN import | INNSA export | INMUN export |
|---|---|---|---|---|
| 2020 (9 months, lockdown excluded) | +1.0% | −10.2% | +3.4% | +2.1% |
| 2021 (12 months) | −0.8% | +8.9% | −2.6% | −1.9% |
| 2022 (11 months, Jan–Nov; not used for calibration) | −5.8% | +2.6% | +0.6% | +8.7% |

2022 was never used for calibration, so it's an out-of-sample confirmation.

**Lockdown:** the real JNPT import multiplier in April–June 2020 was ×1.84 to ×3.15. The stress set's
×2.0–3.0 disruption sits inside it.

**Other changes:**
- `.gitignore` now commits `ml/data/reference/`, as the spec asks. The rule is `ml/data/*` plus an
  exception.
- 4 new ML tests:
  - the reference data reproduces the base means (21 months each)
  - every year is within 15%
  - the lockdown range supports the disruption range
  - the loader handles the byte-order mark and rejects malformed files

ML tests: **19 passed**.
