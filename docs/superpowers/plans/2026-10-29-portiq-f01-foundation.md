# PortIQ F01 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build only the PortIQ F01 frontend foundation: exact API contract types, safe formatting and client infrastructure, fixed design system, shared components, responsive role-driven shell, complete mock API, and a development component sandbox with verification screenshots.

**Architecture:** Repair the existing untracked `apps/web` Next.js application in place. Keep contract types, API transport, formatting, typed mock fixtures, shared primitives, and shell behavior in focused files; mount MSW only when `NEXT_PUBLIC_USE_MOCKS=true`; render no real F02–F10 feature pages. The PortIQ master specification is the sole authority for tokens, copy, accessibility, and behavior. Use Stripe only as a compatible interaction/layout reference: restrained dashboard hierarchy, subtle bordered surfaces, tabular numerals, sparing primary actions, compact forms, and clear responsive collapse—never Stripe colors, proprietary typography, gradient mesh, pill geometry, or branding.

**Tech Stack:** Next.js App Router, React, strict TypeScript, Tailwind CSS, shadcn/ui, Supabase SSR session access, TanStack Query/Table, MSW, Vitest + React Testing Library, Playwright + axe.

**Spec:** `C:/Users/adity/Downloads/PortIQ_Frontend_Master_Spec_v1.md`, especially sections 2–9, F01, and definition of done.

## Global Constraints

- Implement F01 only; do not build authentication screens or real feature pages.
- Precedence is section 2 → section 4 → section 5 → F01 → remaining content.
- Add no endpoint, field, enum, route, library, or copy absent from the specification; record unavoidable gaps in `apps/web/CONTRACT_GAPS.md` with a named function and `// CONTRACT-GAP: <id>`.
- Use strict TypeScript with no `any` or `@ts-ignore`; define API types once in `lib/api/types.ts`.
- Pin package versions and use only libraries listed in section 3; verify package versions and installed types before use.
- Never calculate dwell, costs, totals, clearance dates, or utilization in frontend code.
- Treat money as decimal strings; never use `parseFloat` for display or show missing values as zero.
- Mock data stays under `lib/mocks/`, is active only with `NEXT_PUBLIC_USE_MOCKS=true`, and is visibly labelled synthetic demo data.
- Role comes only from mocked `GET /me`; status and estimates must never be communicated by colour alone.
- Target WCAG 2.2 AA: persistent labels, keyboard access, visible focus, reduced motion, semantic state announcements, and tabular/right-aligned numbers.
- Use exact PortIQ colors, spacing, typography, state copy, and disclaimers; do not retain unrelated “Linear-inspired” tokens.
- Completion claims require fresh command output and Playwright screenshots of every required state.
- Treat each listed commit step as a review boundary only; do not create commits unless the user explicitly authorizes them.

## Review Focus

1. Very large decimal money strings and malformed decimal strings must format safely without precision loss or silently becoming zero; Task 2 tests both.
2. Malformed/non-JSON API errors and missing request IDs must still produce a typed useful error without crashing parsing; Task 3 tests both.
3. Mock role changes must update `/me` and navigation without leaking mock controls when mocks are disabled; Tasks 6 and 7 test both modes.
4. Server-paginated tables must retain keyboard focus and announce loading/empty/error states; Task 5 tests keyboard and accessible-state behavior.
5. The development sandbox must not be reachable in a production build, while reduced-motion and mobile navigation remain usable; Task 8 tests these conditions.

---

