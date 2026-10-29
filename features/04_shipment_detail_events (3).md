# PortIQ UI · 06 Capacity forecast

> Read `00_READ_FIRST.md` and `PortIQ_API_Contract_v0.1.md` first. Build **only** this feature. Use the mock API. Do not change other features.

**Depends on:** 01, 02
**Goal:** A date-range view of yard and berth utilization that never invents readings.

## Endpoint
`GET /capacity/forecast?port_id=&resource_type=&from=&to=&page=&page_size=`

## Page `/capacity`
- Controls: port, date-range picker (max 31 days, enforced in the UI too), Yard / Berth tabs. Daily buckets.
- Chart: utilization percent over time. Axis 0 to 100, titled, units, date range shown. Stable colour per resource.
- Table alternative with bucket start, occupied, capacity, utilization, source, version.
- Threshold legend: lower, moderate, high, from config (default 60 and 85, placeholder), shown as text as well as colour.
- Labels: "Forecast generated at <time>" and "Forecast based on synthetic demo data".
- Empty list: an explicit empty state, never a flat 0% line.
- Invalid buckets from the API (capacity <= 0, utilization out of 0 to 100) are skipped, with a note "N buckets could not be shown".
- Loading, error, permission states. Importers and operators both can open it.

## Out of scope
Operator KPIs, shipment-level capacity card (feature 05).

## Done when (and how a human tests it)

- Mock 30 days of yard data: chart and table match.
- Switch to Berth: data and colour change.
- Range over 31 days is blocked with a message.
- Mock empty list: empty state, no chart line.
- Mock a bucket with capacity 0: skipped with the note.
- Legend shows text labels for each threshold.
- Tests: range cap, empty state, invalid bucket handling, tab switch request params.

## Report back
Summary, files changed, commands run with results, assumptions, known gaps, human decisions needed.
