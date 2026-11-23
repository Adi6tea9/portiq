# PortIQ

Container dwell and clearance-cost planning for two Indian ports — INNSA (Nhava Sheva / JNPA) and
INMUN (Mundra). A Next.js frontend talks to a FastAPI service backed by PostgreSQL; a scikit-learn
pipeline predicts dwell days and SHAP explains the number.

**Everything here is demo data.** Rates and predictions come from synthetic data and a model trained
on it. Nothing in this project is a customs assessment, a carrier quote or a guarantee. See
`docs/security-checklist.md` and `services/api/CONTRACT_GAPS.md` for the honest limits.

## Status

**Stage (22 Nov 2026): B01–B10 complete; next is B11 (live Supabase integration). About 91%
complete.** Full breakdown and pending list: `docs/PROJECT_STATUS.md`.

| Area | State |
| --- | --- |
| Backend B01–B09 (config, database, auth, shipments, capacity simulator, model, cost engine, prediction) | Implemented, tests pass. Reference data: data.gov.in "Port Dwell Time" (NDSAP / GODL-India) |
| Backend B10 (operator/admin completion, hardening, contract tests) | **Done** — section 14 endpoints, audit logs, single-prediction GET, 1 MiB body cap, date-range rules, `docs/openapi.json` (`scripts/export_openapi.py`), contract tests against the frontend mocks, full section 7 auth matrix |
| Backend B11 (Supabase integration, docs, smoke test) | Code, `.env` templates, docs and smoke script ready; only the project URL and publishable key are needed to run it |
| Frontend F01–F10 | Complete in mock mode (`NEXT_PUBLIC_USE_MOCKS=true`); live mode needs Supabase + this API |
| Frontend extras | PortIQ theme restyle and the 3D Load planner tab (`PORTIQ_THEME_CHANGES.md`) |
| ML | v2 model trained and served (test MAE 0.610 as served, synthetic data). Model card `docs/model-card.md`, data dictionary `docs/data-dictionary.md`, per-year calibration within 15% (2020–2022), 19 ML tests |

Exactly what works and what does not is in `docs/PROJECT_STATUS.md` and `docs/architecture.md`
(known limitations). Change reports: `PORTIQ_THEME_CHANGES.md` (frontend), `BACKEND_FIXES_REPORT.md`
(backend and ML).

## Layout

```
apps/web/        Next.js 14 app (App Router, Supabase SSR, React Query, MSW mocks, Playwright)
services/api/    FastAPI service, Alembic migrations, seed and smoke scripts, pytest suite
ml/              synthetic data generator, training scripts, artifact and reports
docs/            backend + frontend specs, architecture, security checklist, project status
services/api/docker-compose.yml   PostgreSQL 15 + the API
requirements.txt     full pinned pip freeze for the Python environment
```

## Quickstart (local, no Supabase)

Prerequisites: Node 20+, and either Docker or Python 3.11+ with PostgreSQL 15+.

**With Docker (how it runs today):**

```powershell
cd services\api
docker compose up -d --build        # Postgres 15 + API on :8000, model mounted from ml\artifacts
docker exec -w /app api-api-1 python scripts/seed_dev.py
docker exec -w /app api-api-1 python scripts/seed_capacity.py
```

`services/api/.env` is optional (dev auth by default); copy `.env.example` to add local settings.

**Without Docker:**

```powershell
# 1. Database
# start PostgreSQL 15 locally (or only the db service: cd services\api; docker compose up -d db)

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
- `http://localhost:8000/docs` → OpenAPI UI (a static copy is in `docs/openapi.json`; regenerate with
  `python scripts/export_openapi.py`)

