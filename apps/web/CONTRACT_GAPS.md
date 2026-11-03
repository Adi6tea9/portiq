# Contract Gaps

Assumptions and deviations made while implementing F01 and F02.

## GAP-001: Supabase session wiring

**Location:** `lib/auth/client.ts`, `lib/auth/server.ts`, `lib/api/client.ts`

F02 adds browser and server Supabase clients plus the login, signup, recovery, and callback flow. Requests attach a Bearer token when a Supabase session exists. Mock mode bypasses Supabase and uses the mock auth adapter in GAP-010.

## GAP-002: 401 redirect

**Location:** `lib/api/client.ts`, `components/features/auth/AppGuard.tsx`

A 401 calls `window.location.assign(buildLoginRedirectUrl())` with the current path as `returnTo`. F02 adds `/login`, safe return-path validation, and the AppGuard fallback for unauthenticated users. The typed `ApiError` is still thrown for callers.

## GAP-003: Role source

**Location:** `lib/mocks/role.ts`, `components/providers/RoleProvider.tsx`, `components/providers/MeProvider.tsx`

The spec says role comes only from `GET /me`. In real mode, AppShell and AppGuard use the role returned by `/me`. In mock mode, the dev role switcher stores `portiq.mock.role` in `localStorage` and `/me` returns the matching fixture so the dev switcher remains useful without a real Supabase account. The switcher is never rendered when mocks are disabled.

## GAP-004: Placeholder routes

**Location:** `app/(app)/*/page.tsx`

F01/F02 routes render `Coming in F0N` placeholders instead of 404s, matching the requirement that later-feature routes have a placeholder. Placeholder feature numbers: dashboard F07, shipments F03, capacity F06, operator F08, tariffs F09, shipments/new F03, shipment detail F04, prediction F05, settings F10.

## GAP-005: Muted token contrast

**Location:** `app/globals.css`

The spec token `muted` is `#627D98`, which measures 3.98:1 on `canvas` and 4.28:1 on `surface`, below WCAG AA for normal text. It is darkened to `#5B738B` (4.58:1 and 4.92:1) so secondary text meets the spec's accessibility requirement. No other token is changed.

## GAP-006: Mock role switcher is a dev tool

**Location:** `components/shell/DevRoleSwitcher.tsx`

The spec forbids a role picker in production. The switcher is rendered only when `NEXT_PUBLIC_USE_MOCKS=true`; it disappears with mocks disabled.

## GAP-007: Sandbox route

**Location:** `app/(app)/dev/sandbox/page.tsx`

The sandbox is a development-only surface for every shared component and fixture state. It is not in primary navigation and calls `notFound()` when `NODE_ENV === "production"`. It is intentionally exempt from the auth guard so component and role-switcher checks remain usable without signing in.

## GAP-008: Mock computed values

**Location:** `lib/mocks/fixtures/capacity.ts`, `lib/mocks/fixtures/shipments.ts`

Fixtures derive a few display values (utilization percent, actual dwell days, events) so the mock API returns complete payloads. Application components never compute dwell, cost, totals, clearance dates, or utilization; they only format API values.

## GAP-009: Node 26 localStorage warning

**Location:** `apps/web/.npmrc`

Node 26 warns when the experimental global `localStorage` is accessed without `--localstorage-file`. `.npmrc` supplies the ignored `.localstorage` file so dev, build, and test commands run without that warning. Browser code still uses `window.localStorage` with an in-memory fallback.

## GAP-010: Mock auth adapter

**Location:** `lib/auth/mock.ts`, `lib/auth/actions.ts`

The spec describes Supabase auth but not how mock-mode E2E should establish a session. Mock mode uses a session-only flag in `sessionStorage` (`portiq.mock.auth`) and a `portiq:mock-auth` event. It accepts any validly formatted email/password, never stores a token, and is used only when `NEXT_PUBLIC_USE_MOCKS=true`.

## GAP-011: Recovery and reset routes

**Location:** `app/(auth)/forgot-password/page.tsx`, `app/(auth)/reset-password/page.tsx`, `app/auth/callback/route.ts`

The spec mentions password recovery but does not define route names or copy. F02 adds `/forgot-password`, `/reset-password`, and `/auth/callback`, with the callback exchanging the Supabase code and redirecting to a safe internal `next` path. The reset screen is required to complete the recovery flow.

## GAP-012: Auth copy and validation

**Location:** `lib/auth/validation.ts`, `lib/auth/actions.ts`

The spec does not define field-level auth validation or error copy. F02 uses email format validation, required passwords, and an 8-character signup/reset minimum. Auth errors are deliberately generic and non-enumerating, for example `Unable to sign in. Check your details and try again.` and `If an account exists for that email, a recovery link has been sent.`

