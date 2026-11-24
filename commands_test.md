# PortIQ tests: commands, purpose and what they caught

This guide lists every kind of check used in PortIQ. For each one it gives the command, what it
checks, why it exists, and real problems it caught while the project was built. Run commands from
the folder named in each section, in PowerShell.

The checks form layers. Fast checks run on every change, and slow or live checks run before a
release:

| Layer | Speed | Needs | Catches |
|---|---|---|---|
| Lint and type checks | seconds | nothing | typos, wrong types, unused code |
| Backend unit and API tests (pytest) | ~1 min | Docker + Postgres | wrong rules, permissions, data bugs |
| ML tests | ~1 min | Docker | data leaks, broken training pipeline |
| Frontend unit tests (Vitest) | ~1 min | Node | broken components, form rules |
| Browser tests on mock data (Playwright) | ~2–4 min | Node + Chrome | broken pages and flows, accessibility |
| Live browser test (Playwright) | ~1 min | running API + app + real accounts | problems only real sign-in and data show |
| Supabase smoke test | seconds | running API + a real account | the real sign-in → API → model chain |
| Manual checks (logs, database, API docs) | as needed | Docker | the cause of a failure |

---

## 1. Backend: pytest, ruff, mypy

**Where:** `services/api`. The tests run inside the API's Docker image against the `portiq_test`
database, which is wiped and rebuilt for each run. They never touch your real data.

```powershell
cd "C:\Users\karti\OneDrive\Desktop\college report file\portiq-main"
```

```powershell
docker run --rm --network container:portiq-db -v "${PWD}\services\api:/repo/services/api" -v "${PWD}\ml:/repo/ml" -w /repo/services/api api-api sh -c "python -m pytest -q && python -m ruff check . && python -m mypy ."
```

Run a single file while working on one area:

```powershell
docker run --rm --network container:portiq-db -v "${PWD}\services\api:/repo/services/api" -v "${PWD}\ml:/repo/ml" -w /repo/services/api api-api python -m pytest -q tests/test_cargo.py
```

**What each tool does:**
- **pytest** runs about 240 tests. Each one calls the API the way the website does and checks the
  answer.
- **ruff** is a linter. It finds unused imports, unsorted imports, lines that are too long and
  common mistakes.
- **mypy** checks types: for example, that a function returning a date never returns `None`
  without saying so.

**The test files, by purpose:**

| File | Checks | Why it matters |
|---|---|---|
| `test_auth.py`, `test_auth_jwks.py` | token checks: signature, expiry, issuer, clock tolerance | only real, current logins get in |
| `test_auth_matrix.py` | every endpoint × every role (allowed, 403, 404) | an importer can never reach admin or another user's data |
| `test_shipments.py` | create, list, filters, edit rules, status changes | the core workflow behaves as specified |
| `test_cargo.py`, `test_load_plan.py`, `test_packing.py` | cargo limits, container full, privacy of other users' parcels, same input giving the same layout | the Load planner never leaks or overfills |
| `test_predict.py`, `test_model_inputs.py`, `test_model_metadata.py` | model answers, feature list, input effects (red channel > green) | predictions use the right inputs |
| `test_cost_engine.py` | tariff maths, missing rules | costs are correct and missing rules are reported, not guessed |
| `test_capacity_sim.py` | capacity simulator output is unchanged after the speed-up | the speed-up changed no numbers |
| `test_operator.py`, `test_at_risk.py` | operator port scope, at-risk rules | operators see only their ports |
| `test_admin.py`, `test_b10_endpoints.py`, `test_manage_users.py` | tariffs, audit log, role changes | admin actions are recorded and named |
| `test_contract.py` | API responses match the frontend's mock data shapes | the website and API agree on field names |
| `test_database.py`, `test_seed.py` | migrations run from empty, seed is safe to rerun | a fresh install works |
| `test_errors.py`, `test_hardening.py`, `test_cors.py`, `test_config.py`, `test_health.py` | error format, body size cap, allowed origins, settings, `/ready` | the API fails safely and clearly |

**Real catches in this project:**
- The token clock tolerance tests were added after live sign-in kept bouncing back to the login
  page (`ImmatureSignatureError`).
- The arrival-date tests were added after the dashboard's "Upcoming arrivals" card failed with
  "validation failed".
- The audit-log name test was added after every real account showed as "System".
- The mypy count went from 26 errors to 0.

---

## 2. ML: pytest on the model pipeline

**Where:** repo root (`ml/tests/test_pipeline.py`).

```powershell
docker run --rm -v "${PWD}\ml:/repo/ml" -v "${PWD}\services\api:/repo/services/api" -w /repo api-api python -m pytest -q ml/tests
```

**What it checks:**
- Preprocessing is fitted on training rows only (no data leak from test rows).
- The split is by date, and the saved model's metadata and schema are valid.
- The API's holiday list matches the one used in training.

**Why:** a model can score well in testing and still be wrong in use, if test data leaked into
training or the API feeds it inputs differently from how it was trained.

**Real catch:** the holiday test exists because the API used to treat every day as "no holiday",
so its predictions differed from the model's training. Fixing the inputs took the served error
from 0.732 to 0.610 days.

---

## 3. Frontend: lint, types, Vitest

**Where:** `apps/web`.

```powershell
cd "C:\Users\karti\OneDrive\Desktop\college report file\portiq-main\apps\web"
```

```powershell
npm run lint
```

```powershell
npx tsc --noEmit
```

```powershell
npx vitest run
```

**What each does:**
- **lint** (`next lint`) applies React and Next.js rules, such as hooks being used correctly and
  images having alt text.
