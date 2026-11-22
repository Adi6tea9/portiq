# PortIQ architecture

PortIQ is a planning prototype for container dwell and clearance cost at two Indian ports
(INNSA Nhava Sheva and INMUN Mundra). A Next.js app talks to a FastAPI service; Supabase provides
authentication (and can host the Postgres database); a scikit-learn pipeline predicts dwell and
SHAP explains it. Every rate and prediction in the UI is **demo data**, never a customs
assessment. Backend behaviour is fixed by `docs/BACKEND_SPEC.md`; the HTTP shapes come from
`docs/FRONTEND_SPEC.md` section 5.

## Components

```
apps/web (Next.js 14, App Router)          services/api (FastAPI, Python 3.11+)
  Supabase JS client + @supabase/ssr  ──►   AUTH_MODE=dev | supabase
  React Query data layer                    get_current_user → profiles row
  three.js (Load planner, lazy)
  MSW mocks for offline work                routers: me, config, ports, shipments,
  Playwright e2e                              capacity, predict, operator, admin
        │                                          │
        │  Authorization: Bearer <JWT>             │ SQLAlchemy 2 (sync)
        ▼                                          ▼
  Supabase Auth (JWT)                       PostgreSQL 15+ (Supabase in deployment)
                                                   ▲
ml/artifacts/dwell_model_v2.joblib ────────────────┘  loaded once at startup
```

- The API is the only path to the data. The browser never queries Postgres directly.
- `ml/` holds the generator, the training scripts, the artifact and the reports. Training never
  runs inside a request.
- `docs/` holds the frozen specs, this file, the security checklist, the project status file
  (`docs/PROJECT_STATUS.md`) and the Load planner notes. The data dictionary and model card required
  by spec 10/11.7 are not written yet.
- `services/api/docker-compose.yml` runs Postgres 15 and the API; the API mounts `ml/artifacts`
  read-only at `/models` and waits for a healthy database.

## Request lifecycle

1. **`RequestContextMiddleware`** (`app/main.py`) creates a UUIDv4 request id, stores it in
   `request.state`, adds `X-Request-ID` to every response, and writes one structured JSON log line
   per request (route, status, latency, actor id, model version, error code). It converts any
   uncaught exception into the standard `INTERNAL_ERROR` envelope and never leaks a traceback.
2. **CORS** allows exactly `ALLOWED_ORIGINS` (comma separated) with credentials. `*` is rejected at
   startup because credentials are enabled.
3. **Routing** (`app/api/v1/`) resolves the bearer token through `get_current_user`, which returns
   the `profiles` row. Roles come from that row, never from the body or a token claim.
4. **Services** (`app/services/`) own the behaviour: capacity simulation, prediction
   orchestration, SHAP, the cost engine. Routers only validate, authorize, call and serialize.
5. **Envelopes** (`app/schemas/envelope.py`) wrap success as `{data, meta:{request_id,
   generated_at, pagination?}}` and every failure as `{error:{code, message, details?,
   request_id}}`. The exception handlers in `app/core/errors.py` map `AppError`, Pydantic
   `RequestValidationError`, `HTTPException` and unexpected errors onto that shape.
6. **`get_db`** yields one SQLAlchemy session per request, commits on success and rolls back on
   any exception.

## Authentication and authorization

**Two modes, one switch** (`AUTH_MODE`), in `app/core/config.py` and `app/core/security.py`:

- `dev` — the token is `dev:<seeded-email>`. The profile is looked up by email; an unknown email is
  401. This mode is refused when `APP_ENV` is `staging` or `production`, and tests assert that.
- `supabase` — `PyJWT` verifies the real token against the project's JWKS
  (`SUPABASE_JWT_JWKS_URL`): signature, `iss`, `aud`, `exp`, and the required claims
  `exp/iat/sub/aud/iss`. The key set is cached for 5 minutes with a 5 second fetch timeout.
  `sub` becomes `profiles.id`. The token payload is never trusted without verification. A project
  that only offers a legacy shared secret is a hard stop, not a fallback.
- **Profile provisioning** (`app/core/deps.py::_get_or_provision`) creates a first-time Supabase
  user as `importer_exporter`. That is the only automatic profile path; it can never create an
  operator or an admin, and a concurrent first request is resolved with an `IntegrityError`
  retry.
- **Roles** come from `profiles.role`: `importer_exporter`, `port_operator`, `platform_admin`.
- **Per-resource checks** live in the routers/repositories, not in the client: an importer sees
  only `owner_user_id = me`; an operator sees only shipments at ports listed in `operator_ports`;
  anything else is **404**, while a role that may never call the route gets **403** (spec 4.9).
- `require_role(*roles)` returns the dependency used by `<Role>` aliases in the routers.

Permission matrix (spec section 7) is enforced as follows: `/me`, `/config`, `/ports` for all
roles; `/shipments*` and predictions for importers (own) and operators (scoped), never admin;
`/admin/*` admin only; `/operator/*` operators (and admin is allowed by the spec, but see the
known limitations — the operator router currently only implements `/operator/dashboard/summary`).

