# PortIQ UI · 03 Create shipment and shipment list

> Read `00_READ_FIRST.md` and `PortIQ_API_Contract_v0.1.md` first. Build **only** this feature. Use the mock API. Do not change other features.

**Depends on:** 01, 02
**Goal:** An importer can create a shipment and find it in a paginated, filterable list.

## Endpoints
`POST /shipments`, `GET /shipments`

## New shipment `/shipments/new`
Fields, each with persistent label and unit hint:
port, reference, direction, cargo type, container size (20 / 40 ft), HS code (6 digits, string), weight (kg), declared value, currency (INR), shipping line, vessel size band, expected arrival (date-time, shown in port timezone, sent as UTC), documentation status.
- Zod: weight > 0, declared value >= 0, HS code `^\d{6}$`, required fields, enum values from `types.ts`.
- Server `422` `details[]` map to fields by `field` name. Typed input survives an error.
- Disable submit while saving. On success go to `/shipments/[id]`.
- Never send `owner_user_id`, `status` or role.

## Shipment list `/shipments`
- Server-side pagination (`page`, `page_size`, max 100), filters: status, expected arrival range, reference search.
- Columns: reference, cargo type, status badge, expected arrival, latest predicted dwell (shown as "Not predicted yet" when none).
- Empty state with "Create shipment" button. Error state with request ID.

## Out of scope
Detail page, editing, predictions.

## Done when (and how a human tests it)

- Mock: submit a valid form and land on the detail placeholder.
- Submit weight 0 and HS code "85044": field errors appear next to the fields, input is kept.
- Mock a 422 from the server for `weight_kg`: error shows under the weight field.
- List with 12 mock rows paginates at page size 5; filters change the request params.
- Empty list shows the empty state. 503 shows the error state with retry.
- Tests: Zod rules, 422 mapping, double-submit prevention, pagination params.

## Report back
Summary, files changed, commands run with results, assumptions, known gaps, human decisions needed.