The trained model (`ml/artifacts/dwell_model_v2.joblib` + `model_metadata_v2.json`, 1.7 MB) is
committed, so a fresh clone serves predictions straight away. To rebuild it (same result, fixed
seed), train inside the API image so the scikit-learn version matches the server (the generator
imports the API's capacity simulator):

```powershell
# from the repo root
docker run --rm -v "${PWD}\ml:/repo/ml" -v "${PWD}\services\api:/repo/services/api:ro" `
  -w /repo/ml/scripts api-api sh -c "python generate_synthetic_v2.py && python prepare_data.py --version v2 && python train.py --version v2"
```

That writes `ml/artifacts/dwell_model_v2.joblib` and `ml/reports/metrics_v2.json`: test MAE 0.611
days and stress MAE 1.327 days (best baseline 0.942 / 2.030) — synthetic data, not real-world
accuracy. The run is reproducible.

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

Current state (24 Nov): `pytest` **241 passed** (plus **20** in `ml/tests`), `ruff check .` **clean**,
`mypy .` **0 errors**. Without a local Python, run the suite in Docker (command in
`BACKEND_FIXES_REPORT.md`). Frontend: 209 Vitest tests pass; Playwright (87) runs in mock mode.

```powershell
cd apps\web
npm run lint
npm run typecheck
npm test
```


### Live browser test

`apps/web/tests/live/` signs in through real Supabase as an importer, creates a shipment, runs a
prediction, adds cargo in the Load planner and opens every importer screen. It needs the API and
the web app running in live mode, and the account's email and password in two environment
variables (never in a file). Without them the tests are skipped. Each run leaves one
`LIVE-E2E-…` shipment on that account.

```powershell
cd apps\web
$env:PORTIQ_LIVE_EMAIL = "test@portiq.dev"
$env:PORTIQ_LIVE_PASSWORD = Read-Host "Password"
npm run test:live
```

Two more checks run when their accounts are set the same way: `PORTIQ_LIVE_OPERATOR_EMAIL` /
`PORTIQ_LIVE_OPERATOR_PASSWORD` (overview scope, no editing) and `PORTIQ_LIVE_ADMIN_EMAIL` /
`PORTIQ_LIVE_ADMIN_PASSWORD` (tariffs, audit log naming each actor). A real run ends with
"passed"; "skipped" means the variables were not set in that PowerShell window.

## Supabase integration (B11)

1. Follow backend spec section 18: create the project (asymmetric JWT signing keys, the default),
   copy the pooled `DATABASE_URL` if you host the database there, create the users.
2. In `services/api/.env` set `AUTH_MODE=supabase` and `SUPABASE_URL` — the JWKS URL, issuer and
   audience are derived from it. In `apps/web/.env.local` set the URL, the publishable key and
   `NEXT_PUBLIC_USE_MOCKS=false`. Both files already exist and are git-ignored; never commit them.
3. Run `alembic upgrade head` against the project, then have operators and admins sign up and sign
   in once, and promote them with `scripts/manage_users.py` (see "Managing users and roles").
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

## Managing users and roles

PortIQ has three roles:

| Role | Who | Can use |
| --- | --- | --- |
| `importer_exporter` | importers / exporters | their own shipments, predictions, dashboard, capacity, Load planner |
| `port_operator` | port managers | operator overview, shipments and capacity **for their assigned ports only**, recording arrivals and clearances |
| `platform_admin` | administrators | tariff rules, audit log, operator overview across every port |

### How it works

- **Sign-in identity lives in Supabase**: passwords, email confirmation and password resets.
- **The role lives in PortIQ's own database**, in the `profiles` table. A port operator's ports live
  in `operator_ports`.
- **New accounts:** the first time someone signs in, the API creates their profile as an
  **importer**. Nobody can sign up directly as an operator or an admin.
- **No self-promotion:** roles are changed only with the command below, never through the website or
  the API, so a user cannot promote themselves.
- **Changes apply immediately:** the API reads the role on every request, so there's no need to sign
  out and back in.
- **Every change is logged** in the audit log (Admin > Tariffs > Audit tab), recorded against the
  admin who made it.

### The command

Run it where the API runs. With Docker, from anywhere:

```powershell
docker exec -w /app api-api-1 python scripts/manage_users.py list
```

Without Docker, from `services\api`: `python scripts\manage_users.py list`.

| To… | Command (after `python scripts/manage_users.py`) |
| --- | --- |
| See everyone | `list` |
| Add an importer / exporter | Nothing to run: they sign up in the app and sign in once |
| Add a port manager | `set-role ana@example.com port_operator --ports INNSA,INMUN --by admin@example.com` |
| Change a port manager's ports | the same `set-role … port_operator --ports …` with the new list (it replaces the old one) |
| Add an admin | `set-role ben@example.com platform_admin --by admin@example.com` |
| Turn an operator or admin back into an importer | `set-role ana@example.com importer_exporter --by admin@example.com` |
| Remove someone's access (keeps their data) | `deactivate ana@example.com --by admin@example.com` |
| Give access back | `activate ana@example.com --by admin@example.com` |
| Delete someone completely | `delete ana@example.com --by admin@example.com` |

### Adding a person, step by step

1. **Account:** they sign up at the PortIQ sign-up page. Alternatively, invite them from the
   Supabase dashboard (Authentication > Users > Invite) and they set a password from the email.
2. **First sign-in:** they sign in once. That creates their profile as an importer, and they now show
   up in `list`.
3. **Role:** for an operator or admin, run `set-role`. Port codes are the ones in the `ports` table
   (`INNSA`, `INMUN`). Operators must have at least one port.

### Removing a person

- **Deactivate (normal case).** The account is blocked straight away (every API call returns 403),
  but their shipments, predictions and audit history stay intact and readable by others. It can be
  undone with `activate`.
- **Delete (only for accounts with no history).** `delete` refuses any user who owns shipments,
  predictions, events, tariff rules or audit entries, because that history must keep its owner. Use
  `deactivate` for them. After deleting, also remove the person in Supabase (Authentication >
  Users); otherwise their next sign-in creates a fresh importer profile.

### Safety rules built into the command

- `--by` must be an **active admin**. It's only optional while the database has no active admin at
  all, so you can create the very first admin:
  `set-role you@example.com platform_admin`.
- The **last active admin** cannot be demoted, deactivated or deleted. Promote another admin first.
- Admins cannot delete themselves.
- Email matching ignores upper and lower case.

Behaviour is covered by `services/api/tests/test_manage_users.py`.

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
| GET | `/shipments/{id}/predictions`, `/shipments/{id}/predictions/{prediction_id}` | importer (own), operator (scoped) |
| GET | `/capacity/forecast` | all (operators scoped) |
| GET | `/admin/tariffs`, POST, PATCH `/{id}` | admin |
| GET | `/admin/audit-logs` | admin |
| GET | `/operator/overview`, `/operator/shipments` | operator (scoped), admin (all ports) |
| GET | `/operator/dashboard/summary` | operator — older route outside the frozen contract |
| POST | `/predict/dwell` | any authenticated user — diagnostic, outside the frozen contract |

Every endpoint the frontend calls now exists. Remaining backend gaps are listed in
`docs/PROJECT_STATUS.md` and `docs/architecture.md`.

## Documentation

- `docs/BACKEND_SPEC.md` — the backend contract (source of truth)
- `docs/FRONTEND_SPEC.md` — the frontend contract, including the HTTP shapes (section 5)
- `docs/architecture.md` — how the pieces fit, auth, RLS, prediction pipeline, limitations
- `docs/security-checklist.md` — control-by-control status
- `services/api/CONTRACT_GAPS.md` — every undefined corner and the one function that owns it
- `docs/PROJECT_STATUS.md` — current stage, completion, pending work and architecture reference
- `docs/load-planner-integration.md` — the 3D Load planner and how to feed it real cargo
- `docs/LOAD_PLANNER_PLAN.md` — real cargo, shared containers and live updates: decisions, API contract, progress
- `PORTIQ_THEME_CHANGES.md`, `BACKEND_FIXES_REPORT.md` — change reports
- `services/api/README.md` — API-specific setup, migrations, database notes