- **tsc** type-checks the whole app without building it.
- **Vitest** runs about 213 unit tests on components and logic in a fake browser: form rules
  (zod schemas), the cm→m conversion, privacy of grey parcels, the live-stream parser, the "i" tip
  behaviour and sign-up error messages.

**Why:** these are the fastest way to know a change didn't break a component, long before a
browser opens.

**Real catches:**
- After the operator-role fix, 10 shipment-page tests failed because they mocked the old role hook.
  That showed every place depending on it.
- `NewShipmentForm submits a valid shipment` sometimes fails when the whole suite runs at once.
  This is a known timing issue: rerun it alone with
  `npx vitest run components/features/shipments/shipments.test.tsx`.

---

## 4. Browser tests on mock data: Playwright

**Where:** `apps/web/tests/e2e` (f01–f11 plus `a11y.spec.ts`). These start the app with fake API
responses (MSW), so they need no backend and no accounts.

```powershell
npx playwright test -c playwright.local-chrome.config.ts
```

If your live app is already running on port 3000, run the mock tests on another port so they don't
use the live server:

```powershell
$env:PLAYWRIGHT_PORT = "3100"; $env:NEXT_DIST_DIR = ".next-e2e"; npx playwright test -c playwright.local-chrome.config.ts
```

Run one file:

```powershell
npx playwright test -c playwright.local-chrome.config.ts tests/e2e/f11-load-planner.spec.ts
```

**What they check:** real Chrome clicks through each feature:
- f01: shell and components
- f02: sign-in and 401 handling
- f03–f05: shipments and predictions
- f06: capacity
- f07: dashboard
- f08: operator
- f09: tariffs
- f10: settings and keyboard-only use
- f11: Load planner

`a11y.spec.ts` runs the axe accessibility checker on every page.

**Why:** unit tests check pieces. These check that the pieces work together on a real page.

**Real catch:** a group of tests failed at random because, on a fresh browser, the first request was
sent before the mock service worker was ready. It reached the real API and got a 401. The fix
makes the app wait for the worker (`lib/mocks/browser.ts`).

---

## 5. Live browser test: Playwright against the real stack

**Where:** `apps/web/tests/live`. These use real Supabase sign-in, the real API and the real
database. They are skipped unless the account details are set in the same PowerShell window.

```powershell
$env:PORTIQ_LIVE_EMAIL = "test@portiq.dev"; $env:PORTIQ_LIVE_PASSWORD = Read-Host "Importer password"
```

```powershell
$env:PORTIQ_LIVE_OPERATOR_EMAIL = "<operator email>"; $env:PORTIQ_LIVE_OPERATOR_PASSWORD = Read-Host "Operator password"
```

```powershell
$env:PORTIQ_LIVE_ADMIN_EMAIL = "<admin email>"; $env:PORTIQ_LIVE_ADMIN_PASSWORD = Read-Host "Admin password"
```

```powershell
npm run test:live
```

**What it checks:**
- An importer creates a shipment, runs a prediction and adds cargo in the Load planner.
- Every importer screen loads without "Unable to load…".
- An operator sees only their ports and cannot edit cargo.
- An admin sees the tariffs, and the audit log names each actor.

**Why:** mock data agrees with whatever the frontend expects, so some bugs only show against the
real API. A real run ends with "passed"; "skipped" means the variables weren't set.

**Real catches:** the live checks found three bugs that every mock test missed:
- the dashboard date format
- operators treated as importers on two screens
- "System" names in the audit log

Each run leaves one `LIVE-E2E-…` shipment on the test account.

---

## 6. Supabase smoke test

**Where:** `services/api/scripts/smoke_supabase.py`, run inside the API container. It asks for the
password and never prints the token.

```powershell
cd "C:\Users\karti\OneDrive\Desktop\college report file\portiq-main"
```

```powershell
$cfg = Get-Content apps\web\.env.local | ConvertFrom-StringData
```

```powershell
docker exec -it api-api-1 python scripts/smoke_supabase.py --supabase-url $cfg.NEXT_PUBLIC_SUPABASE_URL --supabase-key $cfg.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY --email test@portiq.dev
```

**What it checks:** real sign-in → `/me` → create a shipment → run a prediction, printing each
status code.

**Why:** it's the quickest proof, without a browser, that sign-in, the API, the database and the
model all work together.

---

## 7. Manual checks for finding causes

These aren't tests. They're how a failure gets explained.

| Check | Command | Use |
|---|---|---|
| API health | `curl http://localhost:8000/ready` | Is the API up, with the database and model loaded? |
| API logs | `docker logs --since 30m api-api-1` | Every request with status, route and `request_id`; search for the request ID shown in an error card. |
| Why a login was rejected | `docker logs --since 30m api-api-1 \| Select-String token_rejected` | Shows the reason, for example `ImmatureSignatureError`. |
| API explorer | open `http://localhost:8000/docs` | Try any endpoint by hand. |
| Database | `docker exec -it portiq-db psql -U portiq -d portiq` | Look at the data, for example `select reference, status from shipments;`. |
| Users and roles | `docker exec -w /app api-api-1 python scripts/manage_users.py list` | Who has which role and ports. |
| Migrations | `docker exec api-api-1 alembic current` | Which database version is applied. |

**Real catches:**
- A request ID in the dashboard error led straight to a `422` in the API log.
- The `token_rejected` reason led to the clock fix.
- A database query showed that the demo shipments belonged to accounts that can't sign in.

---

## Before you commit

1. Backend: pytest, ruff and mypy (section 1).
2. Frontend: lint, tsc and Vitest (section 3).
3. Mock browser tests (section 4).
4. For anything touching sign-in, roles or real data: the live test (section 5).
