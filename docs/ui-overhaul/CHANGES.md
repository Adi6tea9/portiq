# UI/UX overhaul: changes (24 Nov 2026)

Implements the plan in `AUDIT.md`, using `reference image.png` (Prediction Results) as the visual
direction. Frontend only: no API, schema or `.env` change, and no new dependency.

Screenshots: `before/` and `after/` hold every route per role at 1440×900 (desktop), 1024×768
(tablet) and 390×844 (mobile), named `<role>__<route>__<size>.png`. Re-run them with
`node ../../docs/ui-overhaul/screenshots.mjs after` from `apps/web` against a mock server on
:3100. The script also fails a shot that scrolls sideways.

## Shell (every page)

- **One page width.** `AppShell` wraps every page in `max-w-7xl` with 16/24/32 px gutters
  (`px-4 md:px-6 lg:px-8`). All per-page widths are gone (`max-w-4xl`, `max-w-5xl`, `max-w-6xl`,
  `max-w-xl`, and the centred `mx-auto max-w-3xl` forms).
- **One page header.** `components/shell/PageHeader.tsx`: icon tile, h1, status badges, subtitle
  and actions. Used by Dashboard, Shipments, shipment detail, New/Edit shipment, Predictions,
  Prediction results, Capacity, Load planner (both modes), Operator overview, Tariffs, Settings.
  On phones the actions drop under the title and stretch to full width.
- **Top bar.** Back button (to the nearest linked breadcrumb) and breadcrumbs for nested routes;
  on phones only the current crumb shows. Right side: demo badge (wide screens), the dev role
  switcher, a **Help** button and the profile menu (avatar initials, Settings, Sign out). There is
  no notification bell, because there are no notifications.
- **Help.** `HelpSheet.tsx` opens "What each page does": who can use each page and what it does,
  for Dashboard, Shipments, Predictions, Capacity, Load planner, Operator overview, Tariffs and
  Settings.
- **Sidebar.** Matches the reference: nav with an "AI" badge on Predictions, an **Active port**
  picker, the decision-support panel and the user card at the bottom, and Collapse. It becomes a
  drawer below 768 px; the drawer has the same nav and port picker.
- **Active port.** `ActivePortProvider` + `lib/active-port.ts`. Ports come from `usePorts`;
  operators only see their assigned ports. The choice is stored per user in `localStorage`
  (`portiq.activePort.<user_id>`, wrapped in try/catch). A user with exactly one port gets that
  port by default; otherwise there is no default until they pick one. Capacity starts on it and
  the New shipment form prefills it, but a port picked on the page always wins and is never
  overwritten.
- **Primitives.** Buttons are 40 px tall (icon buttons 40×40; small buttons 36 px, 40 px on touch
  screens via a new `coarse:` Tailwind variant), press feedback (`scale(0.97)`), and a `loading`
  prop that disables the button, sets `aria-busy` and shows a spinner. Tabs are the reference's
  pill tabs (filled green when active). Sheets open in 300 ms / close in 200 ms with a lighter
  overlay and a 40 px close button. Dialog gained `hideClose`.
- **Card headings.** `components/shared/SectionTitle.tsx` (tinted icon tile, title, optional
  InfoTip) replaces the plain card titles across the app.
- **Mobile basics.** No tap highlight, `touch-action: manipulation` on controls, 16 px inputs on
  touch screens (no zoom on focus), sidebar height uses `100dvh`.

## Navigation fixes

| Problem (AUDIT) | Fix |
| --- | --- |
| Operator/admin on `/shipments/{id}` highlighted nothing | Highlights **Operator overview**; breadcrumb "Operator overview › Shipment". |
| Prediction results had no section | New **Predictions** entry (AI badge) for importers and operators; result pages highlight it; breadcrumb "Predictions › Shipment › Results". |
| Admin missing Capacity and Load planner | Added to the admin nav and the route table. The capacity API accepts every role (`services/api/app/api/v1/capacity.py`) and the sample planner is client-only. A shipment's own load plan still needs shipment access, which admins do not have (`ScopedReader`). |
| `/settings` never active | **Settings** is a nav entry for every role, so it highlights. |
| No breadcrumbs | `breadcrumbsForPath` and `backHrefFor` in `lib/navigation.ts`. |
| Header title fell back to "PortIQ" | Replaced by breadcrumbs; `titleForPath` was deleted with its only caller. |

Active-state logic lives in one function, `activeNavHref`, unit-tested per role and route.
`/predictions` is limited to importers and operators, matching the prediction APIs
(`ScopedReader` excludes admins).

## Pages

