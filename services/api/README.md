# PortIQ API

FastAPI backend for the PortIQ planning prototype. Every response is synthetic or demo data;
nothing here is an official customs assessment or a guarantee.

Scope of the code: **B01 scaffold, B02 database, B03 auth, B04 shipments, B05 capacity, B06
synthetic data/training, B07 model service and SHAP, B08 cost engine and tariff admin, B09
prediction orchestration**, plus the B11 documentation and Supabase smoke test. **B10 is
incomplete**: `/operator/overview`, `/operator/shipments`, `/admin/audit-logs`, a single-prediction
GET and the frontend contract tests are not implemented. See `docs/architecture.md` for the exact
limitation list.

## Requirements

- Python 3.11+ (`python --version`)
- PostgreSQL 15+ for anything that touches the database (Docker Compose file at the repo root)

## Setup

```powershell
# from the repo root
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r services\api\requirements.txt

cd services\api
# Copy .env.example to .env and edit it: the file is loaded automatically as a fallback,
# and exported environment variables always win (CONTRACT-GAP CG-017).
```

## Run

```powershell
cd services\api
uvicorn app.main:app --reload
```

- `http://localhost:8000/health` → `{"data":{"status":"ok"},"meta":{...}}`
- `http://localhost:8000/ready` → 200 when Postgres is reachable **and** the model is loaded; 503 otherwise
- `http://localhost:8000/docs` → OpenAPI UI

`/ready` returns 503 and predictions return 503 until `ml/artifacts/dwell_model_v1.joblib` exists
(build it with `generate_synthetic.py`, `prepare_data.py`, `train.py`; see the repository README).

## Authentication

Two modes, chosen with `AUTH_MODE` (backend spec section 7):

- **`dev`** (local/test only): `Authorization: Bearer dev:<seeded-email>`, for example
  `dev:importer@portiq.demo`. The role always comes from `profiles`; an unknown email is `401`.
  Startup fails when `AUTH_MODE=dev` and `APP_ENV` is `staging` or `production`.
- **`supabase`**: a real JWT verified against `SUPABASE_JWT_JWKS_URL` (`RS256`/`ES256`):
  signature, issuer, audience and expiry are checked, with the key set cached for 5 minutes.
  `sub` becomes the profile id; a first-time user gets an `importer_exporter` profile
  automatically. Startup fails unless the three `SUPABASE_JWT_*` variables are set.

Protected endpoints (all roles): `GET /api/v1/me`, `PATCH /api/v1/me` (trimmed display name,
1–80 chars, extra fields ignored), `GET /api/v1/config`, `GET /api/v1/ports` (importers/admin
see all ports, operators only their assigned ports). Every protected route returns `401
UNAUTHENTICATED` without a valid token.

## Shipments

All under `/api/v1/shipments` (backend spec sections 7 and 8, frontend contract 5.4):

- `GET /shipments` — importer owns; operator scoped to `operator_ports`; admin `403`. Filters
  `status`, `arrival_from`, `arrival_to` (inclusive UTC dates on `expected_arrival_at`), `q`
  (reference contains, case-insensitive); `page`/`page_size` (max 100); newest first. Items include
  `latest_prediction` and computed `actual_dwell_days`.
- `GET /shipments/summary` — importer only; `{total, status_counts}` with all three statuses.
- `POST /shipments` — importer only; owner from the token, `status="submitted"`, and a `created`
  event. Duplicate `reference` is `422` with `details[0].field = "reference"`.
- `GET /shipments/{id}` — owner or scoped operator; `ShipmentDetail` with events in `occurred_at`
  order. Any other user's shipment is `404`.
- `PATCH /shipments/{id}` — owner only, only while `submitted`; allowlisted fields only. Unknown
  fields `422`, wrong state `409 STATE_CONFLICT`.
- `POST /shipments/{id}/events` — scoped operator only; `submitted → arrived`, `arrived → cleared`.
  Sets the actual timestamp, appends the event and an `audit_logs` row. Anything else is `409`.
  An optional note is trimmed and limited to 500 characters (`422` above that).

## Prediction and capacity

- `POST /shipments/{id}/prediction` — owner or scoped operator; requires an `Idempotency-Key`
  UUID header. 201 for a new run, 200 for an exact replay, 409 `IDEMPOTENCY_CONFLICT` when the
  shipment inputs changed, 429 `RATE_LIMITED` after 10 requests per minute per user, 503
  `MODEL_UNAVAILABLE` when the model cannot produce a trustworthy number. Returns the predicted
  dwell days, clearance time, cost breakdown, capacity snapshot, SHAP explanation, warnings and
  provenance. The run row is immutable.
- `GET /shipments/{id}/predictions` — paginated history, newest first.
- `GET /capacity/forecast` — daily yard/berth buckets for a port and date range (max 31 days), with
  invalid buckets excluded. Operators are limited to their `operator_ports`.
- `POST /predict/dwell` — direct model inference for a full 12-feature payload. This endpoint is
  outside the frozen frontend contract; treat it as a diagnostic.
- `GET /operator/dashboard/summary` is the only operator route today; `/operator/overview` and
  `/operator/shipments` from spec section 14 are B10 work and are not implemented.
- `/admin/tariffs` implements list/create/deactivate only; `GET /admin/audit-logs` is B10 work and is
  not implemented.

## Quality gates

```powershell
cd services\api
..\..\.venv\Scripts\python.exe -m ruff check .
..\..\.venv\Scripts\python.exe -m mypy .
..\..\.venv\Scripts\python.exe -m pytest
```

