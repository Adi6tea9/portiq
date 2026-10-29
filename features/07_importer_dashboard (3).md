# PortIQ UI · 00 READ FIRST (shared rules)

You are building the **frontend only** for PortIQ, a shipment planning and port-capacity forecasting prototype. The backend is built separately.
You are given this file, one feature file (`01_` to `10_`), and `PortIQ_API_Contract_v0.1.md`. Read this file and the API contract every time. Build **only** the feature file you are given. Do not touch other features' pages. If a feature file disagrees with the API contract, the API contract wins on data shapes and the feature file wins on UI behaviour. Report conflicts instead of guessing.

## 0. How to work

1. Inspect the repo first (`apps/web/`). Report what exists, what is missing, and your file-level plan. Do not generate everything in one go.
2. Build only the feature file you were given. Run lint, type-check, tests and build after each slice. Fix failures, never suppress them or delete tests.
3. Build against the **mock API** first (section 8), then switch the base URL to the real API with no code changes.
4. End each session with: summary, files changed, commands run with results, assumptions, known gaps, next step, human decisions needed.

## 1. Stack (fixed, do not substitute)

- Next.js App Router, React, strict TypeScript (no `any`), Tailwind CSS, shadcn/ui
- React Hook Form + Zod for forms
- TanStack Query for server state, TanStack Table for tables, Recharts for charts
- Supabase Auth with `@supabase/ssr` (session only; the API does authorization)
- Tests: Vitest + React Testing Library, Playwright for E2E. Use one set only.
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_USE_MOCKS`. No other secrets in the frontend, ever.
## 2. Non-negotiable rules

1. **Never fabricate data.** No hard-coded predictions, costs, capacity values or "live" claims in real code paths. Mock fixtures live only in `lib/mocks/`, are served only when `NEXT_PUBLIC_USE_MOCKS=true`, and show a visible "Demo data" badge.
2. **Never calculate** tariffs, costs, dwell time or utilization in TypeScript. Display what the API returns. The one exception is the unit display conversion in section 5.
3. **Route guards are convenience only.** The server decides access. Handle 401 (redirect to sign-in) and 403/404 (permission/not-found state) from any call.
4. **Role comes from `GET /me`.** Never from a form field, local storage or URL.
5. **Synthetic data is always labelled** where a user could mistake it for live data (see 7).
6. **Predicted and actual values look different** in layout and copy.
7. A **missing value is never shown as zero**. Show "Unavailable" with the reason from the API.
8. Types are written once in `lib/api/types.ts` from the contract (section 4). No ad-hoc inline types. If an `openapi.json` is later provided, generate types from it instead.
9. Unknown response fields are ignored. Nullable fields are always handled.
## 4. API types (TypeScript, mirror of contract v0.1)

```ts
export type Role = "importer_exporter" | "port_operator" | "platform_admin";
export type CargoType = "general_container" | "reefer" | "hazardous" | "oversized";
export type ShippingLine = "Line A" | "Line B" | "Line C" | "Line D" | "other";
export type VesselSizeBand = "small" | "medium" | "large";
export type DocumentationStatus = "complete" | "incomplete" | "unknown";
export type ShipmentStatus = "submitted" | "arrived" | "cleared";
export type ResourceType = "yard" | "berth";
export type SourceType = "synthetic" | "imported";

export interface Meta { request_id: string; generated_at?: string;
  pagination?: { page: number; page_size: number; total: number } }
export interface ApiError { error: { code: string; message: string;
  details?: { field: string; issue: string }[]; request_id: string } }
export interface Warning { code: "DEMO_DATA" | "CAPACITY_UNAVAILABLE" | "EXPLANATION_UNAVAILABLE"
  | "TARIFF_MISSING" | "OUT_OF_RANGE_INPUT"; message: string }

export interface CostLine { component: "customs_duty" | "port_storage" | "demurrage" | "other_charge";
  amount: string | null; status: "estimated" | "unavailable"; reason: string | null;
  rule_version: string | null }
export interface CapacitySnapshot { status: "available" | "unavailable"; reason: string | null;
  resource_type?: ResourceType | null; utilization_pct?: number | null;
  source_type?: SourceType | null; bucket_start?: string | null; bucket_end?: string | null }
export interface Explanation { status: "available" | "unavailable"; reason: string | null;
  method?: "SHAP"; base_value_days?: number; unit?: "days";
  features: { name: string; value: string | number; contribution: number }[] }
