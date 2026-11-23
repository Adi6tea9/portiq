# PortIQ — Project Status

> Living status file for the whole repo: where the project stands, what is pending, and how the
> code fits together. Last updated: **22 Nov 2026**. Scope: `apps/web`, `services/api`, `ml/`,
> `docs/`, `features/`, migrations, seeds, mocks, tests.
> Earlier versions of this file were a one-off review (13 Nov 2026). Everything below describes
> what the code **does today**; where the code and the specs disagree it says so (§9).

---

## Status at a glance

**Development stage: B11 in progress — the app now runs live on Supabase sign-in (switched 23 Nov); live flow testing, account roles and the Load planner's real-data stage remain.**
Everything is built and tested in isolation. The frontend runs on mocks, the backend runs in
Docker with the trained model, and the two have not yet been run together against a real Supabase
project. Against the spec timeline (B10 due 24–26 Nov, B11 27–30 Nov, buffer and report 1–4 Dec)
the project is slightly ahead of schedule.

| Area | Done | State |
|---|---|---|
| Frontend (`apps/web`) | ~97% | F01–F10 built with Vitest + Playwright coverage, plus the PortIQ theme and the 3D Load planner tab. Runs on MSW mocks. |
| Backend (`services/api`) | ~97% | B01–B10 done. B11 code and docs written, never run against a real project. |
| ML (`ml/`) | ~98% | v2 pipeline, metadata, reference data, per-year calibration, model card, data dictionary and 19 ML tests done. Reference source and licence confirmed 24 Nov (data.gov.in, NDSAP/GODL; 3 files, downloaded 2026-11-11). |
| Live integration | ~50% | API in `AUTH_MODE=supabase`, web app live (mocks off), Supabase ES256 keys verified, one real account signed in. Flows not yet tested live; operator/admin accounts not set up. |
| Deployment / tooling | ~20% | Docker runs API + Postgres only. No frontend container, no CI, no hosting, no git repository. |
| **Overall** | **~92%** | |

Percentages are judgement against the spec deliverables, not a measured number.

### Feature checklist

| Spec item | State |
|---|---|
| F01 Setup, shell, mocks | Done |
| F02 Auth and navigation | Done (mock mode; live mode needs Supabase keys) |
| F03 Shipment create and list | Done |
| F04 Shipment detail and events | Done |
| F05 Run prediction and result page | Done |
| F06 Capacity forecast | Done |
| F07 Importer dashboard | Done |
| F08 Operator overview | Done |
| F09 Admin tariffs and audit trail | Done (backend tariff API now matches the contract) |
| F10 Settings, landing, a11y, E2E | Done |
| Extra: PortIQ theme restyle | Done (`PORTIQ_THEME_CHANGES.md`) |
| Extra: Load planner (3D container) | Done, sample cargo only (`docs/load-planner-integration.md`) |
| B01 Scaffold | Done |
| B02 Database, migrations, seed | Done |
| B03 Auth, profiles, config, ports | Done (dev mode tested; Supabase JWKS path unit-tested only) |
| B04 Shipments and events | Done |
| B05 Capacity simulator and forecast | Done |
| B06 Synthetic data and training | Done: per-category metrics, spec baseline, full `model_metadata_v2.json`, schema validation, reference data (2020–2022, hours) with per-year calibration (all within 15%), `docs/model-card.md`, `docs/data-dictionary.md`, `ml/tests/` (19). Reference source: data.gov.in "Port Dwell Time" (NDSAP/GODL), 3 files, downloaded 2026-11-11 |
| B07 Model service and SHAP | Done (v2 bundle, log-target SHAP, metadata-driven versions, correct v2 defaults) |
| B08 Cost engine and tariff admin | Done (tariff routes rewritten 22 Nov: all filters, envelope, `conflicting_rule`) |
| B09 Prediction orchestration | Done (real model, SHAP, capacity snapshot) |
| B10 Operator, hardening, contract tests | Done: section 14 endpoints, audit logs, single-prediction GET, rate limit, 1 MiB body cap, date-range rules, `export_openapi.py` → `docs/openapi.json`, contract tests against the frontend mocks, full section 7 auth matrix |
| B11 Supabase integration | In progress: switched to live Supabase sign-in 23 Nov; user/role management command added. Left: live pass of every flow, operator/admin accounts, demo data for real accounts, smoke script |

### Quality gates (22 Nov 2026)

| Check | Result |
|---|---|
| Backend `pytest` (Docker, Postgres 15) | **197 passed** |
| ML `pytest ml/tests` | **20 passed** |
| Backend `ruff check .` | clean |
| Backend `mypy .` | **0 errors** (was 26 on 22 Nov) |
| Frontend typecheck / lint | clean |
| Frontend Vitest | 23 files, 191 tests passing (one known timing flake under load) |
| Frontend Playwright (mock mode, local Chrome) | 85 passed |
| Frontend production build | passes |
| Live API | `/ready` = ready (database ok, model loaded); live prediction with SHAP explanation verified |

### Pending work, in priority order

1. **Live integration (B11).** Paste the Supabase project URL and publishable key into
   `apps/web/.env.local` and `services/api/.env` (`AUTH_MODE=supabase`), run one full manual pass
   with mocks off, create operator/admin accounts with SQL, run `scripts/smoke_supabase.py`.
2. **Load planner real data.** Shipment link, stored cargo lines, editing (still sample cargo).
3. **Housekeeping.** Align one partial-total message with the spec wording.
4. **Deployment and delivery.** Initialise git, add CI, a frontend container and hosting; then
   the 1–4 Dec slot: demo script, report, slides.

### Change log since the 13 Nov review