### Task 1: Exact contract and project configuration

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/package-lock.json`
- Modify: `apps/web/tsconfig.json`
- Modify: `apps/web/next.config.js`
- Modify: `apps/web/tailwind.config.ts`
- Modify: `apps/web/app/globals.css`
- Replace: `apps/web/lib/api/types.ts`
- Modify: `apps/web/.env.example`
- Modify: `apps/web/CONTRACT_GAPS.md`

**Interfaces:**
- Consumes: section 3 stack, section 5.4 exact TypeScript block, section 8 tokens.
- Produces: all exported section 5.4 types (`Role`, `Envelope<T>`, `Me`, `Shipment`, `Prediction`, `CapacityBucket`, `OperatorOverview`, `TariffRule`, and related types), strict aliases, fixed scripts, and CSS/Tailwind tokens consumed by every later task.

- [ ] **Step 1: Verify each direct package and its installed declaration files before editing versions**

Run `npm view <package> version` for each direct dependency/dev dependency and inspect the relevant `node_modules/<package>/package.json` plus declaration entry. Record results in the eventual session report; do not add libraries outside section 3.

- [ ] **Step 2: Add a contract compile test**

Create `apps/web/tests/types.contract.test-d.ts` or a Vitest type assertion file proving the section 5.4 names and exact key shapes compile, including `ContainerSizeFt = 20 | 40`, `Shipment.id`, nullable prediction fields, and `TariffRuleCreate`.

- [ ] **Step 3: Replace `lib/api/types.ts` with section 5.4 exactly**

Keep the names, property names, unions, nullability, and comments exactly as specified; do not retain prior aliases such as `ContainerSize`, `ApiResponse`, `shipment_id`, or `owner_user_id`.

- [ ] **Step 4: Normalize configuration and design tokens**

Pin exact package versions, preserve the four allowed environment variables with base URL ending `/api/v1`, retain strict TypeScript, define only section 8 CSS variables/Tailwind colors, use the specified 1280px content width and 4–48px spacing, and add reduced-motion/focus defaults.

- [ ] **Step 5: Remove stale contract gaps and document only real F01 assumptions**

Delete entries made obsolete by F01. If Supabase SSR exposes no session accessor that satisfies the client boundary, add one precise gap using the mandated format rather than deferring required F01 behavior to F02.

- [ ] **Step 6: Install the pinned manifest and verify the contract**

Run `npm install`, then `npm run typecheck`. Expected: lockfile updated and typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/tsconfig.json apps/web/next.config.js apps/web/tailwind.config.ts apps/web/app/globals.css apps/web/lib/api/types.ts apps/web/.env.example apps/web/CONTRACT_GAPS.md apps/web/tests/types.contract.test-d.ts
git commit -m "feat(web): establish F01 contract and configuration

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Task 2: Safe formatting utilities

**Files:**
- Replace: `apps/web/lib/format.ts`
- Replace: `apps/web/lib/format.test.ts`

**Interfaces:**
- Consumes: `ContainerSizeFt` from Task 1 and section 6 formats.
- Produces: `formatMoney(amount: string | null): string`, `formatDays(days: number): string`, `formatPercent(value: number): string`, `formatWeight(kg: number): string`, `formatDateTime(isoTimestamp: string, timezone: string): string`, plus any existing date-only/container helpers still required by shared components.

- [ ] **Step 1: Write failing formatter tests**

Cover exact examples `"45000.00" → "₹45,000.00"`, Indian grouping, zero as a real value, `null → "Unavailable"`, malformed strings → `"Unavailable"`, negative values, values beyond JavaScript safe integer precision without lost digits, `6.2 days`, `72%`, `12,000 kg`, and `2 Nov 2026, 11:30 IST`.

- [ ] **Step 2: Run tests to verify current failures**

Run `npm run test -- lib/format.test.ts --run`. Expected: failures for null/malformed money and precision-safe formatting.

- [ ] **Step 3: Implement minimal string-safe formatting**

Validate decimal-string syntax, split sign/integer/fraction as strings, apply en-IN grouping to integer digits without numeric conversion, and use `Intl.DateTimeFormat` only for date/time and finite numeric unit formatting. Invalid or absent values return `Unavailable`, never zero.

- [ ] **Step 4: Run formatter tests**

Run `npm run test -- lib/format.test.ts --run`. Expected: all formatter tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/format.ts apps/web/lib/format.test.ts
git commit -m "feat(web): add safe PortIQ formatters

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Task 3: Typed API client and session boundary

**Files:**
- Replace: `apps/web/lib/api/client.ts`
- Create: `apps/web/lib/api/client.test.ts`
- Create: `apps/web/lib/auth/client.ts`

**Interfaces:**
- Consumes: `Envelope<T>` and `ApiErrorBody` from Task 1, allowed environment variables, installed `@supabase/ssr` API.
- Produces: `ApiError`, `apiClient<T>(path: string, init?: ApiRequestInit): Promise<Envelope<T>>`, `createIdempotencyKey(): string`, and `getAccessToken(): Promise<string | null>`.

- [ ] **Step 1: Write failing client tests**

Assert base URL composition, bearer header when a session exists, omitted authorization when absent, `Idempotency-Key`, complete envelope return including `meta.request_id`, typed 401/403/404 errors, 401 navigation to `/login?returnTo=<encoded path>`, malformed JSON fallback, and missing request ID fallback.

- [ ] **Step 2: Run client tests to verify failure**

Run `npm run test -- lib/api/client.test.ts --run`. Expected: failures against the partial client.

- [ ] **Step 3: Implement the Supabase browser session boundary**

Use the installed `@supabase/ssr` browser client and only the two public Supabase environment variables. Return the current access token without manually reading or writing local storage.

- [ ] **Step 4: Implement the API client**

Read JSON defensively, preserve envelope metadata, set JSON headers only when appropriate, create typed errors with status/code/message/details/request ID, and centralize browser-only 401 redirection with the current path and query as `returnTo`.

- [ ] **Step 5: Run API tests and typecheck**

Run `npm run test -- lib/api/client.test.ts --run && npm run typecheck`. Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/api/client.ts apps/web/lib/api/client.test.ts apps/web/lib/auth/client.ts
git commit -m "feat(web): implement typed API client

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Task 4: Base UI and simple shared components

**Files:**
- Modify through shadcn CLI as needed: `apps/web/components/ui/*`
- Replace: `apps/web/components/shared/StatusBadge.tsx`
- Replace: `apps/web/components/shared/DemoBadge.tsx`
- Replace: `apps/web/components/shared/Callout.tsx`
- Replace: `apps/web/components/shared/Field.tsx`
- Create: `apps/web/components/shared/Money.tsx`
- Create: `apps/web/components/shared/DateTime.tsx`
- Create: `apps/web/components/shared/Stat.tsx`
- Create: `apps/web/components/shared/shared-components.test.tsx`

**Interfaces:**
- Consumes: Task 1 tokens/types and Task 2 formatters.
- Produces: the named F01 shared components with typed props and accessible status/copy consumed by sandbox and later features.

- [ ] **Step 1: Add required shadcn primitives using its CLI**

Use the installed shadcn CLI only for primitives actually required by F01 (button, badge, input, label, dropdown/sheet/select as needed); do not hand-copy a second component system.

- [ ] **Step 2: Write failing shared-component tests**

Assert all three shipment labels plus `At risk` and `Forecast only` include icons/text, DemoBadge says `Synthetic demo data`, Field connects label/hint/error IDs and required state, Money renders missing values as `Unavailable`, DateTime includes a timezone, Stat exposes label/value/supporting text, and Callout has appropriate live-region semantics.

- [ ] **Step 3: Run shared tests to verify failures**

Run `npm run test -- components/shared/shared-components.test.tsx --run`. Expected: missing components and accessibility assertions fail.

- [ ] **Step 4: Implement the minimal shared components**

Use PortIQ tokens, persistent labels, visible focus supplied globally, semantic icons plus text, no API HTML injection, tabular/right-aligned numeric presentation, and no feature-specific business logic.

- [ ] **Step 5: Run shared tests**

Run `npm run test -- components/shared/shared-components.test.tsx --run`. Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/ui apps/web/components/shared
git commit -m "feat(web): add accessible shared components

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Task 5: Page states and server-paginated DataTable

**Files:**
- Replace: `apps/web/components/shared/PageState.tsx`
- Create: `apps/web/components/shared/DataTable.tsx`
- Create: `apps/web/components/shared/page-state.test.tsx`
- Create: `apps/web/components/shared/data-table.test.tsx`

**Interfaces:**
- Consumes: Task 4 Button and Task 1 `Pagination`.
- Produces: `PageState` for loading/empty/error/permission and generic `DataTable<TData>` driven by TanStack columns, server pagination metadata, `onPageChange`, row key, and optional accessible row action.

- [ ] **Step 1: Write failing PageState tests**

Assert skeleton loading is announced without motion under reduced-motion preference, exact shipments empty copy can be rendered, errors expose message/request ID/retry, permission state is labelled, and action/retry buttons are keyboard operable.

- [ ] **Step 2: Write failing DataTable tests**

Assert semantic table headers, empty state, page/page-size/total display, disabled boundary controls, `onPageChange` values, focus preservation after pagination rerender, and a loading announcement.

- [ ] **Step 3: Run focused tests to verify failures**

Run `npm run test -- components/shared/page-state.test.tsx components/shared/data-table.test.tsx --run`. Expected: failures until components are implemented.

- [ ] **Step 4: Implement PageState and DataTable**

Keep pagination controlled/server-side; do not add client sorting/filtering. Use skeleton blocks instead of only a spinner, table captions/screen-reader descriptions, focusable rows only when they have an action, and no colour-only state.

- [ ] **Step 5: Run focused tests**

Run the Step 3 command. Expected: all focused tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/shared/PageState.tsx apps/web/components/shared/DataTable.tsx apps/web/components/shared/page-state.test.tsx apps/web/components/shared/data-table.test.tsx
git commit -m "feat(web): add page states and data table

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Task 6: Complete typed MSW API and fixtures

**Files:**
- Replace/split: `apps/web/lib/mocks/fixtures/*.ts`
- Replace: `apps/web/lib/mocks/handlers.ts`
- Modify: `apps/web/lib/mocks/browser.ts`
- Create: `apps/web/lib/mocks/server.ts`
- Create: `apps/web/lib/mocks/role.ts`
- Create: `apps/web/lib/mocks/handlers.test.ts`
- Generate: `apps/web/public/mockServiceWorker.js`

**Interfaces:**
- Consumes: every Task 1 contract type and section 9 fixture counts/states.
- Produces: typed fixtures, `handlers`, `worker`, test `server`, and mock-role state used by the shell/dev switcher.

- [ ] **Step 1: Write failing handler contract tests**

Cover all section 5.3 routes and success envelope metadata; three `/me` roles; `/config` 60/85/31; two timezone-distinct ports; 12 shipments and events; five required prediction states; yard/berth/empty/invalid capacity; operator overview with three at-risk entries including one reasonless item and 40 rows; six tariffs; 15 audits; and each section 5.1 error switch via `?mock_error=<status or code>`.

- [ ] **Step 2: Add boundary tests for writes and role switching**

Assert create/update/event/prediction/tariff routes use contract keys, pagination defaults to 1/20 and caps at 100, idempotency header is required, admin tariff deactivation accepts only `{ is_active: false }`, no delete handler exists, changing mock role changes `/me`, and no handler uses random failures.

- [ ] **Step 3: Run handler tests to verify failures**

Run `npm run test -- lib/mocks/handlers.test.ts --run`. Expected: incomplete routes, counts, types, and deterministic-error tests fail.

- [ ] **Step 4: Build typed fixtures**

All object literals must satisfy section 5.4 types; put invented demo values only here; mark prediction/capacity responses synthetic and include `DEMO_DATA` warnings where applicable. Use fixed timestamps/IDs for deterministic tests.

- [ ] **Step 5: Implement every handler**

Use `/api/v1`, standard envelopes, typed request-body narrowing with runtime checks rather than `any`, deterministic pagination/filter behavior, error query override, all listed methods, and no business calculations beyond fixture filtering/pagination and mock trust-boundary validation.

- [ ] **Step 6: Generate the service worker using the installed MSW CLI**

Run the installed CLI targeting `public`; do not hand-author the worker.

- [ ] **Step 7: Run mock tests and typecheck**

Run `npm run test -- lib/mocks/handlers.test.ts --run && npm run typecheck`. Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/mocks apps/web/public/mockServiceWorker.js
git commit -m "feat(web): complete typed F01 mock API

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Task 7: Responsive role-driven application shell

**Files:**
- Create: `apps/web/components/providers/MockProvider.tsx`
- Create: `apps/web/components/shell/AppShell.tsx`
- Create: `apps/web/components/shell/RoleNav.tsx`
- Create: `apps/web/components/shell/DevRoleSwitcher.tsx`
- Create: `apps/web/components/shell/navigation.ts`
- Create: `apps/web/components/shell/app-shell.test.tsx`
- Modify: `apps/web/app/layout.tsx`
- Replace: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: `Me`/`Role`, `/me` handler and mock role state, Task 4 UI.
- Produces: responsive shell, role map, top bar/profile menu, mobile nav, and mock-only role switcher used by sandbox and E2E.

- [ ] **Step 1: Write failing shell tests**

Assert nav derives only from supplied `/me` data; importer, operator, and admin each receive the appropriate F01 navigation placeholders; role switch refetches `/me`; desktop sidebar and labelled mobile toggle exist; profile displays identity/role; mock switcher is absent when `NEXT_PUBLIC_USE_MOCKS` is not `true`; keyboard opens/closes mobile/profile controls.

- [ ] **Step 2: Run shell tests to verify failures**

Run `npm run test -- components/shell/app-shell.test.tsx --run`. Expected: missing shell tests fail.

- [ ] **Step 3: Implement conditional mock startup**

`MockProvider` starts the worker only in browser development/mock mode and shows children after startup without importing mock code into active real-data behavior.

- [ ] **Step 4: Implement the shell and role navigation**

Use a desktop collapsible sidebar, compact mobile navigation, top bar title, original PortIQ text/motif, profile menu, DemoBadge, and dev role selector. Root content remains a foundation placeholder, not a real feature page.

- [ ] **Step 5: Run shell tests**

Run the Step 2 command. Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/providers apps/web/components/shell apps/web/app/layout.tsx apps/web/app/page.tsx
git commit -m "feat(web): add role-driven application shell

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Task 8: Development sandbox, E2E accessibility, and screenshots

**Files:**
- Replace: `apps/web/app/dev/sandbox/page.tsx`
- Create: `apps/web/app/dev/sandbox/not-found.tsx` if needed by the production guard
- Create: `apps/web/tests/e2e/f01.spec.ts`
- Modify: `apps/web/playwright.config.ts`
- Modify: `apps/web/vitest.config.ts`
- Create/modify: `apps/web/tests/setup.ts`
- Create: `apps/web/test-results/screenshots/.gitkeep`

**Interfaces:**
- Consumes: all shared components and shell from Tasks 4–7.
- Produces: dev-only comprehensive sandbox and the F01 browser verification/screenshot suite.

- [ ] **Step 1: Build a production guard test for `/dev/sandbox`**

Unit-test the named environment guard or add a production-server Playwright assertion that the route resolves to not-found outside development. Do not rely only on hiding a link.

- [ ] **Step 2: Rebuild the sandbox**

Render StatusBadge (all statuses including At risk/Forecast only), DemoBadge, all Callout/PageState variants, DataTable loaded/empty/loading, Field normal/hint/error/disabled, Money available/unavailable, DateTime valid/unavailable, Stat variants, and required UI button states. Replace `alert()` actions with local accessible status updates.

- [ ] **Step 3: Write F01 Playwright tests**

Assert shell and sandbox render in mock mode; run axe with no serious violations; test keyboard navigation, mobile menu, role switching for all three roles, reduced-motion behavior, sandbox production guard, and visible synthetic-data labels.

- [ ] **Step 4: Add deterministic screenshots**

Capture `sandbox-desktop.png`, `sandbox-mobile.png`, `shell-importer.png`, `shell-operator.png`, and `shell-admin.png` under `test-results/screenshots/`, waiting for fonts/MSW and disabling transitions before capture.

- [ ] **Step 5: Run the F01 browser suite**

Run `NEXT_PUBLIC_USE_MOCKS=true npm run test:e2e -- tests/e2e/f01.spec.ts`. Expected: all tests pass and all five screenshot files exist.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/dev apps/web/tests apps/web/playwright.config.ts apps/web/vitest.config.ts
git commit -m "test(web): verify F01 sandbox and shell

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Task 9: Documentation and full definition-of-done verification

**Files:**
- Replace: `apps/web/README.md`
- Modify: `apps/web/CONTRACT_GAPS.md`
- Modify only if verification exposes issues: F01 files from Tasks 1–8

**Interfaces:**
- Consumes: final commands, exact environment behavior, fixture/state inventory.
- Produces: truthful setup/run/test/build documentation and the evidence required for the final session report.

- [ ] **Step 1: Update README from verified behavior only**

Document install, allowed environment variables, mock-mode startup, scripts, architecture, sandbox development restriction, role switcher, fixture/error selection, test commands, and current F01-only limitations. Remove unverified claims and references to unrelated design systems.

- [ ] **Step 2: Run the complete unit/component suite**

Run `npm run test -- --run`. Expected: report exact passing test/file counts.

- [ ] **Step 3: Run static verification**

Run `npm run lint` and `npm run typecheck`. Expected: both exit 0 with exact output recorded.

- [ ] **Step 4: Run the production build**

Run `npm run build`. Expected: exit 0; confirm `/dev/sandbox` is inaccessible in production behavior.

- [ ] **Step 5: Run F01 Playwright again against a clean mock-mode server**

Run the feature command from Task 8. Expected: all tests pass and screenshots are refreshed.

- [ ] **Step 6: Audit forbidden patterns and scope**

Search non-mock code for `any`, `@ts-ignore`, `parseFloat`, `dangerouslySetInnerHTML`, manual token/localStorage handling, fabricated predictions/costs/capacity, and forbidden UI claims. Inspect git diff to ensure no F02–F10 pages were implemented.

- [ ] **Step 7: Commit documentation/final fixes**

```bash
git add apps/web/README.md apps/web/CONTRACT_GAPS.md apps/web
git commit -m "docs(web): document verified F01 foundation

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

- [ ] **Step 8: Produce the required report**

Use exactly: Summary · Files created/changed · Commands run with results · Screenshot paths · Assumptions and `CONTRACT-GAP` entries · Known limitations · Human decisions needed · Next step. State failures/skips plainly and do not claim success without this session’s output.