export interface Prediction { prediction_id: string; shipment_id: string;
  predicted_dwell_days: number; predicted_clearance_at: string; currency: "INR";
  cost_breakdown: CostLine[]; total_estimated_cost: string | null; total_is_partial: boolean;
  capacity_snapshot: CapacitySnapshot | null; explanation: Explanation | null;
  warnings: Warning[];
  provenance: { model_version: string; dataset_version: string; tariff_rule_versions: string[];
    generated_at: string; data_source: SourceType; is_demo_data: boolean } }
```
Shipment, capacity bucket and tariff rule types follow sections 4, 6 and 7 of the API contract.
## 5. Formatting and units

- Always show units: days, kg, INR, percent. Money uses `Intl.NumberFormat("en-IN")` on the decimal string. Do not parse to float for arithmetic.
- Dwell: "6.2 days" (one decimal). Percent: "72%" (zero decimals) with `%`.
- Timestamps arrive in UTC. Display in the port's timezone from the port record, with the zone shown, for example "2 Nov 2026, 11:30 IST".
- Numbers in tables and cards use tabular numerals, right-aligned.
## 7. Required copy

Disclaimer, shown on the prediction result and on the cost card:
> PortIQ provides planning estimates based on the shipment information, model version, capacity assumptions and tariff rules available at the time of calculation. Estimates are not an official customs assessment or a guaranteed operational outcome.

Cost note: "Indicative total; verify against applicable tariffs and carrier terms."
Synthetic badge text: "Synthetic demo data". Capacity label: "Forecast based on synthetic demo data".
SHAP caption template: "Documentation status increased the model estimate by 0.8 days." Add once on the card: "These are model effects, not proof of cause."

| Say | Never say |
| --- | --- |
| "Estimated dwell time: 6.2 days" | "Your cargo will clear in 6.2 days" |
| "Forecast based on synthetic demo data" | "Live port conditions", "real-time" |
| "One applicable tariff rule could not be resolved" | a zero amount |
| "Indicative total" | "Final payable cost" |
| "Model estimate increased by …" | "Missing documents caused a delay" |
## 8. Mock API (to unblock you)

- Create typed fixtures in `lib/mocks/` for: `/me` (one per role), shipments, one full prediction, one partial prediction (demurrage `unavailable`), one with `explanation.status: "unavailable"`, one with `capacity_snapshot.status: "unavailable"`, capacity buckets, an empty capacity list, tariff rules, and error responses (401, 403, 404, 409, 422, 429, 503).
- Serve them with MSW only when `NEXT_PUBLIC_USE_MOCKS=true`. Every mock payload keeps `is_demo_data: true` and the DEMO_DATA warning.
- Build and test every state above from these fixtures.
- The real API client (`lib/api/client.ts`) attaches the Supabase access token as `Authorization: Bearer`, reads `meta.request_id`, and throws a typed `ApiError`. Centralize 401 handling there.
## 10. Design system

### Colour tokens (define as CSS variables and Tailwind theme)
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
| `warning` | `#B7791F` | At risk, watch |
| `danger` | `#C2413A` | Errors, blocked |
| `info` | `#2563EB` | Info callouts |

Strong colours are for status, warnings and risk only.

### Type and layout
- Inter if bundled, else a system sans stack. Body 14 to 16 px, line height 1.45 to 1.6. Headings semibold, no all-caps except tiny eyebrow labels. Tabular numerals for numbers. Monospace only for IDs.
- Spacing scale 4, 8, 12, 16, 24, 32, 40, 48 px. Content max width about 1280 px, forms narrower. Radius 8 to 12 px, subtle borders, light shadows. No heavy gradients or glassmorphism.
- Shell: collapsible sidebar on desktop, compact nav on mobile, top bar with page title and profile menu.
- Logo: clean wordmark "PortIQ" with a small original container/route motif. Do not copy any real company logo.

### Components
- **Buttons**: primary navy or teal; secondary surface with border; destructive danger; disabled state clearly visible.
- **Status badges**: always label + icon, never colour alone. Labels: Submitted, Arrived, Cleared, At risk, Forecast only.
- **Tables**: sortable and filterable, keyboard focus, empty state, server-side pagination, tabular numerals, sticky header only where useful.
- **Forms**: persistent labels, unit hints, errors next to the field, no placeholder-only labels.
- **Charts**: title, legend, axis units, date range, stable colour per series, and a table or text alternative.
- **Capacity thresholds**: text legend plus colour.

### Accessibility
Target WCAG 2.2 AA: visible focus, full keyboard use, contrast checked, reduced-motion respected, non-colour status cues, labelled inputs, accessible chart summaries. Works at desktop and tablet widths, usable on mobile.
## Shared page states (apply to every feature)

Every page that loads data designs all of: **loading** (skeleton), **empty** (useful call to action), **error** (message + request ID + retry), **permission**, **partial/stale**.
