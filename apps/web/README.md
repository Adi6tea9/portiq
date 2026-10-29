# PortIQ Web

Frontend for the PortIQ shipment-planning and port-capacity forecasting prototype.

F02 adds Supabase-backed authentication, protected app routes, `/me`-driven navigation, role permissions, password recovery, and later-feature placeholders. F01 remains the foundation: design tokens, typed API client, shared components, app shell, role-driven navigation, MSW mocks, and a development sandbox.

## Stack

- Next.js 14 App Router, React 18, strict TypeScript
- Tailwind CSS with the PortIQ tokens from the master spec
- shadcn/ui + Radix primitives
- TanStack Query and TanStack Table
- MSW for the mock API
- Vitest + Testing Library for unit tests
- Playwright + axe-core for E2E and accessibility checks

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. With mocks enabled, sign in with any valid email and any password; the mock adapter accepts them. The dev role switcher in the top bar changes the mock `/me` role.

### Environment

Exactly four public variables are used:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_USE_MOCKS=true
```

With `NEXT_PUBLIC_USE_MOCKS=true`, MSW starts before the app renders. Mock auth stores a session-only flag in `sessionStorage`; no token is stored. The dev role switcher and `Synthetic demo data` badge are only shown in mock mode.

Real Supabase auth requires a project URL and publishable key. Signup confirmation and password recovery redirect through `/auth/callback`.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright E2E tests |

The first E2E run needs Chromium:

```bash
npx playwright install chromium
```

Node 26 prints a `localStorage` warning unless a storage file is supplied. `.npmrc` sets `node-options=--localstorage-file=.localstorage`, and the ignored `.localstorage` file is created on first use.

## Routes

| Route | State |
| --- | --- |
| `/` | Existing landing placeholder |
| `/login` | Sign in |
| `/signup` | Create an importer/exporter account |
| `/forgot-password` | Request a recovery link |
| `/reset-password` | Choose a new password |
| `/auth/callback` | Supabase code exchange and safe redirect |
| `/dashboard` | Coming in F07 |
| `/shipments` | Coming in F03 |
| `/shipments/new` | Coming in F03 |
| `/shipments/[id]` | Coming in F04 |
| `/shipments/[id]/prediction/[predictionId]` | Coming in F05 |
| `/capacity` | Coming in F06 |
| `/operator` | Coming in F08 |
| `/admin/tariffs` | Coming in F09 |
| `/settings` | Coming in F10 |
| `/dev/sandbox` | Development-only component and fixture sandbox |

Protected app routes require a session. Unauthenticated visits redirect to `/login?returnTo=...`; safe return paths are restored after sign-in. Route roles are defined in `lib/auth/route-access.ts`.

The sandbox is not linked from primary navigation, is exempt from the auth guard, and returns not-found in production.

## Mock API

`lib/mocks/handlers.ts` implements every endpoint used so far:

- `GET/PATCH /me`, `GET /config`, `GET /ports`
- shipments list, summary, create, detail, patch, events, prediction, history
- capacity forecast, operator overview and shipments, tariffs, audit logs

`GET /me` is the role source for protected routes and navigation. In mock mode it returns the fixture matching `portiq.mock.role`.

Fixtures cover all required states: 12 shipments, 5 prediction variants (full, partial, no explanation, no capacity, all unavailable), 60 capacity buckets plus empty/invalid cases, 40 operator rows, 6 tariffs, 15 audit logs, and deterministic error responses.

Force an error with `?mock_error=<status>` or `?mock_error=IDEMPOTENCY_CONFLICT|TARIFF_CONFLICT`.

## Structure

```text
app/
  (app)/                 # Shell-wrapped protected routes
    dev/sandbox/         # Component and fixture showcase
  (auth)/                # Login, signup, forgot/reset password
  auth/callback/         # Supabase code exchange
  globals.css            # PortIQ tokens and base styles
components/
  features/auth/         # Auth forms, AuthCard, AppGuard
  shared/                # StatusBadge, DemoBadge, Callout, Field, PageState,
                         # Money, DateTime, Stat, DataTable, ComingSoon
  shell/                 # AppShell, DevRoleSwitcher
  providers/             # QueryClient, RoleProvider, MockProvider, MeProvider
lib/
  api/                   # Contract types and typed client
  auth/                  # Supabase clients, actions, guards, validation
  mocks/                 # MSW handlers, browser/server setup, fixtures
  format.ts              # String-safe formatters
  navigation.ts          # Role-to-nav map
middleware.ts            # Real-mode session refresh and protected redirects
tests/
  e2e/                   # Playwright F01/F02 checks
  setup.ts               # Vitest + MSW lifecycle
```

## Design and accessibility

- PortIQ colours, spacing, radii, and type scale from the master spec.
- Status is never colour-only; every badge has a label and icon.
- Focus rings use the Ocean Teal token; reduced motion is respected.
- Tables are horizontally scrollable on small screens and keep server pagination.
- Playwright runs axe WCAG 2.2 A/AA checks on the sandbox, login screen, and protected shell.
- The `muted` token is darkened from `#627D98` to `#5B738B` so secondary text meets 4.5:1 on canvas and surface backgrounds.

## Known limitations

- Feature pages remain placeholders; F02 implements authentication, route guards, navigation, recovery, and placeholders only.
- Real Supabase auth needs valid project credentials. Mock mode accepts any validly formatted email and any password.
- Password recovery and reset are wired to Supabase but are only exercised end-to-end in mock mode.
- The backend services in `services/` are placeholders; all UI work uses MSW.
- Role switching is a development-only mock tool; production role comes from `/me`.

See `CONTRACT_GAPS.md` for tracked assumptions and spec deviations.
