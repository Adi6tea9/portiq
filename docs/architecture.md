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
  MSW mocks for offline work                routers: me, config, ports, shipments,
  Playwright e2e                              capacity, predict, operator, admin
        │                                          │
        │  Authorization: Bearer <JWT>             │ SQLAlchemy 2 (sync)
        ▼                                          ▼
  Supabase Auth (JWT)                       PostgreSQL 15+ (Supabase in deployment)
                                                   ▲
ml/artifacts/dwell_model_v1.joblib ────────────────┘  loaded once at startup
```

- The API is the only path to the data. The browser never queries Postgres directly.
- `ml/` holds the generator, the training scripts, the artifact and the reports. Training never
  runs inside a request.
- `docs/` holds the frozen specs, this file, the security checklist and the project review. The data
  dictionary and model card required by spec 10/11.7 are not written yet.

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
6. **SHAP** (`app/services/explain.py`) runs `shap.TreeExplainer` on the fitted forest, folds the
   one-hot values back onto the 12 original feature names, and checks additivity
   (`base + Σ contributions == prediction` within 1e-3 days). Any failure returns
   `status:"unavailable"` with a reason and the `EXPLANATION_UNAVAILABLE` warning; the prediction
   still returns.
7. **Cost engine** (`app/services/cost_engine.py`): `Decimal` only, most-specific active tariff per
   component, `ROUND_HALF_UP` at the final line amount, `null` plus `TARIFF_MISSING` for a missing
   rule (never zero), and a partial total.
8. **Persistence**: one immutable `prediction_runs` row with the cost breakdown, explanation,
   capacity snapshot, warnings, `input_snapshot` (inputs, features, capacity feature), model and
   dataset versions, and tariff versions.

Model caveat worth knowing: the prepared training CSV round-trips `hs_chapter` through
`pandas.read_csv`, so the artifact encodes integer categories (`84`, `2`) while the API accepts the
two-character string (`"84"`, `"02"`). `model_frame` converts to the artifact's type; without that,
`OneHotEncoder(handle_unknown="ignore")` silently encodes the chapter as all zeros and the
prediction shifts. This is a training-data defect described here and in the model notes, not a
serving choice.

## Data and model

- `ml/scripts/generate_synthetic.py` writes `ml/data/raw/synthetic_v1.csv` (10,000 rows, fixed
  seed) plus a separate stress holdout. `prepare_data.py` derives `arrival_day_of_week` and
  `arrival_month` and splits by time (70/15/15). CSVs and artifacts are git-ignored.
- `train.py` fits one `Pipeline`: `ColumnTransformer` (numeric passthrough/scale, one-hot
  categoricals) + `RandomForestRegressor`. The committed artifact is
  `ml/artifacts/dwell_model_v1.joblib`; metrics are in `ml/reports/metrics.json`
  (test MAE 1.03 days, stress MAE 1.49 days) and are synthetic-data numbers only.
- The metadata file required by spec 11.6 (baseline metrics, numeric training ranges) does not
  exist yet, so `MODEL_VERSION` or the pinned artifact name is reported and `OUT_OF_RANGE_INPUT`
  cannot be evaluated — **CONTRACT-GAP CG-015**.

## Frontend integration

- `apps/web/.env.local` (git-ignored, template in `apps/web/.env.example`) holds
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_USE_MOCKS`.
- With `NEXT_PUBLIC_USE_MOCKS=true` the app serves MSW mocks and needs no backend. Integration
  means `false` plus a real Supabase project and a running API (`AUTH_MODE=supabase`).
- Supabase SSR stores the session in cookies; the API client forwards the access token as
  `Authorization: Bearer …`. The API never reads Supabase cookies.
- Pages: dashboard, shipments (list, new, detail, edit, prediction detail), capacity, operator,
  admin tariffs, settings, auth (login, signup, reset).
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

- B10 is incomplete: `GET /operator/overview`, `GET /operator/shipments`,
  `GET /admin/audit-logs` and `GET /shipments/{id}/predictions/{prediction_id}` are not
  implemented. The operator router only has `/operator/dashboard/summary`; the admin router only
  exposes tariffs. The frontend screens that call the missing endpoints work against mocks but not
  against this API.
- Request-body size limits and date-range caps from B10 are not implemented.
- `POST /api/v1/predict/dwell` (direct model inference) exists in code but is not part of the
  frozen frontend contract; treat it as a diagnostic endpoint.
- The model metadata/baseline comparison required by spec 11.6/11.7 is missing, and so is
  `docs/model-card.md`; both are B06 work.
- Rate limiting is in-memory per process (spec 4.13 allows this; it is not a distributed limiter).
- `ruff check .` is clean as of this session. `mypy .` still reports 25 pre-existing annotation
  errors in six older modules (`app/api/v1/admin.py`, `app/api/v1/capacity.py`,
  `app/schemas/admin.py`, `scripts/seed_capacity.py`, `tests/test_cost_engine.py`,
  `tests/test_operator.py`). Nothing is silenced with blanket ignores; the only lint-config change
  is treating FastAPI's `Depends(...)`/`require_role(...)` defaults as immutable calls (B008), which
  is the documented FastAPI idiom.

Undefined contract corners and the single function that holds each assumption are listed in
`services/api/CONTRACT_GAPS.md`.