## Database

- PostgreSQL 15+, one `public` schema, UUID primary keys (`gen_random_uuid()`), `timestamptz`
  everywhere.
- Nine tables (spec section 6): `profiles`, `ports`, `operator_ports`, `shipments`,
  `shipment_events`, `prediction_runs`, `capacity_forecasts`, `tariff_rules`, `audit_logs`.
- Enums exist twice on purpose from one source: `app/schemas/enums.py` is the Python source of
  truth and `migrations/versions/0001_initial.py` creates the matching Postgres enum types.
- Alembic owns the schema. `alembic upgrade head` from empty is exercised by the test suite on
  every run.
- **Row Level Security** is enabled on all nine tables with **no policies**: the Supabase
  `anon`/`authenticated` roles are denied by default, so the browser cannot bypass the API. The
  API connects as the table owner, which bypasses RLS by design; **every authorization rule is
  enforced in Python**. `FORCE ROW LEVEL SECURITY` is deliberately off because it would also apply
  to the owner and break migrations and the seed. If the deployed API ever connects as a
  non-owner role, policies must be written before that change ships.
- **Append-only by convention** (spec 5.11): `shipment_events`, `prediction_runs` and
  `audit_logs` are never updated or deleted; `tariff_rules` is deactivated (`is_active=false`),
  never deleted. Prediction snapshots keep the tariff and model versions that produced them.

## Prediction pipeline

`POST /api/v1/shipments/{id}/prediction` (`app/services/prediction.py`):

1. Authorize the shipment (owner or scoped operator) and apply the in-memory rate limit
   (10 requests per minute per user, spec 4.13).
2. Hash the prediction inputs. A replay of the same `(shipment_id, Idempotency-Key)` with the same
   hash returns the stored run as **200**; a different hash is **409 `IDEMPOTENCY_CONFLICT`**; a new
   key creates a new immutable row (**201**).
3. **Capacity snapshot**: the `yard` bucket containing `expected_arrival_at` for the port, with
   invalid buckets (capacity ≤ 0, negative occupancy, occupancy > 1.2× capacity) excluded.
   Missing bucket → `status:"unavailable"` plus the `CAPACITY_UNAVAILABLE` warning, and the model
   feature falls back to `capacity_sim.utilization_for` (spec 13.3).
4. **Features** — exactly the 12 frozen names in `app/services/model_service.py::feature_row`.
   `declared_value` and the raw `port_id` are never model inputs.
5. **Model** — the startup-loaded pipeline runs on a single worker thread with
   `PREDICTION_TIMEOUT_SECONDS`. A missing model, a timeout, an exception, or a non-finite or
   negative output returns **503 `MODEL_UNAVAILABLE`**; a number is never invented. The frame
   builder (`DwellTimeModel.model_frame`) is shared with SHAP so both see the same encoded row.
6. **SHAP** (`app/services/explain.py`) runs `shap.TreeExplainer` on the fitted tree model and folds
   the one-hot values back onto the 12 original feature names. It first checks additivity in the
   model's own units (base + Σ contributions == raw tree output within 1e-3). For the v2 log-target
   model it then maps to days: base = `expm1(base_log)`, and the gap to the prediction is shared in
   proportion to each feature's log-space value (signs and ranking kept, exactly additive). The five
   v2-only inputs, which the API always fills with fixed defaults, are folded into the base value.
   A final check confirms `base + Σ contributions == prediction` within 1e-3 days. Any failure returns
   `status:"unavailable"` with a reason and the `EXPLANATION_UNAVAILABLE` warning; the prediction
   still returns.
7. **Cost engine** (`app/services/cost_engine.py`): `Decimal` only, most-specific active tariff per
   component, `ROUND_HALF_UP` at the final line amount, `null` plus `TARIFF_MISSING` for a missing
   rule (never zero), and a partial total.
8. **Persistence**: one immutable `prediction_runs` row with the cost breakdown, explanation,
   capacity snapshot, warnings, `input_snapshot` (inputs, features, capacity feature), model and
   dataset versions, and tariff versions.

Model caveat worth knowing: the v1 training CSV round-tripped `hs_chapter` through
`pandas.read_csv`, so the v1 artifact encodes integer categories (`84`, `2`) while the API accepts
the two-character string (`"84"`, `"02"`). v2 reads `hs_chapter` as text, so its categories are
strings. `model_frame` converts each input to the artifact's own column types (it finds the
preprocessor as `prep` in v2 or `preprocessor` in v1).

## Data and model

- `ml/scripts/generate_synthetic_v2.py` writes `ml/data/raw/synthetic_v2.csv` plus a stress holdout
  (fixed seed). It imports the API's capacity simulator, so train it with `services/api` next to
  `ml`. `prepare_data.py --version v2` splits by time into `ml/data/processed/v2/`. Generated CSVs
  are git-ignored (rebuilt exactly); the reference CSVs and the trained model are committed. The v1 generator and splits remain available with `--version v1`.
