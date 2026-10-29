# PortIQ UI · 07 Importer dashboard

> Read `00_READ_FIRST.md` and `PortIQ_API_Contract_v0.1.md` first. Build **only** this feature. Use the mock API. Do not change other features.

**Depends on:** 01 to 05 (06 recommended)
**Goal:** One landing page for importers summarising their shipments, latest estimates and upcoming arrivals.

## Endpoints
`GET /shipments`, `GET /shipments/{id}/predictions` (latest only), `GET /capacity/forecast`

## Page `/dashboard`
Cards, used sparingly (strong colours only for status):
- Active shipments (count, by status).
- Latest predicted dwell (with "Estimate" label) and the shipment it belongs to.
- Latest indicative cost with component breakdown and partial warning when needed.
- Upcoming expected arrivals (next 7 days) list.
- Latest milestone and date.
- Capacity snapshot (next arrival bucket) with synthetic label.
Actions: New shipment, open detail, rerun prediction.
- Every card has its own loading, empty and error state, so one failure does not blank the page.
- Do not show counts that include other users' data.

## Out of scope
Operator views.

## Done when (and how a human tests it)

- Mock a user with 5 shipments: all cards fill.
- Mock a new user with none: empty states with a "Create shipment" call to action.
- Mock capacity failing: only that card shows an error, the rest still render.
- A cost with an unavailable component shows the partial warning.
- Tests: per-card error isolation, empty states.

## Report back
Summary, files changed, commands run with results, assumptions, known gaps, human decisions needed.