## GAP-013: Route access table

**Location:** `lib/auth/route-access.ts`

The spec defines navigation and role permissions but not a complete URL-to-role table. F02 derives it from the role navigation and feature permissions: dashboard/shipments/new are importer-only, shipment detail and capacity are importer/operator, operator overview is operator/admin, tariffs are admin-only, and settings is available to every signed-in role. Unknown routes are not guarded by this table.

## GAP-014: Auth link contrast

**Location:** `components/features/auth/LoginForm.tsx`, `SignupForm.tsx`, `ForgotPasswordForm.tsx`

The `route-blue` token (`#3B82F6`) measures 3.67:1 on the white auth surface, below WCAG AA for 14px text. Auth links use the darker `primary` token instead. The shared `route-blue` token is unchanged, and the F02 axe check covers login and the protected shell.

## GAP-015: Capacity forecast generated time

**Location:** `components/features/predictions/PredictionResultClient.tsx`

**Status: resolved (2 Nov 2026).** The copy list in section 7 includes "Forecast generated at <time>", but `CapacitySnapshot` has no `generated_at` field. Per the product decision, no backend field is added: the capacity card shows "Forecast generated at <time>" using the prediction's `provenance.generated_at`, formatted in the port timezone. The snapshot's `bucket_start`/`bucket_end` still label the forecast window, and no separate capacity timestamp is displayed.

## GAP-016: Prediction result timezone source

**Location:** `components/features/predictions/PredictionResultClient.tsx`

**Status: resolved (2 Nov 2026).** `Prediction` has no `port_id` or timezone. Per the product decision, no backend change is made: the page resolves the shipment's `port_id` via `GET /shipments/{id}` and its timezone via `GET /ports`, then formats all timestamps in that port timezone. If `/ports` fails, dates fall back to UTC, matching the existing F04 detail behaviour.

## GAP-017: Rerun entry point

**Location:** `components/features/shipments/ShipmentDetailClient.tsx`

**Status: resolved (2 Nov 2026).** `POST /shipments/{id}/prediction` supports reruns and the mock appends a history row. Per the product decision, the result page has no rerun control â€” only a "Back to shipment" link. Rerun lives on the shipment detail page ("Latest prediction" card) and, when built, the F07 dashboard. Both use the same `RunPredictionButton` so the Idempotency-Key rules stay in one place.

## GAP-018: Run error mock flag

**Location:** `lib/mocks/handlers.ts`, `lib/shipments/api.ts`, `app/(app)/shipments/[id]/page.tsx`

The 503 and 429 run states are needed for screenshots. The generic `mock_error` flag would also fail the shipment load, so the prediction POST honours a separate `mock_run_error` query flag, mirroring the F04 `mock_event_error` flag. It only exists in the mock API.




## GAP-019: Capacity mock flags and default range

**Location:** `app/(app)/capacity/page.tsx`, `lib/capacity/api.ts`, `lib/mocks/handlers.ts`

The spec has no way to request the empty or invalid fixture, and the mock forecast must track the calendar. F06 adds `mock_empty=1` and `mock_invalid=1` query flags that the page passes through to `GET /capacity/forecast`, mirroring the F05 `mock_run_error` flag; they exist only in the mock API and are ignored unless mocks are enabled (GAP-024). The mock fixtures generate 60 daily buckets starting today (UTC), so the page's default today to today + 30 days window always has data. E2E and screenshots compute their range from the current date instead of pinning calendar dates.

## GAP-020: Invalid bucket filtering

**Location:** `components/features/capacity/CapacityClient.tsx`

The contract does not define `utilization_pct` behaviour when `total_capacity` is zero or out of range. F06 treats a bucket as invalid when `total_capacity <= 0` or `utilization_pct` is not a finite value in 0-100, removes it from the chart and table, and reports the count as "N buckets could not be shown" (singular for one). When every bucket is invalid the page shows the empty state plus the note. No number is ever recomputed from occupied/capacity in the client.

## GAP-021: Forecast range boundary

**Location:** `components/features/capacity/CapacityClient.tsx`

`max_forecast_range_days` has no stated inclusive/exclusive convention. F06 treats `to` as exclusive and blocks the request when `(to - from)` in days exceeds the config value, showing "The date range cannot exceed 31 days." and no chart or table. The `to` input's `max` is `from + max_forecast_range_days`.

## GAP-022: Dashboard latest selection

**Location:** `components/features/dashboard/DashboardClient.tsx`

