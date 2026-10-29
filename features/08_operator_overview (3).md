# PortIQ UI · 05 Run prediction and prediction result page

> Read `00_READ_FIRST.md` and `PortIQ_API_Contract_v0.1.md` first. Build **only** this feature. Use the mock API. Do not change other features.

**Depends on:** 01 to 04
**Goal:** Run a prediction and show every part of the result honestly, including every unavailable state. This is the highest-risk screen.

## Endpoints
`POST /shipments/{id}/prediction` (header `Idempotency-Key`), `GET /shipments/{id}/predictions`

## Run prediction
- Button on the detail page (enable it now). Generates a new UUID per click, sends it as `Idempotency-Key`, and reuses the same key only when automatically retrying that same click.
- Disable while running. Show progress state. Handle `429`, `503 MODEL_UNAVAILABLE`, `409 IDEMPOTENCY_CONFLICT`, `404`, `401`.
- On success go to `/shipments/[id]/prediction/[predictionId]`. A rerun creates a new history row and never overwrites earlier ones.

## Result page `/shipments/[id]/prediction/[predictionId]`
Top to bottom:
1. **Headline card:** "Estimated dwell time: 6.2 days", "Estimated clearance: 8 Nov 2026, 16:18 IST". Labelled Estimate.
2. **Cost card:** table of components (amount, status, rule version, `reason` when unavailable), total row. Unavailable components show "Unavailable" and the reason, never 0. If `total_is_partial`, show "Indicative total, some components could not be calculated." Show the cost note and disclaimer.
3. **Capacity card:** resource, utilization percent with text threshold label, source type, bucket dates. `status: "unavailable"` shows the reason and no number.
4. **"What influenced this" card:** horizontal diverging bar chart of signed `contribution` in days, with feature name and value, plus base value. Each bar has a plain-language sentence ("Documentation status decreased the model estimate by 0.6 days"). Add "These are model effects, not proof of cause." `explanation.status: "unavailable"` shows the reason and **no chart, no placeholder bars**. Provide a table alternative for the chart.
5. **Warnings:** each `warning.message` in a callout.
6. **Provenance footer:** model version, dataset version, tariff rule versions, generated at, "Synthetic demo data" badge when `is_demo_data`.
7. **Disclaimer** with the exact text from `00_READ_FIRST.md` section 7.
- Never compute anything: no sums, no clearance date, no percentages in TypeScript.

## Out of scope
Capacity page, dashboard.

## Done when (and how a human tests it)

- Mock full prediction: all 7 blocks render, bars have labels and units.
- Mock partial prediction (demurrage unavailable): "Unavailable" with reason, partial total warning, no "0.00" anywhere on the page.
- Mock explanation unavailable: no chart at all, reason shown.
- Mock capacity unavailable: no number, reason shown.
- Mock 503 on run: error with retry. Mock 429: rate-limit message.
- Double-click Run: only one request goes out. Retry reuses the same key; a new click uses a new key.
- Tests: one per state above, plus a check that the text "0.00" never renders for an unavailable line.

## Report back
Summary, files changed, commands run with results, assumptions, known gaps, human decisions needed.
