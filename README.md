# PortIQ

Container dwell and clearance-cost planning for two Indian ports — INNSA (Nhava Sheva / JNPA) and
INMUN (Mundra). A Next.js frontend talks to a FastAPI service backed by PostgreSQL; a scikit-learn
pipeline predicts dwell days and SHAP explains the number.

**Everything here is demo data.** Rates and predictions come from synthetic data and a model trained
on it. Nothing in this project is a customs assessment, a carrier quote or a guarantee. See
`docs/security-checklist.md` and `services/api/CONTRACT_GAPS.md` for the honest limits.

## Status

| Area | State |
| --- | --- |
| Backend B01–B09 (config, database, auth, shipments, capacity simulator, model, cost engine, prediction) | Implemented, tests pass |
| Backend B10 (operator/admin completion, hardening, contract tests) | **Incomplete** — `/operator/overview`, `/operator/shipments`, `/admin/audit-logs`, `GET /shipments/{id}/predictions/{id}` and the contract tests are missing |
| Backend B11 (Supabase integration, docs, smoke test) | Docs and smoke script written; the real-project check needs the section 18 values |
| Frontend F01–F10 | Complete in mock mode (`NEXT_PUBLIC_USE_MOCKS=true`); live mode needs Supabase + this API |

Exactly what works and what does not is in `docs/architecture.md` (known limitations) and
`docs/PROJECT_REVIEW.md`.

## Layout

```
apps/web/        Next.js 14 app (App Router, Supabase SSR, React Query, MSW mocks, Playwright)
services/api/    FastAPI service, Alembic migrations, seed and smoke scripts, pytest suite
ml/              synthetic data generator, training scripts, artifact and reports
docs/            backend + frontend specs, architecture, security checklist, project review
docker-compose.yml   local PostgreSQL 15
requirements.txt     full pinned pip freeze for the Python environment
```

## Quickstart (local, no Supabase)

Prerequisites: Python 3.11+, Node 20+, PostgreSQL 15+ (Docker or a local install).

```powershell
# 1. Database
docker compose up -d db

# 2. Python environment (from the repo root)
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r services\api\requirements.txt

# 3. API settings: copy the template and keep AUTH_MODE=dev for local work
Copy-Item services\api\.env.example services\api\.env
# services/api/.env is read automatically as a fallback; exported variables win.

# 4. Schema and demo data
cd services\api
alembic upgrade head
python scripts\seed_dev.py
python scripts\seed_capacity.py          # optional: 120 days of yard/berth buckets

# 5. Run
uvicorn app.main:app --reload
```

- `http://localhost:8000/health` → `{"data":{"status":"ok"},...}`
- `http://localhost:8000/ready` → 200 only when Postgres is reachable **and** the model is loaded
- `http://localhost:8000/docs` → OpenAPI UI

The model artifact is git-ignored. A clean clone has no `ml/artifacts/dwell_model_v1.joblib`, so
`/ready` is 503 and predictions return 503 until you build one:

```powershell
cd ml\scripts
..\..\.venv\Scripts\python.exe generate_synthetic.py
..\..\.venv\Scripts\python.exe prepare_data.py
..\..\.venv\Scripts\python.exe train.py
```

That writes `ml/artifacts/dwell_model_v1.joblib` and `ml/reports/metrics.json`. The committed
numbers are test MAE 1.03 days and stress MAE 1.49 days — synthetic data, not real-world accuracy.

### Dev accounts (`AUTH_MODE=dev` only)

The seed creates five users. The dev token is the literal string `dev:<email>`:

| Email | Role | Scope |
| --- | --- | --- |
| `importer@portiq.demo` | importer_exporter | own shipments |
| `importer2@portiq.demo` | importer_exporter | own shipments |
| `operator@portiq.demo` | port_operator | INNSA + INMUN |
| `operator2@portiq.demo` | port_operator | INNSA only |
| `admin@portiq.demo` | platform_admin | admin routes, all ports |

```powershell
curl.exe -H "Authorization: Bearer dev:importer@portiq.demo" http://localhost:8000/api/v1/me
```

### Frontend

```powershell
cd apps\web
npm install
npm run dev          # http://localhost:3000
```

