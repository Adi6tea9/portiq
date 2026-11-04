# PortIQ · Frontend Master Spec v1.0

Single source of truth for the frontend coding agent. It merges the build specification (17 Oct 2026), the API contract v0.1 and the 10 UI feature files. Where the old API contract left response shapes undefined, this file defines them (marked **[PROPOSED]**: the backend must match, or tell the human).

## 0. How to use this file

- The agent is given this file plus **one prompt** from `PortIQ_Agent_Prompts.md`. Each prompt says which feature section (F01 to F10) to build. Build only that section.
- Precedence: section 2 (protocol) > section 4 (global rules) > section 5 (data contract) > feature section > everything else.
- Anything not written in this file does not exist. Do not invent endpoints, fields, enum values, pages, libraries or copy. See section 2.

## 1. Product context (what you need to know, nothing more)

PortIQ is a role-based planning web app. Importers/exporters create shipments and get an **estimated** container dwell time, an **indicative** cost breakdown, a SHAP explanation and a capacity forecast. Port operators see port-scoped aggregates and at-risk shipments. Platform admins maintain **demo** tariff rules.

Honest scope (the UI must reflect it): no live terminal integration. All data is synthetic demo data. Estimates are not guarantees and not an official customs assessment. Predicted values and actual values are different things.

Roles: `importer_exporter`, `port_operator`, `platform_admin`. Public sign-up always creates `importer_exporter`.

Shipment lifecycle (actual status): `submitted` → `arrived` → `cleared`. A prediction **never** changes actual status.

Required disclaimer (exact text, shown on prediction result and cost card):
> PortIQ provides planning estimates based on the shipment information, model version, capacity assumptions and tariff rules available at the time of calculation. Estimates are not an official customs assessment or a guaranteed operational outcome.

## 2. Anti-hallucination protocol (mandatory)

1. **Only use what is written here.** Endpoints, fields, enums, routes and copy come from this file. If you need something that is not defined, do not invent it. Add an entry to `apps/web/CONTRACT_GAPS.md` (what you needed, where, what you assumed), isolate the assumption behind one named function, mark it in code with `// CONTRACT-GAP: <id>`, and continue.
2. **Verify, don't recall.** Before using any package or API, check it exists and its version: `npm view <pkg> version`, read the installed package's types or docs in `node_modules`. For shadcn/ui use its CLI to add components. Pin versions in `package.json`; commit the lockfile. Do not add a library that is not in section 3.
3. **No claim without evidence.** Never say "works", "passes" or "done" unless you ran the command in this session and can paste the output. Report exact commands and results (pass/fail counts). If you could not run something, say so.
4. **Look at the UI.** After each feature, run the app in mock mode and capture Playwright screenshots of every state listed in that feature. Report the screenshot file paths. Do not describe how a page "should" look as if you had seen it.
5. **No placeholder content.** No lorem ipsum, no invented numbers, no fake names outside `lib/mocks/`. Empty states use real copy from section 7.
6. **One feature per session.** Do not touch other features' files except shared components (see 4.10).
7. **Inspect before editing.** First report what exists in the repo and your file-level plan, then proceed unless a gap blocks you. Never overwrite working code without reading it.
8. **Stop and report** (do not guess) if: a requirement conflicts with another, a test cannot be made to pass without weakening it, or an environment problem blocks you. Never delete or loosen a test to pass.
9. **Report format at the end of every session:** Summary · Files created/changed · Commands run with results · Screenshots · Assumptions and `CONTRACT-GAP` entries · Known limitations · Human decisions needed · Next step.

## 3. Stack and repo layout (fixed)

- Next.js App Router, React, strict TypeScript (`"strict": true`, no `any`, no `@ts-ignore`), Tailwind CSS, shadcn/ui
- React Hook Form + Zod, TanStack Query, TanStack Table, Recharts
- `@supabase/ssr` for session only (the API authorizes)
- Tests: Vitest + React Testing Library + MSW (unit/component), Playwright (E2E, screenshots), `@axe-core/playwright` (accessibility)
- ESLint + Prettier. Scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`.
- Env vars (and no others): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_USE_MOCKS`. Never any secret or service key in the frontend.