| Date | Change | Record |
|---|---|---|
| 21–22 Nov | PortIQ theme restyle across the app, photo sign-in, account-type toggle | `PORTIQ_THEME_CHANGES.md` |
| 22 Nov | 3D Load planner tab (importers and operators), compressed container models | `PORTIQ_THEME_CHANGES.md` stage 7, `docs/load-planner-integration.md` |
| 22 Nov | Backend fixes: model trained (v2), v2 SHAP explanations, start-up path crash, compose health check, `train.py` file name, Docker now runs this copy | `BACKEND_FIXES_REPORT.md` part 1 |
| 22 Nov | Supabase boilerplate: JWKS/issuer/audience derived from `SUPABASE_URL`, `.env` templates, `.env.local` git-ignored | `BACKEND_FIXES_REPORT.md` part 1 |
| 22 Nov | B10 endpoints: operator overview, operator shipments, audit logs, single-prediction GET; demo capacity seeded | `BACKEND_FIXES_REPORT.md` part 2 |
| 22 Nov | B10 completed: body cap, date-range rules, OpenAPI export, contract tests, auth matrix; tariff routes rewritten; duplicate capacity router removed | `BACKEND_FIXES_REPORT.md` part 3 |
| 22 Nov | B06 completed: metadata, per-category metrics, calibration report, model card, data dictionary, ML tests; CG-015 resolved; API defaults for the v2-only inputs fixed (they biased predictions by −0.42 days) | `BACKEND_FIXES_REPORT.md` part 4 |
| 24 Nov | Reference data source and licence confirmed: data.gov.in "Port Dwell Time" (NICDC LDB), NDSAP / GODL-India, attribution required; the 3 catalog files are the 3 reference CSVs, downloaded 2026-11-11 | docs/data-dictionary.md |
| 23 Nov | Smaller items: shipments collect customs channel, importer type and cargo priority, holidays derived from the date (served MAE 0.732 → 0.610, CG-021, migration 0002); capacity simulator caches each day (about 68x faster, identical output); reference data's probable source recorded; `features/` files renamed and F04 added; `ComingSoon.tsx` and duplicate PyJWT pin removed; mypy 11 → 0 errors | CONTRACT_GAPS CG-021 |
| 23 Nov | Switched to live Supabase sign-in (fixed three `.env` values); `scripts/manage_users.py` to add/remove importers, port operators and admins (audited, last-admin guard, 13 tests) | README "Managing users and roles" |

---

## Contents

