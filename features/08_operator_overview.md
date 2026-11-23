# PortIQ UI · 08 Operator overview and at-risk shipments

> Read `00_READ_FIRST.md` and `PortIQ_API_Contract_v0.1.md` first. Build **only** this feature. Use the mock API. Do not change other features.

**Depends on:** 01 to 04, 06
**Goal:** Port-scoped KPIs and a filterable shipment table for operators.

## Endpoints
`GET /operator/overview`, `GET /operator/shipments`

## Page `/operator`
- KPI row: shipments by actual status, expected yard utilization, expected berth utilization, at-risk count.
- Charts: yard and berth utilization by forecast bucket (reuse the chart component from feature 06), distribution of predicted dwell across the selected scope. Each has a table or text alternative.
- At-risk list: each row shows the **reason** returned by the API (threshold crossed in arrival window, predicted dwell above threshold, documentation incomplete). If no reason arrives, show "Reason unavailable", never invent one.
- Shipment table: filters for status, arrival window, predicted dwell threshold and warning type. Server-side pagination. Row opens the detail page.
- Date-range filter (max 31 days).
- A "Port scope" label shows which ports the operator is viewing. Never offer a port outside scope.
- Platform admin sees this page too.

## Out of scope
Recording events (feature 04).

## Done when (and how a human tests it)

- Mock operator with two ports: label shows both, data loads.
- Mock overview with 3 at-risk shipments: reasons visible.
- At-risk item without reason: "Reason unavailable".
- Filters change request params; pagination works.
- Mock 403 for an importer opening the page: permission page.
- Tests: reason display rules, filter params, role access.

## Report back
Summary, files changed, commands run with results, assumptions, known gaps, human decisions needed.