```
apps/web/
  app/(auth)/login  app/(auth)/signup
  app/(app)/dashboard  shipments  shipments/new  shipments/[id]
  app/(app)/shipments/[id]/prediction/[predictionId]
  app/(app)/capacity  operator  admin/tariffs  settings
  app/page.tsx (landing)
  components/ui (shadcn)  components/shared  components/features/<feature>
  lib/api/{client.ts,types.ts,hooks/}  lib/format.ts  lib/mocks/  lib/auth/
  tests/  e2e/
  CONTRACT_GAPS.md  README.md  .env.example
```

## 4. Global rules

1. **No fabricated data** in real code paths. Mock fixtures live only in `lib/mocks/`, served only when `NEXT_PUBLIC_USE_MOCKS=true`, with the Demo badge visible.
2. **No business math in TypeScript.** Never compute dwell, cost, totals, clearance dates or utilization. Display what the API returns. Only formatting is allowed.
3. **Route guards are convenience.** The server decides access. Handle 401 (to `/login` with return path), 403 and 404 (permission / not-found state) from every call.
4. **Role comes only from `GET /me`.** Never from a form, URL or storage.
5. **A missing value is never shown as zero.** Show "Unavailable" and the API `reason`.
6. **Synthetic data is always labelled** (Demo badge, "Forecast based on synthetic demo data").
7. **Estimate vs actual** are visually and verbally distinct (label "Estimate" vs "Recorded").
8. **Types** live once in `lib/api/types.ts`. Unknown response fields are ignored. Every nullable field is handled.
9. **Money** is a decimal string. Never `parseFloat` it for display math. Format with `Intl.NumberFormat("en-IN")` on the string via a safe formatter.
10. **Shared components** (`components/shared`) may only be changed in F01, except for backwards-compatible additions, which must be listed in the report.
11. **Accessibility:** WCAG 2.2 AA target. Visible focus, keyboard use, labelled inputs, status never by colour alone, reduced motion respected, tables/text alternative for every chart.
12. **Forms:** persistent labels, unit hints, errors next to the field, typed input preserved after errors, no double submit.
13. **Security in the browser:** no tokens in `localStorage` by hand (use the Supabase SDK), no `dangerouslySetInnerHTML` with API data, no logging of tokens.

## 5. Data contract (API v0.1 + defined shapes)

Base path `NEXT_PUBLIC_API_BASE_URL` = `.../api/v1`. JSON. Auth header `Authorization: Bearer <access token>`.

### 5.1 Conventions
- Timestamps: UTC ISO-8601 ending `Z`. Display in the port's timezone (from `GET /ports`) with the zone shown.
- Units in names (`weight_kg`, `predicted_dwell_days`, `utilization_pct`).
- Pagination query `page` (default 1), `page_size` (default 20, max 100). Response `meta.pagination`.
- Success: `{ "data": ..., "meta": { "request_id": "...", "generated_at": "...", "pagination"?: {...} } }`
- Error: `{ "error": { "code", "message", "details"?: [{ "field", "issue" }], "request_id" } }`