Current state: `pytest` 113 passed, `ruff check .` clean, `mypy .` 25 pre-existing errors in six
older modules (annotation gaps only). Tests need a local Postgres; `conftest.py` refuses any
database that is not a local `*_test` database.

## Supabase smoke test

`scripts/smoke_supabase.py` signs in with a real user, calls `/me`, creates a shipment and runs a
prediction. Credentials are arguments (the password is prompted), the script reads no API setting
and prints no token. See the repository README for the exact command.

## Database

### Docker

```powershell
# from the repo root
docker compose up -d db
```

### Local install without Docker

Any PostgreSQL 15+ install works (the machine used for B02 has no Docker, so it uses a conda
install in a private prefix; no admin rights, no system service):

```powershell
conda create -y -p C:\Users\%USERNAME%\AppData\Local\portiq-pg15 `
  --override-channels -c conda-forge postgresql=15
$bin = "C:\Users\$env:USERNAME\AppData\Local\portiq-pg15\Library\bin"

& "$bin\initdb.exe" -D "C:\Users\$env:USERNAME\AppData\Local\portiq-pgdata" -U portiq --auth=trust
& "$bin\pg_ctl.exe" -D "C:\Users\$env:USERNAME\AppData\Local\portiq-pgdata" `
  -l "C:\Users\$env:USERNAME\AppData\Local\portiq-pg.log" -o "-p 5432" start
& "$bin\psql.exe" -h 127.0.0.1 -U portiq -d postgres -c "ALTER USER portiq PASSWORD 'portiq';"
& "$bin\createdb.exe" -h 127.0.0.1 -U portiq portiq
& "$bin\createdb.exe" -h 127.0.0.1 -U portiq portiq_test
```

Stop it with `& "$bin\pg_ctl.exe" -D "...\portiq-pgdata" stop`.

### Migrations and seed

```powershell
cd services\api
$env:DATABASE_URL = "postgresql+psycopg://portiq:portiq@localhost:5432/portiq"
$env:APP_ENV = "local"

alembic upgrade head              # creates the 9 tables, 12 enum types, indexes and RLS
alembic downgrade base            # drops them again (also drops the enum types)
python scripts\seed_dev.py        # safe to run twice: row counts do not change
```

The seed prints row counts:

```json
{"row_counts": {"profiles": 5, "ports": 2, "operator_ports": 3, "shipments": 12,
 "shipment_events": 21, "prediction_runs": 0, "capacity_forecasts": 0,
 "tariff_rules": 12, "audit_logs": 0}}
```

Every seeded row has a deterministic UUID derived from its natural key (email, port code,
reference, tariff scope), so a re-run only inserts what is missing and never duplicates or
overwrites human edits. The seed refuses any `APP_ENV` other than `local` or `test`.

`migrations/env.py` reads `DATABASE_URL` through `app.core.config`, so the URL lives in one place.
RLS is enabled on all nine tables with no policies: the API connects as the table owner and
enforces authorization itself, while direct Supabase access is denied by default. See
`docs/architecture.md`.

### Tests and the test database

`pytest` forces `DATABASE_URL` to `postgresql+psycopg://portiq:portiq@localhost:5432/portiq_test`,
drops the `public` schema, runs every migration from empty and rolls each test back. It never
touches the dev database, but it does need a running Postgres and the `portiq_test` database.
As a second line of defence the schema reset refuses to run unless the database name ends with
`_test` and the host is local (`localhost`, `127.0.0.1` or `::1`).

## Layout

```
services/api/
  app/main.py            app factory, request-id middleware, CORS, /health, /ready
  app/api/v1/            me.py, config.py, ports.py, shipments.py, capacity.py, predict.py, operator.py, admin.py
  app/core/config.py     environment variables (backend spec section 3), .env fallback, startup validation
  app/core/security.py   dev-token parsing and JWKS JWT verification (cached key set)
  app/core/deps.py       get_db, get_current_user, require_role
  app/core/logging.py    JSON logging + request-id generation
  app/core/errors.py     error envelope, exception handlers, status -> error code mapping
  app/schemas/envelope.py  envelope Pydantic models and helpers
  app/schemas/enums.py   the single enum source (mirrored by the Postgres enum types)
  app/schemas/           request/response shapes per area
  app/models/tables.py   all nine tables (backend spec section 6)
  app/repositories/      one module per entity: profiles, ports, operator_ports, shipments, tariffs, audit_logs
  app/services/          capacity_sim.py, cost_engine.py, prediction.py, model_service.py, explain.py, ml.py
  app/db.py              SQLAlchemy engine, declarative Base, session_scope, readiness probe
  migrations/versions/0001_initial.py  enums, tables, checks, indexes, RLS
  scripts/seed_dev.py    idempotent demo seed (ports, users, tariffs, 12 shipments)
  scripts/seed_capacity.py   fills capacity_forecasts with simulator output
  scripts/smoke_supabase.py  real sign-in + /me + shipment + prediction smoke test
  tests/                 pytest suite (test DB: portiq_test)
  tests/support/probe_app.py  test-only app used to exercise 422/500 over real HTTP
```

`app/api/v1/` grows one router per feature; `app/services/` and the remaining schema modules are
created by the feature that first needs them, not empty up front.

## Conventions

Money is `Decimal` and serialised as a 2-decimal string. Timestamps are UTC and end in `Z`.
Every response carries `request_id` in the envelope and in `X-Request-ID`. Undefined contract
details are listed in [CONTRACT_GAPS.md](./CONTRACT_GAPS.md).