F07 shows the latest predicted dwell, latest indicative cost and latest milestone, but `GET /shipments` has no `latest` or `sort` parameter. Per the product decision, the dashboard makes one `GET /shipments?page_size=100` call and selects in memory only: the newest `latest_prediction.created_at` for the dwell and cost cards, and the newest `updated_at` for the milestone. The selected record's detail is then read from `GET /shipments/{id}/predictions/{prediction_id}` and `GET /shipments/{id}`. This is selection, not business-value computation, but a backend `latest` query would remove the 100-row ceiling.

## GAP-023: Dashboard mock flags

**Location:** `app/(app)/dashboard/page.tsx`, `components/features/dashboard/DashboardClient.tsx`, `lib/shipments/api.ts`, `lib/capacity/api.ts`, `lib/mocks/handlers.ts`

The dashboard needs states the real API cannot easily produce in the demo. Three mock-only query flags exist, mirroring the F05 `mock_run_error` pattern: `mock_empty=1` (summary and list return empty data so every card shows its empty state), `mock_capacity_error=<code>` (fails only `GET /capacity/forecast` so the other five cards prove isolation), and `mock_latest_shipment=<id>` (forces which shipment the "latest" cards describe, used to screenshot the partial-cost `ship_002` case because the true newest prediction `ship_012` is all-unavailable). None of these are sent by the real UI unless the flag is present in the page URL.

The capacity snapshot has no importer port context, so it uses the latest-prediction shipment's `port_id`, falling back to the first `GET /ports` entry. It requests a single yard bucket for today to today + 30 days and shows the first valid bucket. The mock capacity fixtures cover today to today + 60 days, so the default card has data at any wall-clock date.

## GAP-024: Mock flags require mock mode

**Location:** `lib/mocks/flags.ts`, all `app/(app)/**/page.tsx` wrappers

Every `?mock_*` query flag (`mock_error`, `mock_empty`, `mock_invalid`, `mock_run_error`, `mock_event_error`, `mock_capacity_error`, `mock_latest_shipment`) is read through `mockFlag` / `mockFlagValue`, which return nothing unless `NEXT_PUBLIC_USE_MOCKS=true`. With mocks disabled the page passes no mock props, so no mock parameter is forwarded to the real API and `mock_latest_shipment` cannot change which shipment the dashboard describes. Unit-tested in `lib/mocks/flags.test.ts`.

## GAP-025: Latest-first shipment ordering

**Location:** `components/features/dashboard/DashboardClient.tsx`

The dashboard reads one page, `GET /shipments?page_size=100`, and selects the newest `latest_prediction.created_at` and newest `updated_at` in memory. **`GET /shipments` must return newest-first by `created_at` by default.** Without that ordering guarantee, an account with more than 100 shipments can page past its newest records and the dashboard's "latest" cards would show stale values. The alternative is a backend `latest`/`sort` parameter (see GAP-022); until then the contract needs the default ordering.

## GAP-026: Operator overview timezone

**Location:** `components/features/operator/OperatorClient.tsx`, `components/features/capacity/CapacityChart.tsx`

`CapacityBucket` has no port field, and an operator can cover ports in different timezones (Nhava Sheva and Singapore in the mock). The overview therefore formats every date and chart axis in UTC and says so next to the controls. `CapacityChart` gained optional `timezoneLabel` and `hasTableAlternative` props so the shared F06 chart can state "UTC" without a separate copy; F06's defaults and output are unchanged.

## GAP-027: Utilization KPI source bucket

**Location:** `components/features/operator/OperatorClient.tsx`

`GET /operator/overview` returns utilization as bucket arrays, but the KPI row needs one number per resource. F08 shows `utilization_pct` verbatim from the first bucket in the requested range and prints that bucket's date under the value ("First bucket: <date> UTC"). Nothing is averaged or recomputed. A missing or non-finite value shows "Unavailable".

## GAP-028: Operator range boundary

**Location:** `components/features/operator/OperatorClient.tsx`, `lib/operator/api.ts`

The overview uses the same range convention as F06: `from` inclusive, `to` exclusive, and `(to - from)` may not exceed `max_forecast_range_days` (31 in `/config`). An over-range or invalid range shows "The date range cannot exceed 31 days." or blocks the request without changing the table filters. The mock `/operator/overview` honours `from`/`to` by filtering its utilization buckets.

## GAP-029: Independent operator table filters

**Location:** `components/features/operator/OperatorClient.tsx`, `lib/operator/api.ts`

The shipment table's arrival window is independent of the overview date range: changing the page range does not filter rows, and the arrival filters have no 31-day cap. The table sends `status`, `arrival_from`, `arrival_to`, `min_predicted_dwell_days`, `warning_code`, `page` and `page_size`; `arrival_from`/`arrival_to` are whole UTC days expanded to `00:00:00.000Z` and `23:59:59.999Z`. The API's `at_risk` parameter exists but F08 exposes no at-risk filter because the spec's filter list does not include it.