`apps/web/.env.local` (git-ignored; template in `apps/web/.env.example`) starts with
`NEXT_PUBLIC_USE_MOCKS=true`, which serves MSW mocks and needs neither Supabase nor the API. For
live mode: real Supabase URL + publishable key, `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1`,
and `NEXT_PUBLIC_USE_MOCKS=false`.

## Tests and quality gates

```powershell
cd services\api
..\..\.venv\Scripts\python.exe -m pytest          # needs a local Postgres (portiq_test)
..\..\.venv\Scripts\python.exe -m ruff check .
..\..\.venv\Scripts\python.exe -m mypy .
```

The suite drops and recreates the `public` schema of `portiq_test`, runs every migration from
empty, and rolls each test back. It refuses any database whose name does not end in `_test` on a
non-local host, so it can never touch Supabase.

Current state: `pytest` **113 passed**, `ruff check .` **clean**. `mypy .` still reports **25
pre-existing errors in 6 older modules** (`app/api/v1/admin.py`, `app/api/v1/capacity.py`,
`app/schemas/admin.py`, `scripts/seed_capacity.py`, `tests/test_cost_engine.py`,
`tests/test_operator.py`). They are type-annotation gaps, not runtime defects; every file added or
rewritten for this work type-checks clean.

```powershell
cd apps\web
npm run lint
npm run typecheck
npm test
```

## Supabase integration (B11)

1. Follow backend spec section 18: create the project, note the JWKS URL/issuer/audience, copy the
   pooled `DATABASE_URL`, create the users.
2. Put the server values in `services/api/.env` (`AUTH_MODE=supabase`) and the public values in
   `apps/web/.env.local` (`NEXT_PUBLIC_USE_MOCKS=false`). Never commit either file.
3. Run `alembic upgrade head` against the project, then create operator/admin profiles by signing
   up and updating `profiles.role` + `operator_ports` with SQL.
4. Add the frontend origin to `ALLOWED_ORIGINS`.
5. Prove the wiring end to end:

```powershell
cd services\api
..\..\.venv\Scripts\python.exe scripts\smoke_supabase.py `
  --supabase-url https://<project>.supabase.co `
  --supabase-key <publishable-or-anon-key> `
  --email you@example.com
# asks for the password, signs in, calls /me, creates a shipment, runs a prediction
```

The script prints status codes and response bodies only — never the token. It expects an importer
account with the password grant enabled.

`docs/security-checklist.md` lists every control with PASS / FAIL / BLOCKED / HUMAN and what is
still unverified.

## Endpoints

All under `/api/v1`, envelope `{data, meta:{request_id, ...}}`, errors `{error:{code, message,
details?, request_id}}`. Full shapes: `docs/FRONTEND_SPEC.md` section 5.

| Method | Path | Roles |
| --- | --- | --- |
| GET | `/me`, `/config`, `/ports` | all |
| PATCH | `/me` | all |
| GET | `/shipments`, `/shipments/summary`, `/shipments/{id}` | importer (own), operator (scoped) |
| POST | `/shipments` | importer |
| PATCH | `/shipments/{id}` | importer (owner, `submitted` only) |
| POST | `/shipments/{id}/events` | operator (scoped) |
| POST | `/shipments/{id}/prediction` | importer (own), operator (scoped) |
| GET | `/shipments/{id}/predictions` | importer (own), operator (scoped) |
| GET | `/capacity/forecast` | all (operators scoped) |
| GET | `/admin/tariffs`, POST, PATCH `/{id}` | admin |
| GET | `/operator/dashboard/summary` | operator |
| POST | `/predict/dwell` | any authenticated user — diagnostic, outside the frozen contract |

Missing endpoints and why they matter are listed in `docs/architecture.md`.

## Documentation

- `docs/BACKEND_SPEC.md` — the backend contract (source of truth)
- `docs/FRONTEND_SPEC.md` — the frontend contract, including the HTTP shapes (section 5)
- `docs/architecture.md` — how the pieces fit, auth, RLS, prediction pipeline, limitations
- `docs/security-checklist.md` — control-by-control status
- `services/api/CONTRACT_GAPS.md` — every undefined corner and the one function that owns it
- `docs/PROJECT_REVIEW.md` — independent review of the repository state
- `services/api/README.md` — API-specific setup, migrations, database notes
