# PortIQ — Full Project Review

> Architecture, workflow and file relationships for the whole repo.
> Reviewed: 13 Nov 2026. Scope: `apps/web`, `services/api`, `ml/`, `docs/`, `features/`, migrations, seeds, mocks, tests.
> This document describes what the code **does today**, not what the specs intended. Where the two disagree it says so (§8).

---

## Contents

1. [What the product is](#1-what-the-product-is)
2. [Repo layout (and the double nesting)](#2-repo-layout-and-the-double-nesting)
3. [The four tiers](#3-the-four-tiers)
4. [How the two apps relate — the envelope contract](#4-how-the-two-apps-relate--the-envelope-contract)
5. [Request lifecycle — frontend](#5-request-lifecycle--frontend)
6. [Request lifecycle — backend](#6-request-lifecycle--backend)
7. [Data model and file relationships](#7-data-model-and-file-relationships)
8. [The five workflows worth tracing](#8-the-five-workflows-worth-tracing)
9. [Where the code and the docs disagree](#9-where-the-code-and-the-docs-disagree)
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

## 2. Repo layout (and the double nesting)

There are two levels of `portiq`:

```
Desktop\portiq\                    ← workspace root (not a git repo)
├── .agents\skills\                ← design/frontend skills
├── skills-lock.json               ← skill lockfile
├── supabase\
│   └── config.toml                ← Supabase CLI config (outside the git repo!)
└── portiq\                        ← THE GIT REPO
    ├── README.md                  ← 1 line
    ├── docker-compose.yml         ← Postgres 15
    ├── requirements.txt           ← ML-only deps (pandas/sklearn/shap)
    ├── PortIQ_Frontend_Master_Spec_v1.md
    ├── docs\
    │   ├── FRONTEND_SPEC.md       ← the JSON contract (§5 is law)
    │   ├── BACKEND_SPEC.md        ← behaviour, data, decisions
    │   ├── architecture.md        ← short B02-era note (stub)
    │   └── superpowers\plans\     ← dated implementation plan
    ├── features\                  ← the F01–F10 prompt files used to build the UI
    ├── apps\web\                  ← Next.js frontend
    ├── services\api\              ← FastAPI backend
    └── ml\                        ← offline ML pipeline
```

Consequences of the nesting worth remembering:

- Any path in this document is relative to `Desktop\portiq\portiq\`.
- `supabase\config.toml` is outside the repo, and it points at `./seed.sql` which does not exist. Running the Supabase CLI from the workspace root will not behave like the committed project.

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

### Backend — `services/api`

| Concern | Choice |
|---|---|
| Framework | FastAPI, Pydantic v2 |
| DB | SQLAlchemy 2.x **sync** + psycopg 3 |
| Migrations | Alembic, one hand-written initial revision |
| Auth | PyJWT |
| ML | scikit-learn pipeline loaded with joblib at startup |
| Quality | ruff, mypy, pytest (+ coverage) |

### ML — `ml/`

| Folder | Contents |
|---|---|
| `data/raw/` | `synthetic_v1.csv` (10 000 rows), `synthetic_v1_stress.csv` (1 500) |
| `data/processed/` | `train / val / test / stress` splits |
| `data/reference/` | published India port-dwell CSVs (2020, 2021) used to calibrate means |
| `scripts/` | `generate_synthetic.py`, `prepare_data.py`, `train.py` |
| `artifacts/` | `dwell_model_v1.joblib` |
| `reports/` | `metrics.json` |

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

**2. Supabase session** — in real mode `getAccessToken()` reads the SDK session and `apiClient` attaches `Authorization: Bearer <jwt>`; `middleware.ts` refreshes cookies and redirects unauthenticated hits on six protected prefixes. Mock mode stores a session-only flag in `sessionStorage` and never stores a token.

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
  ├ dwell_model.load(ml/artifacts/dwell_model_v1.joblib)   path via Path(__file__).parents[3]
  ├ RequestContextMiddleware                           request_id, X-Request-ID, per-request log line, 500 boundary
  ├ CORSMiddleware                                     ALLOWED_ORIGINS, credentials, expose X-Request-ID
  ├ register_exception_handlers                        AppError / HTTPException / ValidationError / Exception
  └ routers
     ├ GET /health          → {"data":{"status":"ok"}}
     ├ GET /ready           → 200 only if database AND model are up; else 503 with details [{component,state}]
     └ /api/v1
        ├ api_router: me, config, ports, shipments, capacity, predict
        └ admin.router, operator.router
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

   → services (app/services/*.py)             prediction, cost_engine, ml, capacity_sim
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
| `get_current_user` | reads Bearer token, decodes, loads/provisions `profiles`, rejects inactive users with 403 |
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
| `prediction_runs` | `tables.py` | inline query + `services/prediction.py` | `shipments.py` | `schemas/prediction.py` |
| `capacity_forecasts` | `tables.py` | inline `select()` in `capacity.py` | `capacity.py` | `schemas/capacity.py` |
| `tariff_rules` | `tables.py` | `repositories/tariffs.py`, read by `services/cost_engine.py` | `admin.py` | `schemas/admin.py` |
| `audit_logs` | `tables.py` | `repositories/audit_logs.py` | written by `shipments.py` | — |

### Migrations and seed

- One revision: `migrations/versions/0001_initial.py` — 9 tables, 12 enum types, all check constraints and indexes, RLS enabled, and a `downgrade` that also drops the enum types.
- `migrations/env.py` reads `DATABASE_URL` through `app.core.config`, so the URL lives in one place.
- `scripts/seed_dev.py` is idempotent **by design**: every row gets `uuid5(SEED_NAMESPACE, "portiq:dev-seed:<natural key>")`, and ports/users/shipments/tariffs are also looked up by natural key first. A re-run inserts only what is missing and never overwrites human edits. It refuses any `APP_ENV` other than `local` or `test`.

Seeded counts:

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
      ├ capacity_snapshot                      (currently a hardcoded "unavailable" block)
      ├ predicted_dwell_days                   (currently hardcoded 6.2)
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
ml/scripts/generate_synthetic.py   ← calls app.services.capacity_sim.utilization_for()
   → data/raw/synthetic_v1.csv (10k rows), synthetic_v1_stress.csv (1.5k)

ml/scripts/prepare_data.py
   → data/processed/{train,val,test,stress}.csv

ml/scripts/train.py
   → ColumnTransformer( num: StandardScaler, cat: OneHotEncoder(handle_unknown="ignore") )
   → RandomForestRegressor(n_estimators=100, max_depth=15)
   → artifacts/dwell_model_v1.joblib  +  reports/metrics.json

API startup
   → dwell_model.load(artifact)             is_loaded drives /ready
POST /api/v1/predict/dwell
   → dwell_model.predict(features)          or 503 MODEL_UNAVAILABLE
```

The synthetic generator derives dwell from documented multipliers (cargo, documentation, congestion, HS chapter, weight, weekend, shipping line) then **calibrates each port/direction back to its published mean** — 0.87 / 1.17 / 3.14 / 5.18 days. The stress file forces 75–98% utilization and a 20% import disruption with a 2–3× dwell multiplier.

---

## 9. Where the code and the docs disagree

These are real, not stylistic. Treat them as the next work items.

### 9.1 The prediction flow ignores the ML model — `services/api/app/services/prediction.py`

`run_prediction_flow()` returns a literal `predicted_dwell_days = 6.2`, an explanation of `status: "unavailable"`, and a capacity snapshot of `status: "unavailable"`. Meanwhile `dwell_model` *is* loaded at startup and `POST /predict/dwell` *does* call it correctly.

So the flagship feature is a stub behind a working ML endpoint. The comment in `create_app()` says "B07: LOAD THE ML MODEL", but no code path consumes it in the prediction flow.

### 9.2 Authentication bypasses `core/security.py` — `services/api/app/core/deps.py`

`get_current_user` decodes `HS256` inline with `settings.supabase_jwt_secret`, whose default value is `"dummy-secret-for-local-testing"`, and a real-looking secret is committed in `services/api/.env.example` (line 24).

Consequences:

- `AUTH_MODE=dev` (`Authorization: Bearer dev:<email>`) is documented in `services/api/README.md` but **no longer works**.
- `core/security.py` — with JWKS, RS256/ES256, issuer/audience/expiry checks, cached key set — is **dead code**.
- `AUTH_MODE` is effectively ignored for authentication.
- Startup validation in `core/config.py` still enforces Supabase env vars, so config and runtime disagree about what auth mode means.

### 9.3 Four frontend endpoints have no backend counterpart

Verified by grep across `services/api/app`:

| Frontend calls | Backend has |
|---|---|
| `GET /operator/overview` | ✗ (backend has `GET /operator/dashboard/summary`, different path and shape) |
| `GET /operator/shipments` | ✗ |
| `GET /admin/audit-logs` | ✗ (audit rows are only *written* by the events endpoint) |
| `GET /shipments/{id}/predictions/{predictionId}` | ✗ (only the list and the POST exist) |

The mock implements all four, so the UI is complete and the real API would 404. This is the largest real-integration gap.

### 9.4 The frontend README says the backend is a placeholder

`apps/web/README.md` line 167: *"The backend services in `services/` are placeholders; all UI work uses MSW."* That was true at F10, not now — the API has auth, shipments, events, predictions, the cost engine, capacity and tariffs.

### 9.5 Two session helpers, two transaction policies

- `app/db.py::get_db` and `app/core/deps.py::get_db` both exist; only the `deps` one commits/rolls back.
- `app/api/v1/admin.py` uses the non-committing `db.get_db`, calls `datetime.utcnow()` (naive, while everything else is tz-aware UTC), and returns raw ORM objects inside an ad-hoc `{"data": …}` dict instead of `envelope()` + Pydantic.
- It also raises `HTTPException` rather than `AppError` for its 404, so its `details` shape differs from the rest of the API.

This is the least consistent module in the backend and the one most likely to break the contract at runtime.

### 9.6 `capacity_sim.py` is O(days since epoch) per call

`capacity_sim_for_date()` replays from `EPOCH_DATE = 2025-01-01` to the target date every time it is called. Fine for a single 250-day window, but `generate_synthetic.py` calls it 11 500 times at data-generation time.

### 9.7 `services/api/app/services/ml.py::predict` reconstructs features heuristically

It guesses `is_weekend`, `month`, `day_of_week`, zero-fills any unknown expected column, and zero-pads `hs_chapter`. It works against the current artifact but is tightly coupled to that artifact's `feature_names_in_`. A retrain with different columns could silently produce wrong predictions instead of failing loudly.

### 9.8 Two requirements files, one duplicate pin

- Root `requirements.txt` = ML only (pandas, numpy, scikit-learn, shap, joblib, PyJWT).
- `services/api/requirements.txt` = API (fastapi, sqlalchemy, psycopg, alembic, pyjwt, uvicorn, ruff, mypy, pytest).
- `PyJWT` is pinned twice in the API file (`2.15.1` and `2.8.0`) — the last line wins, and the two disagree.

### 9.9 Supabase config is outside the repo

`Desktop\portiq\supabase\config.toml` points at `./seed.sql`, which does not exist. `project_id = "portiq"`, DB on 54322, API on 54321, studio on 54323, `major_version = 17` (the docker-compose Postgres is 15). The CLI and the compose file describe different worlds.

---

## 10. Testing layout

### Backend — `services/api/tests/` (14 modules)

| Property | Detail |
|---|---|
| Database | real Postgres, `portiq_test`, forced by `conftest.py` |
| Strategy | drops `public`, runs every migration from empty, rolls back per test |
| Safety rail | refuses to reset unless the DB name ends with `_test` and the host is local |
| Heaviest coverage | `test_shipments.py` (~24 KB) — authorization, state machine, filters |
| Extras | `test_auth.py`, `test_operator.py`, `test_predict.py`, `test_config.py`, `test_cors.py`, `test_database.py`, `test_errors.py`, `test_health.py`, `test_cost_engine.py`, `test_seed.py`, `test_admin.py` |
| Support | `tests/support/probe_app.py` — test-only app to exercise real 422/500 over HTTP |

Runs: `ruff check .`, `mypy .`, `pytest` (needs Postgres running).

### Frontend unit — 10 files, colocated

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

Vitest + jsdom + MSW, `tests/setup.ts` resets mock state between files.

### E2E — `apps/web/tests/e2e/`

`f01…f10.spec.ts` plus `a11y.spec.ts` (axe WCAG 2.2 A/AA across 18 pages/states). Playwright boots `next dev` with `NEXT_PUBLIC_USE_MOCKS=true`, so **E2E never needs the API or a database**.

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
SUPABASE_JWT_AUDIENCE=authenticated
SUPABASE_JWT_SECRET=                # committed sample value in .env.example
MODEL_PATH=
MODEL_VERSION=
PREDICTION_TIMEOUT_SECONDS=5
```

```powershell
docker compose up -d db
cd services\api
$env:DATABASE_URL = "postgresql+psycopg://portiq:portiq@localhost:5432/portiq"
$env:APP_ENV = "local"
alembic upgrade head
python scripts\seed_dev.py
uvicorn app.main:app --reload
```

Ops endpoints: `/health`, `/ready` (503 until the model artifact loads), `/docs`.

Startup **fails fast** on invalid config: `AUTH_MODE=dev` with `APP_ENV=staging|production`, `*` in `ALLOWED_ORIGINS`, missing Supabase vars in supabase mode, or a non-numeric `PREDICTION_TIMEOUT_SECONDS` all raise at import time.

### Full-stack

```
Postgres  5432   (docker compose, or a local conda install)
API       8000   uvicorn
Web       3000   next dev
```

To actually use the API from the browser: set `NEXT_PUBLIC_USE_MOCKS=false`, point `NEXT_PUBLIC_API_BASE_URL` at the API, and have a token the API accepts (§9.2 caveat).

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
  features/admin/tariffs/        TariffsClient
  features/settings/             SettingsForm
  shared/                        StatusBadge, DemoBadge, Callout, Field, PageState,
                                 Money, DateTime, Stat, DataTable, ComingSoon
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
  mocks/handlers.ts              all 21 MSW handlers
  mocks/fixtures/*.ts            shipments, predictions, capacity, operator,
                                 tariffs, audit, ports, users, config, errors
  mocks/flags.ts                 mock-only query flags
  mocks/role.ts                  mock role storage + subscription
  format.ts, port-time.ts, navigation.ts, utils.ts, hooks/useDebouncedValue.ts
middleware.ts                    session refresh + protected redirects
tests/setup.ts                   Vitest + MSW lifecycle
tests/e2e/*.spec.ts              F01–F10 + a11y
```

### `services/api`

```
app/main.py                      factory, middleware, CORS, handlers, /health, /ready, model load
app/db.py                        engine, Base, session_scope, check_database
app/api/v1/__init__.py           api_router assembly
app/api/v1/me.py                 GET/PATCH /me
app/api/v1/config.py             GET /config (thresholds, max range)
app/api/v1/ports.py              GET /ports (role-scoped)
app/api/v1/shipments.py          list, summary, create, detail, patch, events, prediction, history
app/api/v1/capacity.py           GET /capacity/forecast (≤31 days, role-scoped)
app/api/v1/predict.py            POST /predict/dwell (live model inference)
app/api/v1/admin.py              tariffs list/create/deactivate
app/api/v1/operator.py           operator dashboard summary
app/core/config.py               env vars, frozen constants, fail-fast validation
app/core/deps.py                 get_db, get_current_user, require_role
app/core/security.py             dev-token + JWKS verification (currently unused, see §9.2)
app/core/errors.py               AppError, error envelope, exception handlers
app/core/logging.py              JSON logging, request-id generation
app/models/tables.py             all 9 tables
app/repositories/                profiles, ports, operator_ports, shipments, tariffs, audit_logs
app/schemas/                     enums (source of truth), envelope, me, config, ports,
                                 shipments, prediction, capacity, predict, admin
app/services/prediction.py       orchestration: idempotency, rate limit, persist run
app/services/cost_engine.py      specificity, scope match, rate math, Decimal totals
app/services/ml.py               DwellTimeModel wrapper (load, predict, feature repair)
app/services/capacity_sim.py     deterministic Poisson arrival simulation (yard/berth)
migrations/versions/0001_initial.py   tables, enums, checks, indexes, RLS
scripts/seed_dev.py              deterministic uuid5 seed, idempotent
scripts/seed_capacity.py         capacity bucket seeder
tests/                           pytest suite (portiq_test)
```

### `ml`

```
scripts/generate_synthetic.py    seeded synthetic generator, calibrated to published means
scripts/prepare_data.py          dedupe, split, seasonality features
scripts/train.py                 sklearn Pipeline → joblib artifact + metrics
data/                            raw / processed / reference CSVs
artifacts/dwell_model_v1.joblib  loaded by the API at startup
reports/metrics.json             MAE / RMSE / R2 for test and stress splits
```

---

## Summary judgement

**Strong:** the contract-first process (specs → gap log → code), the envelope + error handling discipline, the repository/service split, the immutable snapshot pattern for predictions, the `cost_engine` Decimal math with explicit partial totals, the mock fixture coverage that lets the whole UI be demonstrated without a backend, and the test strategy (real Postgres for the backend, MSW everywhere for the frontend).

**Weak, in priority order:**

1. `prediction.py` is a stub returning 6.2 days while a real model sits loaded and unused.
2. Auth bypasses `core/security.py`, so dev tokens and JWKS verification are both dead, and a JWT secret is committed.
3. Four endpoints the UI depends on do not exist in the backend.
4. `admin.py` ignores the envelope, uses naive datetimes, and returns raw ORM objects.
5. Docs lag the code (`apps/web/README.md` still calls the backend a placeholder), and the Supabase CLI config is outside the repo pointing at a missing seed file.