## GAP-030: Operator row detail links

**Location:** `lib/mocks/handlers.ts`, `lib/mocks/fixtures/operator.ts`

Operator table rows are generated from the importer fixtures (`ops_ship_001`â€¦`ops_ship_040`) and are not in `mockShipmentDetails`. The mock `GET /shipments/:id` now falls back to the operator row and synthesises its events, so row links resolve in the demo. The real backend must return operator-visible shipments from `GET /shipments/{id}` for the same links to work; otherwise the detail page shows its not-found state.

## GAP-031: Created shipments in the mock detail lookup

**Location:** `lib/mocks/handlers.ts`, `tests/e2e/f03.spec.ts`

`POST /shipments` previously returned an id that `GET /shipments/:id` could not resolve, so creating a shipment and opening its detail page showed "Shipment not found". The mock now adds the created shipment to `mockShipmentDetails` (detail lookup only, with synthesised events). The list and summary handlers still read `mockShipments`, so list totals and pagination stay frozen at the fixtures. This store is process-local memory and resets when the dev server restarts.

## GAP-032: Admin tariffs and audit trail

**Location:** `app/(app)/admin/tariffs/page.tsx`, `components/features/admin/tariffs/TariffsClient.tsx`, `lib/tariffs/api.ts`, `lib/tariffs/schema.ts`, `lib/mocks/handlers.ts`, `lib/mocks/fixtures/tariffs.ts`, `lib/mocks/fixtures/audit.ts`

F09 implements the admin tariffs page per `PortIQ_Frontend_Master_Spec_v1.md` F09. Rules and audit records come from the already-mocked `GET /admin/tariffs` and `GET /admin/audit-logs` endpoints. The mock `POST /admin/tariffs` returns 409 `TARIFF_CONFLICT` when a rule shares the same `rule_type`, scope (`port_id`, `hs_code_prefix`, `shipping_line`, `cargo_type`, `container_size_ft`) and `version`, and stores created rules in `mockTariffs` (in-memory) so they appear in the table. The mock `PATCH /admin/tariffs/:ruleId` mutates the stored rule so Deactivate flips `is_active` without deleting it. The UI enforces the spec rules (`valid_to` after `valid_from`, non-negative decimal `rate_value`, required `source_note`, `tier_config` only as a JSON object when `rate_type=tiered`), has no delete control, offers **Create new version** (prefills the form, posts a new rule only, leaves the old rule active) and **Deactivate** with confirm dialogs, and shows a 409 conflict dialog with the matched rule and request id. The audit tab paginates `before` and `after`. An importer gets the permission page; mock endpoints require `platform_admin`.

The 409 dialog can only show the conflicting rule if it is on the page the client has loaded: `ApiErrorBody.details[]` carries `{ field, issue }` only, with no rule payload. The client matches on `version` + `rule_type` within the current page and otherwise says the rule is not on this page. A `conflicting_rule_id` in `details[]` would remove that limitation.

The HS code prefix filter is debounced by 300 ms through the existing `lib/hooks/useDebouncedValue` so typing does not issue one request per keystroke. Tab, filters and pagination are component state, not query parameters, so a filtered view is not deep-linkable; that was not required by F09.

## GAP-033: Request body for `PATCH /me` - RESOLVED

**Spec:** `docs/FRONTEND_SPEC.md` F10 describes settings as "display name editable, role read-only" and lists `PATCH /me` as the endpoint, but it does not name the request body type or say which fields the endpoint accepts.

**Resolved:** The backend confirmed the contract on 2026-11-03. `PATCH /me` accepts `{ "display_name": string }`, trimmed, 1-80 characters, and nothing else. Success returns 200 with the updated `Me` in the usual envelope. A blank or over-long name returns 422 `VALIDATION_ERROR` with `details: [{ "field": "display_name", "issue": "..." }]` (`must not be empty` when blank, otherwise the length message). The client sends `MeUpdate` from `lib/api/me.ts` (trimmed, `DISPLAY_NAME_MAX_LENGTH = 80`), and the inline field error renders `details[].issue`. The `// CONTRACT-GAP: GAP-033` marker is removed because nothing is assumed any more.

**Mock behaviour:** The mock `PATCH /me` mirrors the confirmed contract (trim, 1-80 chars, 422 with the same detail shape) and stores the accepted name in an in-memory map (`mockDisplayNames`) so a follow-up `GET /me` returns it. That map is process memory only and is cleared on reload; that is the agreed behaviour for the demo. `resetMockDisplayNames()` is exported for tests and called from `tests/setup.ts`.