- **Prediction results** (`PredictionResultClient.tsx`), rebuilt on the reference:
  - header: Sparkles icon, "Prediction results", AI + Completed pills, the shipment reference in
    the subtitle, **Back to shipment** and **Run new prediction**;
  - sage summary strip: container art (wide screens), Estimated dwell time with the Estimate pill
    and the estimated clearance date, Estimated total cost (full, partial or "Not available"),
    and "Prediction completed successfully" with the generated time;
  - pill tabs: **Overview** (Prediction analysis chart, Detailed feature breakdown with the top 5
    features and "View all N features", cost breakdown), **Feature impact** (chart and the full
    table), **What it means** (plain-language reading of the estimate, base value and cost),
    **Key insights** (built only from real fields: largest upward and downward SHAP drivers,
    capacity utilization and threshold, largest cost line, missing cost components, warnings);
  - right panel on every tab: Prediction details (resource, utilization and threshold label,
    data source, forecast period, synthetic note, forecast generated time), the sage model note
    (model and dataset versions), the peach **Important notes** card (each warning plus the
    disclaimer), and **Model and data** (model, dataset, generated, source, tariff rule versions,
    demo badge). Below 1280 px the panel moves under the tabs in two columns.
- **Run prediction** (`RunPredictionButton.tsx`, `PredictionProgress.tsx`): while the request
  runs, a modal shows four stages (Checking shipment details, Scoring with the dwell model,
  Calculating costs and capacity, Saving results). Stages advance every 1.2 s but stop on the last
  one: only the resolved request marks it complete ("Prediction complete, opening the results
  page"), then the app navigates. The modal cannot be dismissed while the request runs (closing
  would not cancel it); the current stage is announced through a polite live region. On error the
  modal closes and the existing 429/503/409/404 messages, request ID and Retry show inline. The
  button is disabled with a spinner, and the ref guard still blocks a double click.
- **Predictions** (new, `/predictions`, `PredictionsClient.tsx`): one row per shipment from the
  shipments list (`useShipments`) or, for operators, the port-scoped operator list
  (`useOperatorShipments`), paginated 10 per page. Rows with a prediction show estimated dwell,
  total cost (with "Partial total"), generated time in the port's timezone, model version, demo
  flag and **View results**; rows without one say "No prediction yet" and link to the shipment.
  Loading, error (with request ID and Retry), permission and empty states.
- **Dashboard:** page header with New shipment; card headings with icons. Content unchanged.
- **Shipments:** page header with an explanation and Create shipment.
- **Shipment detail:** page header (status and demo badges, port, Plan this container, Edit,
  Record event); icon card headings; the no-prediction card explains what a prediction gives; the
  latest-prediction card explains that a new run keeps history. Record event's Save shows the
  busy state.
- **New / Edit shipment:** page header; the form sits left-aligned with a "What happens next"
  side panel and a model-inputs note (stacked under 1280 px). Submit buttons show the busy state.
- **Capacity:** page header with an explanation; the Yard/Berth switch uses the pill style;
  default port from the active port.
- **Load planner** (sample and shipment modes): `PlannerWorkspace` uses `PageHeader`; shipment
  mode adds **Back to shipment**. Cargo add/save, split and delete show the busy state.
- **Operator overview:** page header that explains the page and keeps "Port scope: …".
- **Tariffs:** page header with the demo badge; Create version shows the busy state.
- **Settings:** page header; the form plus a note on the active port. Save shows the busy state.

## Components

- Added: `shell/PageHeader.tsx` (+ `StatusPill`), `shell/HelpSheet.tsx`, `shell/nav-icons.ts`,
  `shared/SectionTitle.tsx`, `providers/ActivePortProvider.tsx`, `lib/active-port.ts`,
  `predictions/PredictionProgress.tsx`, `predictions/PredictionsClient.tsx`,
  `shipments/ShipmentFormAside.tsx`, `app/(app)/predictions/page.tsx`.
- Reused: Card, Tabs, Sheet, Dialog, Button, Callout, PageState, InfoTip, ContainerArt, Money,
  DateTime, DemoBadge, StatusBadge, ExplanationChart and ExplanationTable (restyled: legend on
  top, dashed grid, rounded bars, slimmer label column on phones, table scrolls inside its card).
- Theme: new surfaces in `themes/portiq/theme.css` (summary strip, notes card, model note, port
  picker, nav badge, page icon) with plain fallbacks in `app/globals.css`. Existing palette tokens
  only.

## Not copied from the reference, and why

- **"42% vs. port average"**: the API returns no port-average comparison. The strip shows the
  estimated clearance date instead.
