# PortIQ UI · 04 Shipment detail, timeline, edit, events

> No separate prompt file was supplied for this feature; this is its section from
> `PortIQ_Frontend_Master_Spec_v1.md` (§10, F04), copied here so every feature has a file.
> Read `00_READ_FIRST.md` first.

**Depends on:** 03
**Endpoints:** `GET /shipments/{id}`, `PATCH /shipments/{id}`, `POST /shipments/{id}/events`, `GET /shipments/{id}/predictions`

## Build
- Header: reference, actual-status badge, port.
- Timeline from `events`: status, occurred time, recorded time when different, who, note.
- Fields panel with units.
- Latest prediction card (links to the result) or "No prediction yet" with the Run button rendered
  **disabled** ("Available after F05").
- Prediction history table.
- **Edit** (owner, only before `arrived`, only `ShipmentPatch` fields).
- **Record event** (scoped operator): only the next allowed status; `409` shows the STATE_CONFLICT
  message.
- For `cleared` with `actual_dwell_days`: **Predicted vs actual** side by side, with different
  styling and labels ("Estimate" / "Recorded").
- Not-found state for unknown or unauthorized ids.

## Tests
Allowed-transition options, edit hidden after arrived, estimate vs recorded labels, 409 handling.

## Human check
Importer sees Edit and no Record event; operator sees "Arrived" only; a cleared shipment shows
both values clearly distinct.