- `train.py --version v2` compares per-port/direction mean and median baselines with RandomForest
  and HistGradientBoosting candidates (with and without a log target), tuned on validation only. The
  chosen model is HistGradientBoosting with a `log1p` target inside `Pipeline(prep, reg)`. It also
  fits 10th/90th-percentile models with a calibration margin, and stores `serve="model"` only if
  the point model beats both baselines on test and stress.
- The served artifact is the bundle `ml/artifacts/dwell_model_v2.joblib` (`point_model`,
  `q10_model`, `q90_model`, baseline table, interval margin) with `model_metadata_v2.json`.
  Metrics are in `ml/reports/metrics_v2.json`: test MAE 0.611 days (best baseline 0.942), stress
  MAE 1.327 (baseline 2.030). These are synthetic-data numbers only.
- Train inside the API image so the scikit-learn version matches the one that loads the bundle.
  The 22 Nov rebuild reproduced the committed metrics exactly.
- `train.py` also writes `ml/artifacts/model_metadata_v2.json` (spec 11.6: versions, feature schema,
  numeric training ranges, metrics, limitations). The API loads it with the model: provenance
  reports its `model_version` (`dwell-model-v2`) and `dataset_version` (`synthetic-v2`), and
  `OUT_OF_RANGE_INPUT` is raised for API numeric inputs outside the training ranges (CG-015,
  resolved). Model card: `docs/model-card.md`; data dictionary: `docs/data-dictionary.md`.
- The five v2-only inputs are filled with training-vocabulary defaults (`customs_channel=unknown`,
  `importer_type=regular`, `cargo_priority=standard`, `is_holiday=0`, `exam_queue_len` from
  utilization). Served test MAE is about 0.73 days against 0.611 with all inputs.

## Frontend integration

- `apps/web/.env.local` (git-ignored, template in `apps/web/.env.example`) holds
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_USE_MOCKS`.
- With `NEXT_PUBLIC_USE_MOCKS=true` the app serves MSW mocks and needs no backend. Integration
  means `false` plus a real Supabase project and a running API (`AUTH_MODE=supabase`).
- Supabase SSR stores the session in cookies; the API client forwards the access token as
  `Authorization: Bearer …`. The API never reads Supabase cookies.
- Pages: dashboard, shipments (list, new, detail, edit, prediction detail), capacity, Load
  planner (3D, client-side only, sample cargo), operator, admin tariffs, settings, auth (login,
  signup, reset).
- Live mode needs Supabase: the browser cannot send `dev:` tokens. `apps/web/.env.local` and
  `services/api/.env` already exist with the Supabase lines empty; with `AUTH_MODE=supabase` the API
  derives the JWKS URL, issuer and audience from `SUPABASE_URL`.
- The frontend contract is the source for field names, enums and error codes; the API does not add
  fields of its own.

## Operations

- `GET /health` — process is up. `GET /ready` — database reachable **and** model loaded, otherwise
  503 with the failing component in `error.details`.
- Configuration comes only from the variables listed in backend spec section 3. `services/api/.env`
  is read as a **fallback** for local development (real environment variables win; skipped when
  `APP_ENV=test`, **CG-017**) and is git-ignored. `MODEL_PATH` overrides the artifact location;
  `MODEL_VERSION` is reported in provenance.
- Logs are JSON on stdout with the request id; tokens, secrets and full JWTs are never logged.
- The API is stateless except for the in-memory rate-limit cache and the loaded model: run one
  process, or accept that rate limits are per process.

## Known limitations (honest list)

Current stage and the full pending list: `docs/PROJECT_STATUS.md`.

- The frontend and API have not yet run together live; that needs a Supabase project (B11).
- B10 is complete. The operator-shipment dwell, warning and at-risk filters run in Python after
  the SQL filters (fine for thousands of rows). Request bodies are capped at 1 MiB (CG-019); list
  arrival filters reject backwards ranges but have no span cap (CG-020).
- The contract tests compare field names and JSON types with the frontend mocks; they do not
  compare values or enumerate every nullable variant.
- `GET /operator/dashboard/summary` is an older route outside the frontend contract and accepts
  operators only.
- `POST /api/v1/predict/dwell` (direct model inference) exists in code but is not part of the
  frozen frontend contract; treat it as a diagnostic endpoint.
- B06: the reference data (`ml/data/reference/`, hours) has no recorded source URL, download date
  or licence. `is_holiday` is always 0 at prediction time because the features carry no date.
- Rate limiting is in-memory per process (spec 4.13 allows this; it is not a distributed limiter).
- `ruff check .` is clean. `mypy .` reports 11 pre-existing annotation errors in five older
  modules (`app/schemas/capacity.py` bucket serializer moved from `capacity.py`,
  `app/services/ml.py`, `scripts/seed_capacity.py`, `tests/test_cost_engine.py`,
  `tests/test_operator.py`). None are in code added since 22 Nov. The only lint-config change is treating FastAPI's
  `Depends(...)`/`require_role(...)` defaults as immutable calls (B008), and `sklearn` joins the
  libraries mypy treats as untyped.

Undefined contract corners and the single function that holds each assumption are listed in
`services/api/CONTRACT_GAPS.md`.