0. [Status at a glance](#status-at-a-glance)
1. [What the product is](#1-what-the-product-is)
2. [Repo layout](#2-repo-layout)
3. [The four tiers](#3-the-four-tiers)
4. [How the two apps relate — the envelope contract](#4-how-the-two-apps-relate--the-envelope-contract)
5. [Request lifecycle — frontend](#5-request-lifecycle--frontend)
6. [Request lifecycle — backend](#6-request-lifecycle--backend)
7. [Data model and file relationships](#7-data-model-and-file-relationships)
8. [The five workflows worth tracing](#8-the-five-workflows-worth-tracing)
9. [Review findings — status](#9-review-findings--status)
10. [Testing layout](#10-testing-layout)
11. [Environment, run, seed](#11-environment-run-seed)
12. [Mental model to keep](#12-mental-model-to-keep)
13. [File-by-file map](#13-file-by-file-map)

---

## 1. What the product is

A role-based port/logistics **planning prototype**. Three roles, three different product surfaces:

| Role | Sees | Main job |
|---|---|---|
| `importer_exporter` | dashboard, shipments, capacity | create a shipment, get estimated dwell + indicative cost + SHAP explanation |
| `port_operator` | operator overview, capacity | port-scoped aggregates, mark `arrived` / `cleared` |
| `platform_admin` | operator overview, tariffs | maintain demo tariff rules, read audit trail |

The shipment lifecycle is the *actual* lifecycle:

```
submitted ──(operator marks arrival)──▶ arrived ──(operator marks clearance)──▶ cleared
```

A prediction **never** changes the actual status. Predictions are immutable snapshots stored beside the shipment.

Everything is synthetic. The code is explicit about it: `is_demo_data: true` on every prediction, a `DEMO_DATA` warning on every run, a "Synthetic demo data" badge in mock mode, and `source_type: synthetic` on capacity buckets.

Honesty constraints from the spec (and honoured in the UI copy):

- No live terminal integration.
- All data is synthetic demo data.
- Estimates are not guarantees and not an official customs assessment.
- Predicted values and actual values are different things.

---

## 2. Repo layout

The working copy is a plain folder (not a git repository):

```
college report file\portiq-main\          ← project root (all paths below are relative to it)
├── README.md                          ← quickstart, status table, endpoints
├── PORTIQ_THEME_CHANGES.md            ← frontend theme + Load planner change report
├── BACKEND_FIXES_REPORT.md            ← backend/ML fixes and B10 endpoint report
├── PortIQ_Frontend_Master_Spec_v1.md
├── requirements.txt                   ← full pinned pip freeze
├── docs\
│   ├── FRONTEND_SPEC.md               ← the JSON contract (§5 is law)
│   ├── BACKEND_SPEC.md                ← behaviour, data, decisions
│   ├── architecture.md                ← how the pieces fit, known limitations
│   ├── security-checklist.md          ← control-by-control status
│   ├── load-planner-integration.md    ← 3D load planner notes
│   ├── PROJECT_STATUS.md              ← this file
│   └── superpowers\plans\             ← dated implementation plan
├── features\                          ← the F01–F10 prompt files (file names do not match contents)
├── apps\web\                          ← Next.js frontend
├── services\api\                      ← FastAPI backend + docker-compose.yml (API + Postgres 15)
└── ml\                                ← offline ML pipeline
```

Things worth remembering:

- `docker-compose.yml` lives in `services/api/`, not at the root. It runs Postgres 15 and the API,
  mounts `ml/artifacts` read-only at `/models`, and starts the API only once Postgres is healthy.
- An older copy of the project exists at `D:\portiq\portiq-main`. Docker used to run it; since
  22 Nov both containers are built from this copy and the D: copy is unused.
- There is no Supabase CLI config in this copy. Supabase will be a hosted project; its values go in
  `services/api/.env` and `apps/web/.env.local` (both git-ignored).

---

## 3. The four tiers

```
┌─────────────────────────────┐
│ docs/ + features/           │  the specs (contract is law)
│ FRONTEND_SPEC, BACKEND_SPEC │
└──────────────┬──────────────┘
               │ defines shapes
       ┌───────┴────────┐
       ▼                ▼
┌──────────────┐  ┌────────────────┐   ┌──────────────┐
│ apps/web     │  │ services/api   │   │ ml/          │
│ Next.js 14   │─▶│ FastAPI        │◀──│ train/predict│
│ TypeScript   │  │ SQLAlchemy 2   │   │ joblib       │
└──────────────┘  └───────┬────────┘   └──────────────┘
  React Query             │
  MSW (mock mode)         ▼
                   Postgres 15 / Supabase
```

### Frontend — `apps/web`

| Concern | Choice |
|---|---|
| Framework | Next.js 14 App Router, React 18, strict TypeScript |
| Styling | Tailwind + design tokens in `app/globals.css`, shadcn/ui + Radix primitives |
| Data | TanStack Query (`lib/api/hooks/`) + TanStack Table (`components/shared/DataTable.tsx`) |
| Forms | React Hook Form + Zod (`lib/*/schema.ts`) |
| Charts | Recharts (`CapacityChart.tsx`, `ExplanationChart.tsx`) |
| Auth | `@supabase/ssr` for session only — the API authorises |
| Mock API | MSW 2 (`lib/mocks/`) |
| Tests | Vitest + Testing Library; Playwright + axe |
| 3D | three.js + React Three Fiber + drei, lazy-loaded on `/load-planner` only |

### Backend — `services/api`

| Concern | Choice |
|---|---|
| Framework | FastAPI, Pydantic v2 |
| DB | SQLAlchemy 2.x **sync** + psycopg 3 |
| Migrations | Alembic, one hand-written initial revision |
| Auth | PyJWT (dev tokens locally, Supabase JWKS in production) |
| ML | scikit-learn bundle loaded with joblib at startup, SHAP for explanations |
| Runtime | Docker Compose: API + Postgres 15 |
| Quality | ruff, mypy, pytest (+ coverage) |

### ML — `ml/`

| Folder | Contents |
|---|---|
| `data/raw/` | `synthetic_v2.csv` and `synthetic_v2_stress.csv` (regenerated, git-ignored); v1 files when built |
| `data/processed/v2/` | `train / val / test / stress` splits (7 000 training rows) |
| `scripts/` | `generate_synthetic.py` (v1), `generate_synthetic_v2.py`, `prepare_data.py`, `train.py` |
| `artifacts/` | `dwell_model_v2.joblib` + `model_metadata_v2.json` (committed so a fresh clone runs; rebuilt 22 Nov) |
| `reports/` | `metrics.json` (v1), `metrics_v2.json` (baselines, search, chosen model, per-category MAE, checks, intervals, ablations), `calibration_v2.json` |
| `tests/` | `test_pipeline.py` (19 tests: reproducibility, validation, time split, train-only fitting, calibration incl. per reference year, artifact + metadata) |
| `data/reference/` | real monthly port dwell averages 2020–2022 in hours (committed; source not recorded) |

### Database

One `public` schema, 9 tables, 12 enum types, RLS **enabled with zero policies** (see §6).

---

## 4. How the two apps relate — the envelope contract

The contract is a single HTTP boundary with a fixed JSON envelope.

**Success**

```json
{
  "data": "...",
  "meta": { "request_id": "uuid", "pagination": { "page": 1, "page_size": 20, "total": 57 } }
}
```

**Error**

```json
{
  "error": {
    "code": "STATE_CONFLICT",
    "message": "That status change is not allowed.",
    "details": [{ "field": "occurred_at", "issue": "must not be before actual_arrival_at" }],
    "request_id": "uuid"
  }
}
```

Both sides encode this shape:

| Side | File | Role |
|---|---|---|
| Backend | `app/schemas/envelope.py` | builds success envelopes, `Pagination`, `ErrorDetail` |
| Backend | `app/core/errors.py` | `AppError`, status→code map, exception handlers so **every** failure (Pydantic 422, HTTPException, unhandled 500) comes out as the error envelope |
| Frontend | `lib/api/client.ts` | parses the envelope, throws typed `ApiError`, maps status→code/message as a fallback for non-JSON bodies, never crashes on a bad body |
| Frontend | `lib/api/types.ts` | hand-mirrored types for every schema |

The hand-mirroring is the seam where drift happens — see §9.

Error codes in use: `BAD_REQUEST`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `STATE_CONFLICT`, `VALIDATION_ERROR`, `RATE_LIMITED`, `INTERNAL_ERROR`, `MODEL_UNAVAILABLE`, plus the domain codes `IDEMPOTENCY_CONFLICT` and `TARIFF_CONFLICT`.

---

## 5. Request lifecycle — frontend

### Provider stack

`app/(app)/layout.tsx` mounts everything:

```tsx
<AppProviders initialRole="importer_exporter">
  <AppShell>
    <AppGuard>{children}</AppGuard>
  </AppShell>
</AppProviders>
```

Which expands to:

```
QueryClientProvider        caching, retry 1, staleTime 30s, no refetch on focus
└ RoleProvider             mock-only role (localStorage), or /me role in real mode
  └ MockProvider           starts the MSW service worker before first render
    └ MeProvider           GET /me → { me, role, isAuthenticated, error }
      └ AppShell           sidebar + top bar + collapse + mobile sheet + profile menu
        └ AppGuard         auth redirect + role table check
          └ page.tsx       thin: reads searchParams mock flags, renders feature client
            └ *Client.tsx  feature state, filters, tabs, pagination
              └ lib/api/hooks/use*.ts    React Query
                └ lib/<feature>/api.ts    builds query string, calls apiClient
                  └ lib/api/client.ts     Bearer token, Idempotency-Key, 401 redirect
                    └ fetch(...)
```

### The full route table

| Route | Group | Component | Roles |
|---|---|---|---|
| `/` | public | `app/page.tsx` (static landing) | all |
| `/login`, `/signup`, `/forgot-password`, `/reset-password` | `(auth)` | `components/features/auth/*Form.tsx` | anonymous |
| `/auth/callback` | route handler | Supabase code exchange | anonymous |
| `/dashboard` | `(app)` | `DashboardClient` | importer |
| `/shipments` | `(app)` | `ShipmentsList` | importer |
| `/shipments/new` | `(app)` | `NewShipmentForm` | importer |
| `/shipments/[id]` | `(app)` | `ShipmentDetailClient` | importer, operator |
| `/shipments/[id]/edit` | `(app)` | `EditShipmentPageClient` | importer |
| `/shipments/[id]/prediction/[predictionId]` | `(app)` | `PredictionResultClient` | importer, operator |
| `/capacity` | `(app)` | `CapacityClient` | importer, operator |
| `/load-planner` | `(app)` | `LoadPlannerClient` (3D, client-side only, sample cargo) | importer, operator |
| `/operator` | `(app)` | `OperatorClient` | operator, admin |
| `/admin/tariffs` | `(app)` | `TariffsClient` | admin |
| `/settings` | `(app)` | `SettingsForm` | all |
| `/dev/sandbox` | `(app)` | component/fixture showcase | all, **guard-exempt**, 404 in prod |

### Three separate routing concerns (deliberately not merged)

| File | Answers |
|---|---|
| `lib/navigation.ts` | what appears in the sidebar for each role |
| `lib/auth/route-access.ts` | which role may open which URL (enforced client-side by `AppGuard`) |
| `middleware.ts` | is there a session at all (edge, runs before render) |

`route-access.ts` returns `null` for unknown paths so Next.js' own 404 handling still works.

### Two interception points that matter

**1. MSW** — when `NEXT_PUBLIC_USE_MOCKS=true`, the service worker (`public/mockServiceWorker.js`) answers `fetch` from `lib/mocks/handlers.ts` + `lib/mocks/fixtures/*`. 21 handlers:

```
GET/PATCH /me                       GET /config                    GET /ports
GET  /shipments                     GET /shipments/summary
POST /shipments                     GET /shipments/:id
PATCH /shipments/:id                POST /shipments/:id/events
POST /shipments/:id/prediction      GET /shipments/:id/predictions
GET  /shipments/:id/predictions/:predictionId
GET  /capacity/forecast
GET  /operator/overview             GET /operator/shipments
GET  /admin/tariffs                 POST /admin/tariffs            PATCH /admin/tariffs/:ruleId
GET  /admin/audit-logs
```

Plus deterministic failure injection, all mock-only and gated by `lib/mocks/flags.ts`:

| Flag | Effect |
|---|---|
| `?mock_error=409` | any primary GET/POST fails with that status |
| `?mock_run_error=503` | only the prediction POST fails |
| `?mock_event_error=409` | only the event POST fails |
| `?mock_empty=1` | empty lists/summaries so every card shows its empty state |
| `?mock_invalid=1` | invalid capacity buckets |
| `?mock_capacity_error=<code>` | only the capacity call fails (proves card isolation) |
| `?mock_latest_shipment=<id>` | forces which shipment the dashboard "latest" cards describe |
| `?mock_error=TARIFF_CONFLICT` | tariff 409 shortcut |

Fixtures: 12 shipments, 5 prediction variants (full / partial / no explanation / no capacity / all unavailable), 60 capacity buckets, 40 operator rows, 6 tariffs, 15 audit logs, and an error payload for every status.

**2. Supabase session** — in real mode `getAccessToken()` reads the SDK session and `apiClient` attaches `Authorization: Bearer <jwt>`; `middleware.ts` refreshes cookies and redirects unauthenticated hits on seven protected prefixes (including `/load-planner`). Mock mode stores a session-only flag in `sessionStorage` and never stores a token.

### Why the pages are thin

Every page is a wrapper so mock flags can be read on the server:

```tsx
// app/(app)/shipments/page.tsx
export default function ShipmentsPage({ searchParams }) {
  return <ShipmentsList mockError={mockFlagValue(searchParams, "mock_error")} />;
}
```

`mockFlag` returns nothing unless `NEXT_PUBLIC_USE_MOCKS=true`, so no mock parameter can ever leak to the real API.

---

## 6. Request lifecycle — backend

### App factory

```
uvicorn app.main:app
└ create_app()
  ├ configure_logging(LOG_LEVEL)                       JSON logs
  ├ dwell_model.load(MODEL_PATH or <repo>/ml/artifacts/dwell_model_v2.joblib)   never crashes on a missing file
  ├ RequestContextMiddleware                           request_id, X-Request-ID, per-request log line, 500 boundary
  ├ CORSMiddleware                                     ALLOWED_ORIGINS, credentials, expose X-Request-ID
  ├ register_exception_handlers                        AppError / HTTPException / ValidationError / Exception
  └ routers
     ├ GET /health          → {"data":{"status":"ok"}}
     ├ GET /ready           → 200 only if database AND model are up; else 503 with details [{component,state}]
     └ /api/v1
        ├ api_router: me, config, ports, shipments, capacity, predict
        └ admin.router (tariffs, audit-logs), operator.router (overview, shipments, dashboard/summary)
```

`RequestContextMiddleware` is the only place that can emit a 500 without a traceback leaking: it catches, logs `unhandled_exception`, and renders the standard error envelope.

### Layering inside a route

The good modules follow this strictly:

```
route (app/api/v1/*.py)
   ├ auth dependency     require_role(...) / CurrentUser
   ├ validation          Pydantic schemas
   ├ business rules      state machine, ownership, rate limits
   └ envelope()          response shape

   → repositories (app/repositories/*.py)     pure SQLAlchemy, NO auth decisions
       → models (app/models/tables.py)        9 tables, enums, checks, indexes
           → Postgres

   → services (app/services/*.py)             prediction, cost_engine, ml, explain, at_risk, capacity_sim
```

### Authorization lives in Python, not the database

This is the single most important design decision in the backend:

- `ENABLE ROW LEVEL SECURITY` is set on all 9 application tables and **no policies are created** (`migrations/versions/0001_initial.py`).
- Direct access from Supabase `anon` / `authenticated` roles is therefore denied by default. Only the API can read or write.
- The API connects as the **table owner**, which bypasses RLS by design. `FORCE ROW LEVEL SECURITY` is deliberately not set (it would break the seed and migrations).
- So every rule is enforced in Python:
  - role from `profiles.role`
  - port scope from `operator_ports`
  - ownership from `shipments.owner_user_id`
- Non-visible rows return **404, not 403** (`_visible_shipment` in `app/api/v1/shipments.py`), so shipment ids cannot be probed.
- The explicit warning in `docs/architecture.md`: if the deployed API ever connects as a non-owner role, RLS will start applying and explicit policies must be written first.

### Auth dependencies

`app/core/deps.py` provides:

| Dependency | Behaviour |
|---|---|
| `get_db` | one session per request, commit on success, rollback on any raise, always close |
| `get_current_user` | reads the Bearer token through `core/security.resolve_identity` (`dev:<email>` in `AUTH_MODE=dev`, JWKS-verified JWT in `AUTH_MODE=supabase`), loads/provisions `profiles`, rejects inactive users with 403 |
| `require_role(*roles)` | dependency factory → 403 `FORBIDDEN` if role not allowed |
| `CurrentUser`, `DbSession` | `Annotated` aliases |

First-time Supabase users are auto-provisioned as `importer_exporter`; the `IntegrityError` path handles a concurrent first request.

### Schema discipline

- `app/schemas/enums.py` is the **single** enum source.
- `migrations/versions/0001_initial.py` creates the matching Postgres enum types from the same value list.
- `app/models/tables.py` builds SQLAlchemy enums with `values_callable` so the *values* (`importer_exporter`) are stored, not the member names.
- A value present in Python but missing from Postgres is rejected by the database — that is the intended cross-check.
- Money is `Numeric` and handled as `Decimal` in Python, never `float`, serialised as a 2-decimal string.
- All `timestamptz` columns store UTC; the API renders ISO-8601 ending in `Z` (`utc_z()` in `app/schemas/shipments.py`).

---

## 7. Data model and file relationships

### Tables

```
profiles ──┬──< shipments >── ports ──< capacity_forecasts
           │      │   │                │
           │      │   └──< shipment_events        append-only
           │      └──────< prediction_runs        immutable snapshot (JSONB)
           │
           ├──< operator_ports >── ports           operator ↔ port scope
           ├──< tariff_rules                       never deleted; is_active flips
           └──< audit_logs                         append-only
```

| Table | Purpose | Immutability rule |
|---|---|---|
| `profiles` | one row per Supabase user, carries `role` | — |
| `ports` | port codes (INNSA, INMUN), timezone | — |
| `operator_ports` | which operator covers which port | — |
| `shipments` | the container record + actual timestamps | — |
| `shipment_events` | milestone timeline | append-only, no update/delete in any repository |
| `prediction_runs` | full snapshot of one prediction decision | immutable: input hash, model/dataset version, tariff versions, JSONB payloads |
| `capacity_forecasts` | daily yard/berth buckets | idempotent by unique (port, resource, bucket, version) |
| `tariff_rules` | cost rules with scope + validity window | never deleted; deactivation sets `is_active=false` |
| `audit_logs` | who did what, before/after | append-only |

### Which file touches which table

| Table | Model | Repository | Route(s) | Schema |
|---|---|---|---|---|
| `profiles` | `models/tables.py` | `repositories/profiles.py` | `me.py` | `schemas/me.py` |
| `ports` | `tables.py` | `repositories/ports.py` | `ports.py` | `schemas/ports.py` |
| `operator_ports` | `tables.py` | `repositories/operator_ports.py` | `me.py`, `shipments.py`, `capacity.py`, `operator.py` | — |
| `shipments` | `tables.py` | `repositories/shipments.py` | `shipments.py` | `schemas/shipments.py` |
| `shipment_events` | `tables.py` | `repositories/shipments.py` | `shipments.py` | `schemas/shipments.py` |
| `prediction_runs` | `tables.py` | `repositories/shipments.latest_predictions` + `services/prediction.py` | `shipments.py`, `operator.py` | `schemas/prediction.py` |
| `capacity_forecasts` | `tables.py` | `repositories/capacity.py` (shared validity rule) | `capacity.py`, `operator.py`, prediction snapshot | `schemas/capacity.py` (`bucket_payload`) |
| `tariff_rules` | `tables.py` | `repositories/tariffs.py`, read by `services/cost_engine.py` | `admin.py` | `schemas/admin.py` |
| `audit_logs` | `tables.py` | `repositories/audit_logs.py` | written by `shipments.py`, `admin.py`; read by `GET /admin/audit-logs` | — |

### Migrations and seed

- One revision: `migrations/versions/0001_initial.py` — 9 tables, 12 enum types, all check constraints and indexes, RLS enabled, and a `downgrade` that also drops the enum types.
- `migrations/env.py` reads `DATABASE_URL` through `app.core.config`, so the URL lives in one place.
- `scripts/seed_dev.py` is idempotent **by design**: every row gets `uuid5(SEED_NAMESPACE, "portiq:dev-seed:<natural key>")`, and ports/users/shipments/tariffs are also looked up by natural key first. A re-run inserts only what is missing and never overwrites human edits. It refuses any `APP_ENV` other than `local` or `test`.

Seeded counts from `seed_dev.py` (the local dev database also has 475 capacity buckets from
`seed_capacity.py --start 2026-10-15`, added 22 Nov):

```json
{"row_counts": {"profiles": 5, "ports": 2, "operator_ports": 3, "shipments": 12,
 "shipment_events": 21, "prediction_runs": 0, "capacity_forecasts": 0,
 "tariff_rules": 12, "audit_logs": 0}}
```

---

## 8. The five workflows worth tracing

### (a) Sign in

```
LoginForm
  → lib/auth/actions.signInWithPassword()
      mock mode → sessionStorage flag + `portiq:mock-auth` event → MeProvider refetches /me
      real mode → supabase.auth.signInWithPassword → cookies set by @supabase/ssr
  → middleware.ts (real mode) refreshes the session cookie on every navigation
  → MeProvider → GET /me
      → deps.get_current_user → jwt decode → profiles lookup or auto-provision
  → AppGuard → canAccessPath(me.role, pathname) → render or permission page
  → AppShell sidebar items ← navForRole(role)
```

Safe return paths: `/login?returnTo=…` is validated by `lib/auth/return-path.ts` so only internal paths are restored.

### (b) Shipment list

```
ShipmentsList
  → useShipments(params)                     queryKey includes every filter + mock flag
  → fetchShipments → GET /shipments?status&arrival_from&arrival_to&q&page&page_size
  → require_role(importer|operator)
  → _scope(user, session): operator → {port_ids}, importer → {owner_user_id}
  → shipments_repo.list_shipments + count_shipments + latest_predictions (Postgres DISTINCT ON)
  → shipment_response() per item (adds latest_prediction + computed actual_dwell_days)
  → envelope(data, request_id, pagination)
```

### (c) Operator milestone — the only state machine

```
POST /shipments/{id}/events        operator only
  ALLOWED_TRANSITIONS = { submitted → arrived, arrived → cleared }
  reject occurred_at > now + 5min
  reject cleared before actual_arrival_at
  → set actual_arrival_at / actual_cleared_at
  → append shipment_events row
  → append audit_logs row  (action="shipment.<status>", before/after snapshots)
  anything else → 409 STATE_CONFLICT
```

### (d) Run prediction — the most layered flow

```
RunPredictionButton (creates a UUID Idempotency-Key per run)
  → POST /shipments/{id}/prediction   header: Idempotency-Key
  → _visible_shipment()                        ownership or port scope
  → run_prediction_flow()
      ├ check_rate_limit()                     10 requests/min/user, in-memory dict
      ├ hash inputs → existing run?  same hash → 200 replay
      │                              different → 409 IDEMPOTENCY_CONFLICT
      ├ capacity_snapshot                      stored yard bucket for the arrival day, or "unavailable"
      ├ predicted_dwell_days                   the loaded v2 model, on a worker thread with a timeout (503 if it fails)
      ├ explain()                              SHAP, checked for additivity, or "unavailable"
      ├ calculate_costs(shipment, dwell, active_rules)
      │    scope match → specificity ranking → ambiguity ⇒ unavailable
      │    rate math: flat / percent_of_value / per_day (free_days) / tiered (tier_config)
      ├ persist immutable PredictionRun
      │    JSONB: cost_breakdown, explanation, capacity_snapshot, warnings, input_snapshot
      │    scalar: input_hash, model_version, dataset_version, data_source, is_demo_data
      └ 201, or 200 on idempotent replay
```

`services/cost_engine.py` is the strongest module in the backend: pure functions, `Decimal` throughout, `ROUND_HALF_UP`, explicit `unavailable` lines per component so `total_is_partial` is honest instead of silently summing partial data. Specificity is computed by counting non-null scope fields; ties are treated as ambiguity, not guessed.

### (e) Offline ML pipeline

```
ml/scripts/generate_synthetic_v2.py   ← imports app.services.capacity_sim.utilization_for()
   → data/raw/synthetic_v2.csv, synthetic_v2_stress.csv

ml/scripts/prepare_data.py --version v2
   → data/processed/v2/{train,val,test,stress}.csv

ml/scripts/train.py --version v2
   → baselines (per port/direction mean and median)
   → candidates: RandomForest and HistGradientBoosting, with and without a log target,
     tuned on validation only; test and stress scored once
   → chosen: HistGradientBoosting + log1p target, inside Pipeline(prep, reg)
   → q10 / q90 quantile models + calibration margin for the range
   → serve="model" only if it beats both baselines on test AND stress
   → artifacts/dwell_model_v2.joblib (bundle) + .meta.json, reports/metrics_v2.json

API startup
   → dwell_model.load(artifact)             is_loaded drives /ready
POST /shipments/{id}/prediction
   → model_service.predict_dwell → explain.explain (SHAP in log space, mapped to days)
```

v2 results (synthetic data only): test MAE **0.611** days vs 0.942 for the best baseline, stress
MAE **1.327** vs 2.030; the calibrated 10th–90th range covers 82% of test cases. Training is
reproducible (fixed seed): the 22 Nov rebuild matched the committed report exactly. Train inside the
API image so the scikit-learn version matches the one that loads the bundle.

---

## 9. Review findings — status

The 13 Nov review listed nine places where the code and the docs disagreed. Status as of 22 Nov,
each re-checked against the code:

| # | Finding (13 Nov) | Status | Notes |
|---|---|---|---|
| 9.1 | Prediction flow returned a hardcoded 6.2 days and ignored the model | **Resolved** | `prediction.py` calls `predict_dwell` and `explain`; live prediction with SHAP verified 22 Nov. |
| 9.2 | Auth bypassed `core/security.py`; dev tokens dead; JWT secret committed | **Resolved** | `deps.get_current_user` uses `security.resolve_identity`; `AUTH_MODE` honoured; no shared secret anywhere. |
| 9.3 | Four frontend endpoints had no backend route | **Resolved** | Operator overview, operator shipments, audit logs, single-prediction GET added 22 Nov with 19 tests. |
| 9.4 | Frontend README called the backend a placeholder | **Resolved** | Updated 22 Nov. |
| 9.5 | `admin.py`: non-committing session helper, naive datetimes, raw ORM dicts, `HTTPException` | **Resolved** | Tariff routes rewritten 22 Nov (standard session, envelope, `AppError`, every filter); the unused `app.db.get_db` is deleted. |
| 9.6 | `capacity_sim` replays from 2025-01-01 on every call | **Resolved 23 Nov** | Each simulated day is cached per port/resource; 976 calls went from 4.06 s to 0.06 s with identical outputs. |
| 9.7 | `ml.py` rebuilds features heuristically | **Resolved** | The step lookup handles `prep` (v2) and `preprocessor` (v1); v2 defaults use the training vocabulary and a test pins them to the trained categories and ranges. |
| 9.8 | Duplicate `PyJWT` pin with different versions | **Resolved 23 Nov** | One pin left: `PyJWT[crypto]==2.15.1`. |
| 9.9 | Supabase CLI config outside the repo, pointing at a missing seed | **No longer applies** | No Supabase CLI config in this copy; Supabase will be hosted. |

New findings since the review:

| Finding | Status |
|---|---|
| SHAP explanations broke with the v2 bundle (log target, different step names) | Resolved 22 Nov (`explain.py`) |
| `main.py` crashed at start-up without `MODEL_PATH` (`parents[3]`) | Resolved 22 Nov |
| `docker-compose.yml` health check sat on the API container | Resolved 22 Nov |
| `train.py` saved v1 under the v2 file name | Resolved 22 Nov |
| `/load-planner` missing from the frontend middleware's protected routes | Resolved 22 Nov |
| CG-015: no numeric training ranges in the model metadata, so `OUT_OF_RANGE_INPUT` is never emitted | Resolved 22 Nov |
| API defaults for the v2-only inputs (`"Standard"`, `"Green"`) were unknown to the model; predictions ran 0.42 days low | Resolved 22 Nov |
| Provenance reported `dataset_version: synthetic-v1` while v2 was served | Resolved 22 Nov |
| Capacity router mounted twice (duplicate OpenAPI operation id) | Resolved 22 Nov |
| `features/` file names do not match their contents; no F04 spec file | Resolved 23 Nov (renamed by title; F04 created from the master spec) |

---

## 10. Testing layout

### Backend — `services/api/tests/` (18 modules, 172 tests)

| Property | Detail |
|---|---|
| Database | real Postgres, `portiq_test`, forced by `conftest.py` |
| Strategy | drops `public`, runs every migration from empty, rolls back per test |
| Safety rail | refuses to reset unless the DB name ends with `_test` and the host is local |
| Heaviest coverage | `test_shipments.py` (~24 KB) — authorization, state machine, filters |
| Extras | `test_auth.py`, `test_auth_jwks.py`, `test_operator.py`, `test_predict.py`, `test_config.py`, `test_cors.py`, `test_database.py`, `test_errors.py`, `test_health.py`, `test_cost_engine.py`, `test_seed.py`, `test_admin.py` |
| B10 | `test_at_risk.py` (11 unit tests), `test_b10_endpoints.py` (8), `test_contract.py` (real responses vs `tests/fixtures/frontend_contract/*.json`, copied from the frontend mocks), `test_auth_matrix.py` (section 7 table, every route × role, plus hidden-resource 404s), `test_hardening.py` (body cap, date ranges, tariff API) |
| Support | `tests/support/probe_app.py` — test-only app to exercise real 422/500 over HTTP |

Runs: `ruff check .`, `mypy .`, `pytest` (needs Postgres running). Without a local Python, run them in a throwaway container that shares the Postgres container's network; the command is in `BACKEND_FIXES_REPORT.md`.

### Frontend unit — 23 files, 191 tests, colocated

| File | Covers |
|---|---|
| `lib/format.test.ts` | money as decimal string, days, percent, timezone |
| `lib/port-time.test.ts` | port-timezone rendering |
| `lib/navigation.test.ts` | role → nav map |
| `lib/api/client.test.ts` | envelope parsing, error mapping, 401 |
| `lib/shipments/schema.test.ts`, `query.test.ts` | form validation and query string |
| `lib/auth/route-access.test.ts`, `return-path.test.ts`, `mock.test.ts` | guards and safe redirects |
| `lib/mocks/flags.test.ts` | mock flags are inert without mocks |
| `components/features/**/*.test.tsx` | shipments, detail, prediction, capacity, dashboard, operator, tariffs, settings, auth, shared |
| `lib/auth/account-type.test.ts` | importer / operator sign-in toggle |
| `lib/load-planner/load-planner.test.ts` | volume, weight, validation, packing, utilization matrix, camera framing |

Vitest + jsdom + MSW, `tests/setup.ts` resets mock state between files.

### E2E — `apps/web/tests/e2e/`

`f01…f10.spec.ts` plus `a11y.spec.ts` (axe WCAG 2.2 A/AA across 20 pages/states, including the Load planner for both roles); 85 tests. Playwright boots `next dev` with `NEXT_PUBLIC_USE_MOCKS=true`, so **E2E never needs the API or a database**.

---

## 11. Environment, run, seed

### Frontend — four public variables only

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_USE_MOCKS=true
```

```bash
cd apps/web
npm install
cp .env.example .env.local
npm run dev          # http://localhost:3000
```

With mocks on: any valid email + any password signs in; the dev role switcher changes the mock `/me` role.

### Backend

```dotenv
APP_ENV=local                       # local | test | staging | production
LOG_LEVEL=INFO
DATABASE_URL=postgresql+psycopg://portiq:portiq@localhost:5432/portiq
ALLOWED_ORIGINS=http://localhost:3000
AUTH_MODE=dev                       # dev | supabase
SUPABASE_URL=
SUPABASE_JWT_JWKS_URL=
SUPABASE_JWT_ISSUER=
SUPABASE_JWT_AUDIENCE=              # JWKS URL, issuer and audience are derived from SUPABASE_URL
MODEL_PATH=
MODEL_VERSION=
PREDICTION_TIMEOUT_SECONDS=5
```

Docker (how it runs today, from `services/api`):

```powershell
docker compose up -d --build            # Postgres 15 + API on :8000, model mounted from ml/artifacts
docker exec -w /app api-api-1 python scripts/seed_dev.py
docker exec -w /app api-api-1 python scripts/seed_capacity.py --start 2026-10-15
```

Or locally with a Python virtualenv:

```powershell
cd services\api
alembic upgrade head
python scripts\seed_dev.py
uvicorn app.main:app --reload
```

`services/api/.env` exists (git-ignored) with `AUTH_MODE=dev` and an empty Supabase section;
switching to Supabase is `AUTH_MODE=supabase` plus `SUPABASE_URL`.

Ops endpoints: `/health`, `/ready` (503 until the model artifact loads), `/docs`.

Startup **fails fast** on invalid config: `AUTH_MODE=dev` with `APP_ENV=staging|production`, `*` in `ALLOWED_ORIGINS`, missing Supabase vars in supabase mode, or a non-numeric `PREDICTION_TIMEOUT_SECONDS` all raise at import time.

### Full-stack

```
Postgres  5432   (docker compose, or a local conda install)
API       8000   uvicorn
Web       3000   next dev
```

To use the API from the browser: fill `apps/web/.env.local` (Supabase URL + publishable key, `NEXT_PUBLIC_USE_MOCKS=false`) and set `AUTH_MODE=supabase` + `SUPABASE_URL` in `services/api/.env`. Dev tokens cannot be sent from the browser, so live mode needs Supabase.

---

## 12. Mental model to keep

Three independent contracts that must stay in sync, in this order of authority:

1. `docs/FRONTEND_SPEC.md` §5 — the JSON contract (endpoints, enums, error table, TS types).
2. `docs/BACKEND_SPEC.md` — behaviour, data, decisions. Wins on ambiguity.
3. `CONTRACT_GAPS.md` (one per app) — the registry of everything undefined, each isolated in one named function and marked `CONTRACT-GAP: CG-xxx` / `GAP-xxx` in code.

Everything else is derived:

```
schemas/enums.py ──▶ Postgres enum types
                ──▶ models/tables.py
                ──▶ schemas/*.py  ──▶ lib/api/types.ts ──▶ mock fixtures ──▶ feature components
```

When something looks wrong contract-wise, read the gap log **before** inferring intent from code — the decision is usually recorded there with a date and a reason (e.g. GAP-033 `PATCH /me` body, GAP-020 invalid bucket filtering, GAP-025 latest-first ordering requirement).

---

## 13. File-by-file map

### `apps/web`

```
app/
  layout.tsx                     root layout, Inter font, metadata
  globals.css                    PortIQ design tokens + base styles
  page.tsx                       public landing page (static, no API calls)
  (app)/layout.tsx               providers + shell + guard
    dashboard/page.tsx
    shipments/{page,new,[id],[id]/edit,[id]/prediction/[predictionId]}/page.tsx
    capacity/page.tsx
    load-planner/page.tsx        3D container load planner
    operator/page.tsx
    admin/tariffs/page.tsx
    settings/page.tsx
    dev/sandbox/page.tsx         component + fixture showcase, 404 in prod
  (auth)/layout.tsx              centred auth card layout
    login | signup | forgot-password | reset-password /page.tsx
  auth/callback/route.ts         Supabase code exchange → safe redirect

components/
  shell/AppShell.tsx             sidebar, top bar, collapse, mobile sheet, profile menu
  shell/DevRoleSwitcher.tsx      mock-only role picker
  providers/AppProviders.tsx     QueryClient → Role → Mock → Me
  providers/MeProvider.tsx       GET /me, auth subscription, role invalidation
  providers/RoleProvider.tsx     mock role state + subscription
  providers/MockProvider.tsx     starts MSW before render
  features/auth/                 Login, Signup, Forgot, Reset, AuthCard, AppGuard
  features/shipments/            ShipmentsList, NewShipmentForm, EditShipment*,
                                 ShipmentDetailClient, SelectControl
  features/predictions/          PredictionResultClient, RunPredictionButton,
                                 ExplanationChart, ExplanationTable
  features/capacity/             CapacityClient, CapacityChart, CapacityTable
  features/dashboard/            DashboardClient
  features/operator/             OperatorClient
  features/load-planner/         LoadPlannerClient, ContainerViewport, ContainerScene (lazy),
                                 ParcelMeshes, CargoList, UtilizationMatrix, LoadSummaryPanels, ViewStrip
  features/admin/tariffs/        TariffsClient
  features/settings/             SettingsForm
  shared/                        StatusBadge, DemoBadge, Callout, Field, PageState,
                                 Money, DateTime, Stat, DataTable, ContainerArt, ComingSoon (unused)
  ui/                            shadcn/Radix primitives

lib/
  api/client.ts                  envelope parser, ApiError, Bearer, Idempotency-Key, 401
  api/types.ts                   contract types (hand-mirrored from Pydantic)
  api/me.ts                      MeUpdate / DISPLAY_NAME_MAX_LENGTH
  api/hooks/*.ts                 one TanStack Query hook per endpoint
  auth/client.ts                 browser Supabase client + getAccessToken
  auth/server.ts                 server Supabase client
  auth/actions.ts                sign in / sign up / reset / update / sign out
  auth/mock.ts                   mock session flag + subscription
  auth/route-access.ts           URL → allowed roles
  auth/return-path.ts            safe returnTo validation
  auth/validation.ts             field validation + generic error copy
  shipments/                     api, schema (Zod), query (URL), options, errors
  tariffs/                       api, schema, options
  capacity/api.ts                forecast query builder
  operator/api.ts                overview + shipments query builders
  load-planner/                  types, config, calculations, packing, views (pure, tested)
  auth/account-type.ts           importer / operator sign-in toggle rules
  mocks/handlers.ts              all 21 MSW handlers
  mocks/fixtures/*.ts            shipments, predictions, capacity, operator,
                                 tariffs, audit, ports, users, config, errors
  mocks/flags.ts                 mock-only query flags
  mocks/role.ts                  mock role storage + subscription
  format.ts, port-time.ts, navigation.ts, utils.ts, hooks/useDebouncedValue.ts
middleware.ts                    session refresh + protected redirects
tests/setup.ts                   Vitest + MSW lifecycle
tests/e2e/*.spec.ts              F01–F10 + a11y
themes/portiq/                   theme.css (scoped tokens), content.ts
public/models/                   container-20ft.glb, container-40ft.glb (compressed)
```

### `services/api`

```
app/main.py                      factory, middleware, CORS, handlers, /health, /ready, model load
app/db.py                        engine, Base, session_scope, check_database
app/api/v1/__init__.py           api_router assembly
app/api/v1/me.py                 GET/PATCH /me
app/api/v1/config.py             GET /config (thresholds, max range)
app/api/v1/ports.py              GET /ports (role-scoped)
app/api/v1/shipments.py          list, summary, create, detail, patch, events, prediction, history, single prediction
app/api/v1/capacity.py           GET /capacity/forecast (≤31 days, role-scoped)
app/api/v1/predict.py            POST /predict/dwell (live model inference)
app/api/v1/admin.py              tariffs list/create/deactivate, GET /admin/audit-logs
app/api/v1/operator.py           GET /operator/overview, /operator/shipments, /operator/dashboard/summary
app/core/config.py               env vars, frozen constants, fail-fast validation
app/core/deps.py                 get_db, get_current_user, require_role
app/core/security.py             dev-token + JWKS verification
app/core/errors.py               AppError, error envelope, exception handlers
app/core/logging.py              JSON logging, request-id generation
app/models/tables.py             all 9 tables
app/repositories/                profiles, ports, operator_ports, shipments, tariffs, audit_logs, capacity
app/schemas/                     enums (source of truth), envelope, me, config, ports,
                                 shipments, prediction, capacity, predict, admin
app/services/prediction.py       orchestration: idempotency, rate limit, persist run
app/services/cost_engine.py      specificity, scope match, rate math, Decimal totals
app/services/ml.py               DwellTimeModel wrapper (load, predict, feature repair)
app/services/model_service.py    feature row, timeout, 503 on any model failure
app/services/explain.py          SHAP for v1 pipeline and v2 bundle (log target)
app/services/at_risk.py          operator scope, at-risk rules, dwell distribution
app/services/capacity_sim.py     deterministic Poisson arrival simulation (yard/berth)
migrations/versions/0001_initial.py   tables, enums, checks, indexes, RLS
scripts/seed_dev.py              deterministic uuid5 seed, idempotent
scripts/seed_capacity.py         capacity bucket seeder
tests/                           pytest suite (portiq_test)
```

### `ml`

```
scripts/generate_synthetic.py      v1 generator, calibrated to published means
scripts/generate_synthetic_v2.py   v2 generator (customs channel, importer type, holidays, exam queue, busy days)
scripts/prepare_data.py            dedupe, split, seasonality features (--version v1|v2)
scripts/train.py                   baselines, model search, quantile range, serve decision (--version v1|v2)
data/                              raw / processed (git-ignored)
artifacts/dwell_model_v2.joblib    bundle loaded by the API at startup
artifacts/model_metadata_v2.json   versions, feature schema, training ranges, metrics (spec 11.6)
reports/metrics_v2.json            baselines, chosen config, test/stress metrics, intervals, ablations
scripts/evaluate.py                calibration report → reports/calibration_v2.json
tests/test_pipeline.py             19 tests
data/reference/port_dwell_*.csv    real monthly port averages 2020-2022 (hours)
```

---

## Summary judgement

**Strong:** the contract-first process (specs → gap log → code), the envelope and error-handling
discipline, the repository/service split, immutable prediction snapshots, the `Decimal` cost engine
with honest partial totals, a real model with checked SHAP explanations, scoped authorization tested
endpoint by endpoint and as one section 7 matrix, contract tests that pin the API to the frontend
mocks, and broad automated coverage (172 backend tests, 191 frontend unit tests, 85 browser tests).

**Weak, in priority order:**

1. The frontend and backend have never run together live; that needs the Supabase keys (B11).
2. The Load planner still runs on sample cargo.
4. No git, CI or deployment setup yet, and the demo/report deliverables have not started.
