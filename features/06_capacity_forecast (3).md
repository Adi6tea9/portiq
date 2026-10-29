# PortIQ UI · 10 Settings, landing page, accessibility and E2E

> Read `00_READ_FIRST.md` and `PortIQ_API_Contract_v0.1.md` first. Build **only** this feature. Use the mock API. Do not change other features.

**Depends on:** 01 to 09
**Goal:** Finish the public surface, settings, an accessibility pass and the end-to-end tests.

## Scope
1. **Landing `/`:** tagline "Predict. Plan. Ship.", three-step how-it-works, an honest limitations statement (no live terminal integration, estimates not guarantees, synthetic demo data), sign-in and sign-up buttons. No protected data. Works on mobile.
2. **Settings `/settings`:** display name editable, role shown read-only, no role editing.
3. **Accessibility pass** on all pages: visible focus, keyboard-only use of core flows, contrast checked against the palette, reduced-motion respected, labels on all inputs, chart summaries, status never by colour alone. Target WCAG 2.2 AA. Check desktop, tablet and mobile widths.
4. **Copy pass:** search the codebase for "guaranteed", "real-time", "live" and "final" and fix any use that is not factually true.
5. **E2E (Playwright, mock mode):** importer creates a shipment, runs a prediction, sees the result; operator sees scoped data only; importer cannot open `/admin/tariffs`; admin creates a tariff version.
6. README update: run, test, build commands, env vars, known limitations.

## Done when (and how a human tests it)

- Keyboard-only: sign in, create a shipment, run a prediction, with visible focus all the way.
- Automated axe check has no serious violations on each page.
- The copy search finds no unjustified claims.
- All E2E tests pass from a clean clone.
- Lint, type-check, tests and build pass.

## Report back
Summary, files changed, commands run with results, assumptions, known gaps, human decisions needed.
