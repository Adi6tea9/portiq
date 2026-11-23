# PortIQ UI · 01 Setup, design system, shell, mock API

> Read `00_READ_FIRST.md` and `PortIQ_API_Contract_v0.1.md` first. Build **only** this feature. Use the mock API. Do not change other features.

**Depends on:** none (first task)
**Goal:** A clean app skeleton where every later feature plugs in: tokens, shared components, typed client, mock API and the page shell.

## Scope
1. Inspect `apps/web/`. Report what exists and your plan before editing.
2. Design tokens as CSS variables and Tailwind theme (colours, spacing scale, radius, font, tabular numerals).
3. `lib/api/types.ts`: all types from `00_READ_FIRST.md` section 4 plus Shipment, CapacityBucket, TariffRule, AuditLog, Event types from the API contract.
4. `lib/api/client.ts`: attaches `Authorization: Bearer <Supabase access token>`, reads `meta.request_id`, throws typed `ApiError`, central 401 handling, `Idempotency-Key` helper.
5. `lib/format.ts`: money (decimal string, en-IN), days, percent, timezone date formatting. Unit tests for each.
6. Shared components: `StatusBadge` (label + icon), `DemoBadge` ("Synthetic demo data"), `PageState` (loading skeleton, empty, error with request ID and retry, permission), `Callout` (info/warning/danger), `DataTable` (TanStack Table, server pagination, keyboard focus), `Field` (label, hint, error).
7. App shell: collapsible sidebar (desktop), compact nav (mobile), top bar with title and profile menu. Nav items come from a role map (stub role for now).
8. Mock API with MSW, enabled only when `NEXT_PUBLIC_USE_MOCKS=true`. Fixtures in `lib/mocks/`: `/me` for each role, 12 shipments across statuses, events, one full prediction, one partial prediction (demurrage unavailable), one with explanation unavailable, one with capacity unavailable, capacity buckets (30 days, yard and berth), an empty capacity list, 6 tariff rules, audit logs, and error payloads (401, 403, 404, 409, 422, 429, 503). Every payload keeps `is_demo_data: true` and a `DEMO_DATA` warning.
9. A dev-only role switcher (hidden unless mocks are on).
10. `.env.example`, README with run, test and build commands. Vitest and Playwright configured.

## Out of scope
Real pages, Supabase auth screens.

## Done when (and how a human tests it)

- Fresh clone: install, `npm run dev` with mocks on, shell renders.
- Switching the dev role changes the sidebar items.
- A sandbox page renders every shared component in each state.
- `npm run lint`, `typecheck`, `test`, `build` all pass.
- Unit tests pass for `format.ts` (money never becomes float, timezone shown).

## Report back
Summary, files changed, commands run with results, assumptions, known gaps, human decisions needed.
