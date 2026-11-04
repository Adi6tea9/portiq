# PortIQ Web

Frontend for the PortIQ shipment-planning and port-capacity forecasting prototype.

All ten feature sections are implemented against the mock API. F01 is the foundation (design tokens, typed API client, shared components, app shell, role-driven navigation, MSW mocks, sandbox). F02 adds Supabase-backed authentication, protected routes, `/me`-driven navigation, role permissions and password recovery. F03–F09 add shipments, predictions, capacity, the dashboard, the operator overview, tariffs and the audit trail. F10 adds the public landing page, settings, the accessibility and copy passes, and the cross-feature E2E flows.

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
| `/` | Landing: "Predict. Plan. Ship.", three steps, honest limitations, sign-in and sign-up |
| `/login` | Sign in |
| `/signup` | Create an importer/exporter account |
| `/forgot-password` | Request a recovery link |
| `/reset-password` | Choose a new password |
| `/auth/callback` | Supabase code exchange and safe redirect |
| `/dashboard` | Importer dashboard: counts, latest estimate, recent shipments |
| `/shipments` | Shipment list with filters and pagination |
| `/shipments/new` | Create a shipment |
| `/shipments/[id]` | Shipment detail, events and Run prediction |
| `/shipments/[id]/edit` | Edit a submitted shipment |
| `/shipments/[id]/prediction/[predictionId]` | Prediction result: dwell, indicative cost, model effects, capacity |
| `/capacity` | Capacity forecast by port, resource and range |
| `/operator` | Operator overview, scoped to the operator's ports (operator and admin) |
| `/admin/tariffs` | Tariff rules and audit trail (admin only, no delete) |
| `/settings` | Display name via `PATCH /me`; role read-only |
| `/dev/sandbox` | Development-only component and fixture sandbox |

Protected app routes require a session. Unauthenticated visits redirect to `/login?returnTo=...`; safe return paths are restored after sign-in. Route roles are defined in `lib/auth/route-access.ts`.

The sandbox is not linked from primary navigation, is exempt from the auth guard, and returns not-found in production.

## Feature status

| Section | Feature | State |
| --- | --- | --- |
| F01 | Foundation: tokens, API client, shell, mocks, sandbox | Done |
| F02 | Authentication, route guards, navigation, recovery | Done |
| F03 | Shipments list, create, edit | Done |
| F04 | Shipment detail and events | Done |
| F05 | Run prediction and result page | Done |
| F06 | Capacity forecast | Done |
| F07 | Importer dashboard | Done |
| F08 | Operator overview | Done |
| F09 | Admin tariffs and audit trail | Done |
| F10 | Landing, settings, accessibility, copy, E2E | Done |

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
  page.tsx               # Public landing page
  (app)/                 # Shell-wrapped protected routes
    dev/sandbox/         # Component and fixture showcase
  (auth)/                # Login, signup, forgot/reset password
  auth/callback/         # Supabase code exchange
  globals.css            # PortIQ tokens and base styles
components/
  features/              # Auth, shipments, predictions, capacity, dashboard,
                         # operator, admin tariffs, settings
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
  e2e/                   # Playwright F01-F10 and accessibility checks
  setup.ts               # Vitest + MSW lifecycle
```

## Design and accessibility

- PortIQ colours, spacing, radii and type scale from the master spec; light theme only.
- Status is never colour-only; every badge has a label and an icon.
- Focus rings use the Ocean Teal token. The landing page and the app shell both start with a "Skip to content" link.
- `tests/e2e/f10.spec.ts` proves the landing, sign-in and primary navigation work with the keyboard alone.
- Reduced motion is respected by the global `prefers-reduced-motion` rule, and charts do not animate (`isAnimationActive={false}`), so nothing depends on motion.
- Charts expose an accessible name (`role="img"`) and a table or text alternative. Capacity, prediction and dwell-distribution values are never conveyed by colour alone.
- Tables are horizontally scrollable on small screens and keep server pagination. The landing page is checked at 390 px with no horizontal overflow.
- Playwright runs axe WCAG 2.2 A/AA checks on all 18 pages and states, including the landing and settings. A diagnostic run of the same suite with no impact filter also returned zero violations.
- Text contrast: `text` 13.14:1 and `muted` 4.58:1 on canvas, `text` 14.10:1 and `muted` 4.92:1 on surface, `harbor-navy` 12.54:1 on `light-teal`, white on `harbor-navy` 14.64:1. `ocean-teal` (3.74:1 on surface) is used for icons, focus rings and chart marks, not body text.
- Non-text contrast: form-control outlines use `--input` `#627D98`, which is 4.28:1 on surface and 3.99:1 on canvas (the previous `#D9E2EC` was 1.31:1 / 1.22:1 and failed the 3:1 UI-boundary rule). `--border` stays light for dividers and card edges, which are decorative.
- The `muted` token is darkened from `#627D98` to `#5B738B` so secondary text meets 4.5:1 on canvas and surface backgrounds.

## Known limitations

- The landing page is static copy. It makes no API calls and states the limitations F10 requires: no terminal integration, estimates are not guarantees, and the demo data is synthetic.
- The mock `PATCH /me` stores the accepted display name in process memory, so a full page reload restores the fixture name. The confirmed real contract persists it; see GAP-033.
- Mock-created shipments and tariff rules live in memory and reset when the dev server restarts.
- Real Supabase auth needs valid project credentials. Mock mode accepts any validly formatted email and any password.
- Password recovery and reset are wired to Supabase but are only exercised end-to-end in mock mode.
- The backend services in `services/` are placeholders; all UI work uses MSW.
- Role switching is a development-only mock tool; production role comes from `/me`.

See `CONTRACT_GAPS.md` for tracked assumptions and spec deviations.