- **A 10th–90th percentile range**: the audit expected one, but the prediction response
  (`services/api/app/schemas/prediction.py`) has no interval field; the q10/q90 models are not
  served. Nothing is shown rather than an invented range.
- **Notification bell**: no notification data or backend.
- **"Trained from scratch on historical shipment data"**: the model note states the real model and
  dataset versions from provenance (the data is synthetic).
- **"Back to Predictions" in the header**: the top-bar back button and breadcrumbs already go to
  Predictions, and "Back to shipment" (an existing control and tested link) stays in the header.

## Feature-preservation checklist

| Pre-existing control or state | Where it lives now |
| --- | --- |
| Prediction: estimated dwell days | Summary strip, "Estimated dwell time" |
| Prediction: estimated clearance date | Summary strip under the dwell value; What it means |
| Prediction: "Estimate" badge | Pill beside the dwell value |
| Prediction: container art | Summary strip (≥1280 px; hidden under 400 px as before) |
| Cost lines, amounts, rule versions, unavailable reasons | Overview › Cost breakdown |
| Cost total, partial-total warning, cost note, disclaimer | Cost breakdown; total also in the summary strip |
| Capacity resource, utilization, threshold label, source, bucket, synthetic note, generated time, unavailable reason | Right panel › Prediction details |
| Explanation chart, base value, table, "not proof of cause" | Overview and Feature impact (Prediction analysis, Detailed feature breakdown; full table on Feature impact or via View all) |
| Explanation unavailable reason | Prediction analysis card (Overview and Feature impact) |
| Warnings (demo data, out-of-range, tariff missing, …) | Right panel › Important notes; also Key insights |
| Provenance: model, dataset, generated, source, tariff rules, demo badge | Right panel › Model and data |
| Disclaimer callout | Important notes and Cost breakdown |
| Back to shipment link | Result header actions |
| Prediction 404 / 403 / error + retry / loading | Unchanged `PageState` branches |
| Run prediction: one Idempotency-Key per click, double-click guard | Unchanged logic; button disabled with spinner |
| Run errors 429 / 503 / 409 / 404, request ID, Retry | Inline under the button, unchanged text |
| Navigate to the new result on success | Unchanged, after the progress modal shows complete |
| Shipment detail: status, demo badge, port, Plan this container, Edit, Record event sheet | Page header |
| Timeline, fields, latest prediction / no prediction, predicted vs actual, history, disclaimer | Unchanged order on the detail page |
| Shipments: filters, debounced search, clear, table, pagination, empty/error states | Unchanged under the new header |
| New / Edit shipment: every field, InfoTips, validation, API errors, request IDs, cancel | Unchanged form, left column |
| Dashboard: tiles, counts, latest dwell, cost, upcoming arrivals, milestone, capacity snapshot | Unchanged under the new header |
| Capacity: port, from/to, range validation, Yard/Berth tabs (arrow keys), chart, table, legend, skipped buckets, synthetic note | Unchanged; tabs restyled |
| Load planner: container picker, reset view, fit, auto arrange, views, matrix, inspector, cargo list, cargo add/edit/delete/split, live badge | Unchanged; header via `PageHeader` |
| Operator: date range, port scope, KPIs, yard/berth charts, dwell distribution, at-risk list, filtered shipment table | Unchanged under the new header |
| Tariffs: rules/audit tabs, new version form, filters, deactivate, audit table | Unchanged; tabs restyled |
| Settings: display name, validation, read-only role, signed-in email, notices | Unchanged form |
| Profile menu: Settings, Sign out; dev role switcher; skip link; sidebar collapse; mobile drawer | Top bar and sidebar |

## Tests

- Updated (text or structure changed, nothing deleted): `prediction-result.test.tsx`,
  `lib/navigation.test.ts`, `lib/auth/route-access.test.ts`, e2e `f01`, `f02`, `f05`,
  `a11y.spec.ts`, and live `importer-live.spec.ts` (new result-page selectors, `/predictions` in
  the screen sweep).
- Added: `predictions.test.tsx` (listing, empty rows, pagination, operator scope),
  `PredictionProgress.test.tsx` (timer stages, waits on the last stage, completion, live region),
  staged-progress dialog and new result tabs in `prediction-result.test.tsx`, nav active-state and
  breadcrumb tables in `navigation.test.ts`, `lib/active-port.test.ts` and
  `providers/active-port.test.tsx` (Capacity default and override, New shipment prefill).
- a11y: `/predictions` (importer and operator) and admin Capacity added to the axe sweep.
