# UI/UX overhaul: audit (24 Nov 2026)

Visual direction: `reference image.png` (Prediction Results) in the project folder.

## Stack (unchanged)

- Next.js 14 App Router (`apps/web/app`), React 18, TypeScript, Tailwind with theme tokens in
  `app/globals.css` (forest green, sage, ivory).
- UI primitives in `components/ui` (button, card, badge, tabs, dialog, sheet, dropdown, skeleton),
  shared pieces in `components/shared` (Field, PageState, Callout, Stat, Money, DateTime, InfoTip,
  ContainerArt).
- Data: TanStack Query hooks in `lib/api/hooks`, `apiClient` with a Supabase bearer token, and MSW
  mocks in mock mode. No new dependencies are needed.

## Run Prediction, traced

1. `RunPredictionButton` (shipment detail) creates an Idempotency-Key and calls `runPrediction`,
   which sends `POST /shipments/{id}/prediction`.
2. The API checks access, loads features, scores the v2 model with SHAP, the cost engine and the
   capacity snapshot, then stores an immutable `prediction_runs` row (201, or 200 on replay).
3. On success the button calls `router.push(/shipments/{id}/prediction/{predictionId})`.
4. `PredictionResultClient` fetches `GET /shipments/{id}/predictions/{pid}` and renders the
   estimate, the 10th–90th percentile range, the cost breakdown, capacity, the explanation (chart and
   table), the warnings and the provenance.

**Gap.** While the request runs, the button only changes its text, with no progress, steps or
expected time. The errors 429, 503 and 409 have states, but there is no success confirmation.

## Navigation problems found

- The navigation is per role (`lib/navigation.ts`), and it highlights by path prefix. Pages without
  their own entry highlight nothing, and the header title falls back to "PortIQ":
  - **Operator or admin on `/shipments/{id}`**, reached from the operator table: they have no
    Shipments entry.
  - **Admin on `/capacity` and `/load-planner`**: admins can use them, but they are missing from the
    admin navigation.
  - **`/settings`**: only reachable from the profile menu, and never shown as active.
- **Prediction results** live under `/shipments/...`, and the app has no "Predictions" section. The
  reference adds one, with an AI badge.
- **Breadcrumbs**: there are none. Deep pages (prediction, edit, Load planner for a shipment) give no
  way back except the browser.

## Layout problems found

- **Page width differs on every page:** prediction `max-w-4xl`, capacity `max-w-5xl`, operator and
  tariffs `max-w-6xl`, settings `max-w-xl`, shipment forms `mx-auto max-w-3xl` (centred), and the
  dashboard, shipments and Load planner full width. This leaves large empty areas on wide screens and
  makes the left edges jump between pages.
- **Page headers** (title, subtitle, actions) are written by hand on each page, with different sizes
  and spacing.
- The prediction result is a single column of stacked cards. The reference uses a summary strip, tabs
  and a two-column layout with a side panel.

## Plan

1. **Shell:**
   - one `PageContainer` width and one `PageHeader` (icon, title, status badge, subtitle, actions)
   - breadcrumbs with a back button in the top bar
   - sidebar matching the reference: a Predictions entry with an AI badge, an active-port picker, and
     the user card at the bottom
   - a help button opening a "What each page does" guide
2. **Navigation:**
   - a "Predictions" route that lists every run the user can see, built from the shipments' latest
     predictions with no new API
   - the missing entries for operator, admin and Settings
   - active state for nested routes such as `/shipments/{id}` (operator) and `/shipments/.../prediction`
     (Predictions)
3. **Prediction Results**, matching the reference:
   - summary strip: container art, dwell estimate with its range, total cost, success state
   - tabs: Overview, Feature impact, What it means, Key insights
   - analysis chart and feature breakdown table
   - details panel, model note and important notes (warnings)

   Every existing field stays. "42% vs port average" is not shown, because the API returns no such
   comparison; the real 10th–90th percentile range is shown instead.
4. **Run Prediction:** a staged progress panel (checking inputs, scoring the model, calculating costs,
   saving), a success state, and the existing error states.
5. **The same design language on every page:** Dashboard, Shipments, shipment detail and forms,
   Capacity, Load planner, Operator, Tariffs and Settings, with every page keeping all its controls.
6. **Responsive:** desktop, tablet (768) and mobile (390) with no sideways scroll; the sidebar
   becomes a drawer on mobile.

**Not built,** because there is no data or backend for it:
- a notification bell
- a percentage comparison against the port average