| HTTP | `error.code` | UI behaviour |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | Generic error state with request ID |
| 401 | `UNAUTHENTICATED` | Redirect to `/login`, return after sign-in |
| 403 | `FORBIDDEN` | Permission state |
| 404 | `NOT_FOUND` | Not-found state (also for other users' resources) |
| 409 | `STATE_CONFLICT` | Message: "That status change is not allowed." |
| 409 | `IDEMPOTENCY_CONFLICT` | Message: "This request was already submitted with different details." |
| 409 | `TARIFF_CONFLICT` | Conflict dialog |
| 422 | `VALIDATION_ERROR` | Map `details[].field` to form fields |
| 429 | `RATE_LIMITED` | "Too many requests. Please wait and try again." |
| 500 | `INTERNAL_ERROR` | Generic error with request ID |
| 503 | `MODEL_UNAVAILABLE` | "The prediction service is unavailable. Try again later." with retry |

### 5.2 Enums (exact strings; one place: `types.ts`) **[CONFIRM]** where marked
`Role`: importer_exporter, port_operator, platform_admin · `Direction`: import, export · `CargoType` [CONFIRM]: general_container, reefer, hazardous, oversized · `ContainerSizeFt` [CONFIRM]: 20, 40 · `ShippingLine` [CONFIRM]: "Line A", "Line B", "Line C", "Line D", other · `VesselSizeBand` [CONFIRM]: small, medium, large · `DocumentationStatus`: complete, incomplete, unknown · `ShipmentStatus`: submitted, arrived, cleared · `ResourceType`: yard, berth · `SourceType`: synthetic, imported · `Currency` [CONFIRM]: INR · `CostComponent`: customs_duty, port_storage, demurrage, other_charge · `RuleType`: customs_duty, port_storage, demurrage, other_charge · `RateType`: per_day, percent_of_value, flat, tiered · `WarningCode`: DEMO_DATA, CAPACITY_UNAVAILABLE, EXPLANATION_UNAVAILABLE, TARIFF_MISSING, OUT_OF_RANGE_INPUT · `AtRiskCode` [PROPOSED]: FORECAST_THRESHOLD_CROSSED, DWELL_ABOVE_THRESHOLD, DOCUMENTATION_INCOMPLETE.
`hs_code` is a string, exactly 6 digits (`^\d{6}$`). Never a number.

### 5.3 Endpoints

| Method + path | Roles | Purpose |
| --- | --- | --- |
| `GET /me` | any | Server-confirmed identity |
| `PATCH /me` [PROPOSED] | any | Update `display_name` only |
| `GET /config` [PROPOSED] | any | UI thresholds and limits |
| `GET /ports` [PROPOSED] | any | Ports the user may use |
| `GET /shipments` | importer, operator (scoped) | Paginated list |
| `GET /shipments/summary` [PROPOSED] | importer | Status counts |
| `POST /shipments` | importer | Create |
| `GET /shipments/{id}` | owner, scoped operator | Detail with events |
| `PATCH /shipments/{id}` | owner | Allowlisted edit before `arrived` |
| `POST /shipments/{id}/events` | scoped operator | Record milestone |
| `POST /shipments/{id}/prediction` | owner, scoped operator | Run prediction (`Idempotency-Key` header required) |
| `GET /shipments/{id}/predictions` | same | History (paginated) |
| `GET /shipments/{id}/predictions/{prediction_id}` [PROPOSED] | same | One full prediction |
| `GET /capacity/forecast` | importer, operator | Buckets |
| `GET /operator/overview` | operator, admin | Aggregates |
| `GET /operator/shipments` | operator, admin | Filterable table |
| `GET /admin/tariffs` / `POST` / `PATCH /{rule_id}` | admin | Tariff rules |
| `GET /admin/audit-logs` | admin | Audit trail |

List query params: `GET /shipments`: `status`, `arrival_from`, `arrival_to`, `q` (reference search), `page`, `page_size`. `GET /capacity/forecast`: `port_id`, `resource_type`, `from`, `to`, `page`, `page_size`. `GET /operator/overview`: `from`, `to`, optional `port_id`. `GET /operator/shipments`: `status`, `arrival_from`, `arrival_to`, `min_predicted_dwell_days`, `warning_code`, `at_risk`, `page`, `page_size`. `GET /admin/tariffs`: `rule_type`, `port_id`, `hs_code_prefix`, `shipping_line`, `is_active`, `valid_on`, `page`, `page_size`.

### 5.4 TypeScript types (write these into `lib/api/types.ts` exactly)

```ts
export type Role = "importer_exporter" | "port_operator" | "platform_admin";
export type Direction = "import" | "export";
export type CargoType = "general_container" | "reefer" | "hazardous" | "oversized";
export type ContainerSizeFt = 20 | 40;
export type ShippingLine = "Line A" | "Line B" | "Line C" | "Line D" | "other";
export type VesselSizeBand = "small" | "medium" | "large";
export type DocumentationStatus = "complete" | "incomplete" | "unknown";
export type ShipmentStatus = "submitted" | "arrived" | "cleared";
export type ResourceType = "yard" | "berth";
export type SourceType = "synthetic" | "imported";
export type Currency = "INR";
export type CostComponent = "customs_duty" | "port_storage" | "demurrage" | "other_charge";
export type RateType = "per_day" | "percent_of_value" | "flat" | "tiered";
export type WarningCode = "DEMO_DATA" | "CAPACITY_UNAVAILABLE" | "EXPLANATION_UNAVAILABLE"
  | "TARIFF_MISSING" | "OUT_OF_RANGE_INPUT";
export type AtRiskCode = "FORECAST_THRESHOLD_CROSSED" | "DWELL_ABOVE_THRESHOLD" | "DOCUMENTATION_INCOMPLETE";

export interface Pagination { page: number; page_size: number; total: number }
export interface Meta { request_id: string; generated_at?: string; pagination?: Pagination }
export interface Envelope<T> { data: T; meta: Meta }
export interface ApiErrorBody { error: { code: string; message: string;
  details?: { field: string; issue: string }[]; request_id: string } }
export interface Warning { code: WarningCode; message: string }

export interface Me { user_id: string; email: string; display_name: string | null;
  role: Role; assigned_port_ids: string[] }
export interface AppConfig { capacity_thresholds: { moderate_pct: number; high_pct: number };
  max_forecast_range_days: number; default_bucket: "day" }
export interface Port { id: string; name: string; port_code: string; timezone: string }

export interface LatestPredictionSummary { prediction_id: string; created_at: string;
  predicted_dwell_days: number; total_estimated_cost: string | null;
  total_is_partial: boolean; model_version: string; is_demo_data: boolean }
export interface Shipment { id: string; port_id: string; reference: string; direction: Direction;
  cargo_type: CargoType; container_size_ft: ContainerSizeFt; hs_code: string; weight_kg: number;
  declared_value: string; currency: Currency; shipping_line: ShippingLine;
  vessel_size_band: VesselSizeBand; expected_arrival_at: string;
  documentation_status: DocumentationStatus; status: ShipmentStatus;
  actual_arrival_at: string | null; actual_cleared_at: string | null;
  actual_dwell_days: number | null; created_at: string; updated_at: string;
  latest_prediction: LatestPredictionSummary | null }
export interface ShipmentCreate { port_id: string; reference: string; direction: Direction;
  cargo_type: CargoType; container_size_ft: ContainerSizeFt; hs_code: string; weight_kg: number;
  declared_value: string; currency: Currency; shipping_line: ShippingLine;
  vessel_size_band: VesselSizeBand; expected_arrival_at: string;
  documentation_status: DocumentationStatus }
// Editable before status "arrived" (allowlist). Never status, owner or port.
export type ShipmentPatch = Partial<Pick<ShipmentCreate, "cargo_type" | "container_size_ft"
  | "hs_code" | "weight_kg" | "declared_value" | "shipping_line" | "vessel_size_band"
  | "expected_arrival_at" | "documentation_status">>;
export interface ShipmentEvent { id: string; shipment_id: string; event_type: string;
  from_status: ShipmentStatus | null; to_status: ShipmentStatus; occurred_at: string;
  recorded_at: string; actor_display_name: string | null; note: string | null }
export interface ShipmentDetail extends Shipment { events: ShipmentEvent[] }
export interface EventCreate { to_status: ShipmentStatus; occurred_at: string; note?: string }
export interface ShipmentSummary { total: number; status_counts: Record<ShipmentStatus, number> }

export interface CostLine { component: CostComponent; amount: string | null;
  status: "estimated" | "unavailable"; reason: string | null; rule_version: string | null }
export interface CapacitySnapshot { status: "available" | "unavailable"; reason: string | null;
  resource_type?: ResourceType | null; utilization_pct?: number | null;
  source_type?: SourceType | null; bucket_start?: string | null; bucket_end?: string | null }
export interface ExplanationFeature { name: string; value: string | number; contribution: number }
export interface Explanation { status: "available" | "unavailable"; reason: string | null;
  method?: "SHAP"; base_value_days?: number; unit?: "days"; features: ExplanationFeature[] }
export interface Provenance { model_version: string; dataset_version: string;
  tariff_rule_versions: string[]; generated_at: string; data_source: SourceType;
  is_demo_data: boolean }
export interface Prediction { prediction_id: string; shipment_id: string;
  predicted_dwell_days: number; predicted_clearance_at: string; currency: Currency;
  cost_breakdown: CostLine[]; total_estimated_cost: string | null; total_is_partial: boolean;
  capacity_snapshot: CapacitySnapshot | null; explanation: Explanation | null;
  warnings: Warning[]; provenance: Provenance }
export interface PredictionHistoryItem { prediction_id: string; created_at: string;
  model_version: string; predicted_dwell_days: number; total_estimated_cost: string | null;
  total_is_partial: boolean; is_demo_data: boolean }

export interface CapacityBucket { bucket_start: string; bucket_end: string;
  resource_type: ResourceType; predicted_occupied: number; total_capacity: number;
  utilization_pct: number; source_type: SourceType; model_or_rule_version: string;
  generated_at: string }

export interface AtRiskItem { shipment_id: string; reference: string;
  reasons: { code: AtRiskCode; message: string }[] }
export interface DwellBin { bin_start_days: number; bin_end_days: number; count: number }
export interface OperatorOverview { port_scope: { id: string; name: string }[];
  range: { from: string; to: string }; status_counts: Record<ShipmentStatus, number>;
  utilization: { yard: CapacityBucket[]; berth: CapacityBucket[] };
  at_risk_count: number; at_risk: AtRiskItem[]; dwell_distribution: DwellBin[] }
export interface OperatorShipmentRow { shipment: Shipment; at_risk_reasons: AtRiskItem["reasons"];
  warning_codes: WarningCode[] }

export interface TariffRule { id: string; rule_type: CostComponent; port_id: string | null;
  hs_code_prefix: string | null; shipping_line: ShippingLine | null;
  cargo_type: CargoType | null; container_size_ft: ContainerSizeFt | null;
  rate_type: RateType; rate_value: string; currency: Currency; free_days: number | null;
  tier_config: unknown | null; valid_from: string; valid_to: string | null;
  source_note: string; version: string; is_active: boolean }
export type TariffRuleCreate = Omit<TariffRule, "id" | "is_active">;
export interface AuditLogItem { id: string; actor_display_name: string | null; action: string;
  entity_type: string; entity_id: string; before: unknown | null; after: unknown | null;
  created_at: string; request_id: string }
```
`PATCH /admin/tariffs/{rule_id}` body: `{ "is_active": false }` (deactivate). Superseding = `POST` a new version. There is no delete.
`POST /shipments/{id}/prediction` has an empty body and requires the `Idempotency-Key` header (a UUID).

### 5.5 Rules the API guarantees (and the UI relies on)
- `predicted_clearance_at` = expected arrival + predicted dwell [CONFIRM]. The UI only displays it.
- A missing tariff gives a cost line with `status: "unavailable"`, `amount: null`, a `reason`. `total_is_partial` is true if any line is unavailable.
- If SHAP fails the prediction still returns with `explanation.status: "unavailable"`. If capacity is missing, `capacity_snapshot.status: "unavailable"`.
- Capacity: a bucket with `total_capacity <= 0` is invalid and never returned as 0%. An empty list means no forecast.
- Forecast range max is `config.max_forecast_range_days` (31 [CONFIRM]).

## 6. Formatting (`lib/format.ts`, unit-tested)
- Money: decimal string to `₹` en-IN grouping without float math, for example `"45000.00"` → "₹45,000.00". `null` is never formatted as 0.
- Dwell: "6.2 days". Percent: "72%". Weight: "12,000 kg".
- Dates: port timezone with zone abbreviation, for example "2 Nov 2026, 11:30 IST". Inputs are UTC.
- Numbers in tables use tabular numerals and are right-aligned.

## 7. Copy
- Cost note: "Indicative total; verify against applicable tariffs and carrier terms."
- Partial total: "Indicative total. Some components could not be calculated."
- Synthetic badge: "Synthetic demo data". Capacity label: "Forecast based on synthetic demo data". Forecast time: "Forecast generated at <time>".
- Explanation caption: "These are model effects, not proof of cause." Per-feature sentence: "<Feature> increased/decreased the model estimate by <n> days."
- Empty states: Shipments: "No shipments yet. Create your first shipment to get an estimate." · Capacity: "No forecast is available for this range." · Predictions: "No prediction yet."
- Status badge labels: Submitted, Arrived, Cleared, At risk, Forecast only (label + icon).

| Say | Never say |
| --- | --- |
| "Estimated dwell time: 6.2 days" | "Your cargo will clear in 6.2 days" |
| "Forecast based on synthetic demo data" | "Live port conditions", "real-time" |
| "One applicable tariff rule could not be resolved" | a zero amount |
| "Indicative total" | "Final payable cost" |
| "Model estimate increased by …" | "Missing documents caused a delay" |

Do not use the words "guaranteed", "real-time", "live" or "AI knows" anywhere in UI copy.

## 8. Design system

| Token | Hex | Use |
| --- | --- | --- |
| `deep-ink` | `#071D2B` | Dark background, text on light only if contrast passes |
| `harbor-navy` | `#102A43` | Brand, navigation, headings |
| `ocean-teal` | `#0D9488` | Primary accent, active states |
| `light-teal` | `#D8F3EF` | Soft highlights |
| `route-blue` | `#3B82F6` | Links, informational series |
| `canvas` | `#F5F7FA` | App background |
| `surface` | `#FFFFFF` | Cards, forms, tables |
| `border` | `#D9E2EC` | Dividers, outlines |
| `text` | `#172B4D` | Body text |
| `muted` | `#627D98` | Secondary text |
| `success` | `#1F8A5B` | Cleared, complete |
| `warning` | `#B7791F` | At risk |
| `danger` | `#C2413A` | Errors |
| `info` | `#2563EB` | Info callouts |

Define as CSS variables and in the Tailwind theme. Strong colours only for status, warning and risk. Check every text/background pair for AA contrast and report failures instead of hiding them.
- Type: Inter if bundled, else system sans. Body 14 to 16 px, line height 1.45 to 1.6, headings semibold, tabular numerals for numbers, monospace only for IDs.
- Spacing scale 4, 8, 12, 16, 24, 32, 40, 48 px. Max content width about 1280 px; forms narrower. Radius 8 to 12 px, subtle borders, light shadows. No heavy gradients or glassmorphism.
- Shell: collapsible sidebar (desktop), compact nav (mobile), top bar with title and profile menu.
- Logo: a clean "PortIQ" wordmark with a small original container/route motif. Do not copy any real logo.
- Buttons: primary navy or teal; secondary surface + border; destructive danger; disabled clearly visible.
- Charts: title, legend, axis units, date range, stable colour per series, table or text alternative.
- Responsive: desktop and tablet fully; mobile usable.

## 9. Mock API (MSW, in `lib/mocks/`)
Enabled only with `NEXT_PUBLIC_USE_MOCKS=true`. Handlers for every endpoint in 5.3, returning the envelopes in 5.1. All payloads keep `is_demo_data: true` and a `DEMO_DATA` warning where applicable. Fixtures (typed with `types.ts`):
- `/me` for each role (the importer has no assigned ports; the operator has two), `/config` (60 / 85, 31), `/ports` (two ports with different timezones).
- 12 shipments across statuses incl. one `cleared` with `actual_dwell_days`; events for each.
- Predictions: **full**, **partial** (demurrage unavailable, `total_is_partial: true`), **explanation unavailable**, **capacity unavailable**, **all-unavailable except dwell**.
- Capacity: 30 days of yard and berth buckets with some above 85%; an empty list; a list containing an invalid bucket (capacity 0).
- Operator overview with 3 at-risk items (one with no reasons), 40 operator rows, dwell distribution.
- 6 tariff rules, 15 audit logs.
- Error responses for each code in 5.1, switchable by a dev panel or query flag (`?mock_error=503`).
- A dev-only role switcher (hidden when mocks are off).

## 10. Features

Each feature lists scope, data, UI, states, tests and a human check. All pages also need loading (skeleton), empty (useful call to action), error (message, request ID, retry), permission, and partial/stale states.

### F01 · Setup, design system, shell, mock API
**Needs:** nothing. **Goal:** a skeleton every later feature plugs into.
1. Inspect `apps/web/`, report what exists and a file plan.
2. Project config (section 3), tokens (section 8), `lib/api/types.ts` (5.4), `lib/format.ts` (section 6) with unit tests.
3. `lib/api/client.ts`: Bearer token from Supabase session, reads `meta.request_id`, throws a typed `ApiError`, central 401 handling, `Idempotency-Key` helper, base URL from env.
4. Shared components: `StatusBadge`, `DemoBadge`, `PageState` (loading/empty/error/permission), `Callout`, `DataTable` (server pagination, keyboard focus), `Field`, `Money`, `DateTime`, `Stat` card.
5. App shell with role-driven nav (role from `/me`), top bar, mobile nav.
6. Mock API and fixtures (section 9), dev role switcher.
7. `.env.example`, README (setup, run, test, build), Vitest, Playwright, axe configured.
8. A `/dev/sandbox` page (dev only) rendering each shared component in each state.
**Out of scope:** real pages, Supabase screens.
**Human check:** fresh clone runs in mock mode; role switch changes nav; sandbox shows all states; lint, typecheck, test, build pass; `format.ts` tests pass.

### F02 · Auth and role navigation
**Needs:** F01. Pages `/login`, `/signup`, recovery link. Supabase email and password. After sign-in call `GET /me`.

| Route | Roles |
| --- | --- |
| `/dashboard`, `/shipments`, `/shipments/new` | importer_exporter |
| `/shipments/[id]`, `/capacity` | importer_exporter, port_operator |
| `/operator` | port_operator, platform_admin |
| `/admin/tariffs` | platform_admin |
| `/settings` | any signed-in |

No role picker anywhere. A forbidden route shows the permission page (no blank, no redirect loop). 401 sends to `/login` and returns to the page afterwards. Errors never reveal whether an email exists. Routes of later features render a placeholder "Coming in F0N".
**Tests:** validation, role-to-nav map for 3 roles, forbidden UX, 401 return path.
**Human check:** operator sees no Shipments nav; opening `/admin/tariffs` as importer shows permission page; sign-out blocks back-button access.

### F03 · Create shipment and shipment list
**Needs:** F01, F02. Endpoints: `GET /ports`, `POST /shipments`, `GET /shipments`.
**New `/shipments/new`:** fields port (from `/ports`), reference, direction, cargo type, container size (20/40 ft), HS code (6 digits), weight (kg), declared value, currency (INR), shipping line, vessel size band, expected arrival (entered in the port timezone, sent as UTC), documentation status. Zod: weight > 0, declared value >= 0 (decimal string, 2 places), HS `^\d{6}$`, required fields, enums from `types.ts`. Map 422 `details[]` to fields. Keep input after errors. Disable submit while saving. On success go to `/shipments/[id]`. Never send owner, status or role.
**List `/shipments`:** server pagination (max 100), filters status, arrival range, reference search. Columns: reference, cargo type, status badge, expected arrival, latest predicted dwell ("Not predicted yet" if none). Empty state with "Create shipment".
**Tests:** Zod rules, 422 mapping, no double submit, pagination and filter params.
**Human check:** valid submit lands on detail placeholder; weight 0 and HS "85044" show field errors with input kept; mocked 422 on `weight_kg` shows under the field; empty and 503 states appear.

### F04 · Shipment detail, timeline, edit, events
**Needs:** F03. Endpoints: `GET /shipments/{id}`, `PATCH`, `POST /events`, `GET /predictions`.
Header: reference, actual-status badge, port. Timeline from `events` (status, occurred time, recorded time when different, who, note). Fields panel with units. Latest prediction card (links to result) or "No prediction yet" with the Run button rendered **disabled** ("Available after F05"). Prediction history table. **Edit** (owner, only before `arrived`, only `ShipmentPatch` fields). **Record event** (scoped operator): only the next allowed status; `409` shows the STATE_CONFLICT message. For `cleared` with `actual_dwell_days`: **Predicted vs actual** side by side with different styling and labels ("Estimate" / "Recorded"). Not-found state for unknown or unauthorized ids.
**Tests:** allowed-transition options, edit hidden after arrived, estimate vs recorded labels, 409 handling.
**Human check:** importer sees Edit and no Record event; operator sees "Arrived" only; cleared shipment shows both values clearly distinct.

### F05 · Run prediction and result page (highest risk)
**Needs:** F04. Endpoints: `POST /shipments/{id}/prediction`, `GET /shipments/{id}/predictions/{prediction_id}`.
**Run:** enable the button. New UUID per click as `Idempotency-Key`; reuse the same key only for an automatic retry of that click. Disable while running. Handle 429, 503, 409 IDEMPOTENCY_CONFLICT, 404, 401. On success go to `/shipments/[id]/prediction/[predictionId]`. A rerun adds a history row, never overwrites.
**Result page, in order:**
1. Headline card: "Estimated dwell time: 6.2 days"; "Estimated clearance: <date>". Label Estimate.
2. Cost card: components with amount, status, rule version, `reason` if unavailable; total; partial warning; cost note; disclaimer. Unavailable shows "Unavailable", never 0.
3. Capacity card: resource, percent with text threshold label (using `/config` thresholds), source, bucket dates; unavailable shows reason, no number.
4. "What influenced this": horizontal diverging bars of signed `contribution` in days, feature name and value, base value, per-feature sentence, caption. A table alternative. If unavailable: reason only, **no chart, no placeholder bars**.
5. Warnings as callouts. 6. Provenance footer with Demo badge. 7. Disclaimer.
**Tests (one per state):** full, partial cost, explanation unavailable, capacity unavailable, demo badge, 503, 429; double click sends one request; text "0.00" never appears for an unavailable line.
**Human check:** open each mock fixture and confirm the 7 blocks; screenshots attached.

### F06 · Capacity forecast
**Needs:** F01, F02. Endpoints: `GET /capacity/forecast`, `/ports`, `/config`.
Controls: port, date-range picker (max `max_forecast_range_days`, enforced in UI), Yard / Berth tabs, daily buckets. Chart of utilization percent (axis 0 to 100, titled, units, date range). Table alternative (start, occupied, capacity, utilization, source, version). Threshold legend (lower / moderate / high) from `/config` as text and colour. Labels: forecast generated time; synthetic label. Empty list: explicit empty state, never a flat 0% line. Invalid buckets (capacity <= 0 or utilization outside 0 to 100) are skipped with the note "N buckets could not be shown".
**Tests:** range cap, empty state, invalid bucket note, tab request params.
**Human check:** 30 days chart equals table; Berth tab changes data; empty fixture shows empty state; legend shows text.

### F07 · Importer dashboard
**Needs:** F03 to F05 (F06 optional). Endpoints: `GET /shipments/summary`, `GET /shipments` (latest, upcoming via `arrival_from/to`), `GET /capacity/forecast`.
Cards: active shipments by status, latest predicted dwell (Estimate label), latest indicative cost with breakdown and partial warning, upcoming arrivals (next 7 days), latest milestone, capacity snapshot with synthetic label. Actions: New shipment, open detail, rerun. Each card loads and fails independently. No counts that include other users' data.
**Tests:** per-card error isolation, empty states.
**Human check:** new user shows empty states with call to action; failing capacity breaks only its card.

### F08 · Operator overview
**Needs:** F04, F06. Endpoints: `GET /operator/overview`, `GET /operator/shipments`.
KPI row (status counts, yard and berth utilization, at-risk count), utilization charts (reuse F06 chart), dwell distribution chart with table alternative, at-risk list showing API `reasons` (if none: "Reason unavailable", never invented), filterable table (status, arrival window, min predicted dwell, warning type), server pagination, row to detail, date range (max 31 days), "Port scope" label from `port_scope`. Admin can open it too.
**Tests:** reason display rules, filter params, role access.
**Human check:** two-port operator sees both; item without reasons shows "Reason unavailable"; importer gets the permission page.

### F09 · Admin tariffs and audit trail
**Needs:** F01, F02. Endpoints: tariffs `GET/POST/PATCH`, `GET /admin/audit-logs`.
Rules tab: table with filters, "Demo tariff data" badge. New version form (fields of `TariffRuleCreate`; Zod: `valid_to` after `valid_from`, `rate_value` >= 0 decimal string, source note required). 409 `TARIFF_CONFLICT` opens a dialog with the conflicting rule. **No delete control.** Only "Deactivate" and "Create new version", each with a confirm dialog. Audit tab: who, when, action, before and after, paginated. Admin only.
**Tests:** form rules, conflict dialog, no-delete, role access.
**Human check:** `valid_to` before `valid_from` errors; mocked 409 shows the conflict; importer gets the permission page.

### F10 · Settings, landing, accessibility, E2E
**Needs:** F01 to F09.
Landing `/`: "Predict. Plan. Ship.", three-step how it works, honest limitations (no live terminal integration, estimates not guarantees, synthetic demo data), sign-in and sign-up buttons, mobile-friendly. Settings `/settings`: display name editable via `PATCH /me`, role read-only. Accessibility pass on every page (focus, keyboard-only flows, contrast, reduced motion, labels, chart summaries, no colour-only status), axe with no serious violations. Copy pass: search for "guaranteed", "real-time", "live", "final" and fix unjustified uses. E2E (mock mode): importer creates a shipment, runs a prediction, sees the result; operator sees scoped data only; importer cannot open `/admin/tariffs`; admin creates a tariff version. Update the README.
**Human check:** keyboard-only run through the main flow; E2E green from a clean clone.

## 11. Definition of done (every feature)
- Section 2 protocol followed; report in the required format.
- All states designed and screenshotted. Types match section 5.4. No business math in TypeScript.
- `npm run lint`, `typecheck`, `test`, `build` pass with output shown. E2E for the feature passes where one exists.
- No secrets, no fake data outside `lib/mocks/`, no unjustified claims in copy.

## 12. Open items for the human (backend must match)
1. All **[PROPOSED]** endpoints and shapes in 5.3 and 5.4 (`/me` PATCH, `/config`, `/ports`, `/shipments/summary`, single-prediction GET, operator and audit shapes) need your teammate's agreement.
2. All **[CONFIRM]** enums and values (cargo types, shipping lines, vessel bands, INR only, 31-day range, clearance formula).
3. The spec has no `container_size_ft` column and no `operator_ports` table yet. The backend needs both.
4. Capacity thresholds 60 and 85 are placeholders, served by `/config`.
