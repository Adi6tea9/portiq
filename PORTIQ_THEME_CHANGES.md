# PortIQ theme — change report

Tracks the UI restyle that follows `PORTIQ_THEME_AGENT_GUIDE.md` and the reference image `portiq -- ui1.png`.
This is a **presentation-only** change: no API calls, data, routes, permissions, calculations, validation or tests were changed.

## Stage 1 — Dashboard preview (2026-11-22)

Status: **done, waiting for approval** before the rest of the app is restyled.

### How the theme works

- Every theme rule lives in `apps/web/themes/portiq/theme.css` and sits under `[data-theme="portiq"]`.
  Without that attribute the app looks exactly as before.
- The attribute is set on the app shell's root `<div>` (`AppShell.tsx`), so it covers every signed-in page.
  Login, signup and password pages sit outside the shell and are **not** changed yet.
- The theme retunes the app's existing colour tokens (`--canvas`, `--primary`, `--border`, …), so every
  component that already uses them picks up the new palette with no code change.
- Components expose small `app-*` class hooks (`app-sidebar`, `app-card`, `app-badge`, …) that the theme
  stylesheet targets. With the theme off, the hooks do nothing.
- Editable wording (tagline, decision-support copy, tile titles) is in `apps/web/themes/portiq/content.ts`.

### Files created

| File | Purpose |
|---|---|
| `apps/web/themes/portiq/theme.css` | Scoped tokens and styles: palette, sidebar gradient and photo slot, nav pill, cards, badges, dashboard tiles |
| `apps/web/themes/portiq/content.ts` | Editable theme copy |
| `PORTIQ_THEME_CHANGES.md` | This report |
| `../.claude/launch.json` (outside `portiq-main`) | Dev-server preview config (mock mode, port 3000) |

### Files modified

| File | Change |
|---|---|
| `apps/web/app/layout.tsx` | Imports `themes/portiq/theme.css` after `globals.css` |
| `apps/web/components/shell/AppShell.tsx` | `data-theme="portiq"` on the shell root; `app-*` hooks on sidebar, wordmark, nav links, collapse button and header; theme-only decision-support panel and user identity block at the bottom of the sidebar (reads the existing `me` and role, no new actions) |
| `apps/web/components/ui/card.tsx` | Added `app-card` hook class |
| `apps/web/components/ui/badge.tsx` | Added `app-badge` hook class |
| `apps/web/components/features/dashboard/DashboardClient.tsx` | Theme-only row of four feature tiles linking to existing routes; new subtitle copy |

### Visual changes

- **Palette:** warm off-white workspace (`#F5F5F1`), white cards, deep green primary (`#075847`), mint active state (`#A9D2C1`), dark near-black text.
- **Sidebar:** navy-to-teal gradient, sticky to the viewport, white labels, mint pill for the active route
  (driven by the real route, as before), decision-support panel and the signed-in user's name and role at the bottom.
  A photo slot exists (`--portiq-sidebar-photo` in `theme.css`) but is empty because the repo has no port image yet.
- **Header:** blends into the workspace with a light blur.
- **Cards:** 16px corners, soft border and shadow. **Badges:** pill-shaped.
- **Buttons:** primary buttons become deep green through the `--primary` token.
- **Dashboard tiles** (mint / amber / olive / lilac), each linking to an existing route:

  | Tile | Destination |
  |---|---|
  | Predict dwell time | `/shipments/new` (create a shipment, then predict) |
  | Estimate charges | `/shipments` (cost breakdown lives on each shipment's prediction) |
  | Forecast capacity | `/capacity` |
  | Explain prediction | The latest prediction page when one exists, otherwise `/shipments` |

  Two columns on phones, four on wide screens.

### Not changed in this stage (by design)

- Every existing dashboard card, its data, loading, empty and error states.
- Navigation labels and routes (`lib/navigation.ts` untouched); the header profile menu and sign-out.
- No new dependencies. Fonts: Inter only (Playfair Display is meant for the login heading, a later stage).

### Verification

- `npm run typecheck`: passes.
- `npx vitest run`: 21 files, 173 tests passed.
- Ran the app in mock mode (`NEXT_PUBLIC_USE_MOCKS=true`) and checked `/dashboard` at 1440×900 and 375×812.

### Stage 1b — Colour correction (2026-11-22)

Feedback: the first pass looked too dark and rich. Cause: it used the guide's suggested starting tokens instead of
the reference's real colours. Colours were re-sampled pixel by pixel from `portiq -- ui1.png` and the theme retuned.
Only `themes/portiq/theme.css` and one class name in `DashboardClient.tsx` (`app-tile-icon`) changed.

| Element | Before | Now (sampled from reference) |
|---|---|---|
| Sidebar | Navy-to-teal gradient `#172633` → `#10303A` → `#073A35` | Flat deep green `#0B2C29` → `#0A2926` |
| Active nav item | Light mint pill `#A9D2C1`, dark text | Mid-green pill `#34705F`, white text |
| Primary button / links | `#075847` | `#165343` |
| Workspace | `#F5F5F1` | `#F7F5F1` |
| Card border | `#DDE2DE` | `#E6E6E1` (lighter), softer shadow |
| Tiles mint / amber / olive / lilac | `#E1F1E9` / `#F9EBD7` / `#E9EEDC` / `#EEE7F5` | `#D2ECDF` / `#F9EBD7` / `#E4EAD9` / `#ECE4F3` |
| Tile icons | All teal | Green `#1E6B52`, orange `#B4651E`, olive `#3D7A2E`, purple `#5B3F8C` |
| Avatar / logo mark | `#A9D2C1` | `#BEE2D6` |
| Estimate chip / accent | `#E1F1E9` | `#D2E8D6` |

Verified by reading the computed colours in the running app; dashboard tests still pass (5/5).

## Stage 2 — Rest of the app (2026-11-22)

Status: **done, waiting for review.**

### What changed

- **Theme moved to the document root.** `data-theme="portiq"` now sits on `<html>` (`app/layout.tsx`) instead of the
  app shell, so the theme also reaches the sign-in screens, dropdown menus and the mobile drawer (those render
  outside the shell). Removing that one attribute still restores the default look everywhere.
- **Charts** (capacity, operator, prediction explanation): hardcoded hex colours replaced by the app's own colour
  tokens, e.g. `rgb(var(--success))`. Each old hex value equalled the default token exactly, so the default look is
  unchanged; under the theme the charts pick up the PortIQ palette. The explanation chart uses `--chart-increase`
  (pink `#E06C88`) and `--chart-decrease` (green `#4E9F52`) as in the reference, with the old amber/green as fallbacks.
- **Tables** (shipments list, shipment detail, capacity, operator, explanation, every `DataTable`): white rounded
  panel, quiet sentence-case header instead of uppercase, soft row hover. Hooks: `app-table` (panel) and
  `app-table-grid` (on the `<table>`).
- **Stat tiles:** estimate values (predicted dwell, utilization estimates) get the mint highlight from the reference.
- **Mobile drawer:** same deep-green look as the sidebar, white labels, mid-green active pill.
- **Sign-in, sign-up, forgot and reset password:** split layout on wide screens with a deep-green brand panel
  (logo, tagline, "Smarter Container Planning" heading); the form card heading uses Playfair Display.
  Below 1024px the layout stays single-column as before. The forms themselves are untouched (no role tabs,
  remember-me or Google button were added; the app doesn't have those features).

### Files modified in this stage

| File | Change |
|---|---|
| `apps/web/app/layout.tsx` | `data-theme="portiq"` on `<html>`; loads Playfair Display (600) as `--font-display` |
| `apps/web/app/(auth)/layout.tsx` | Theme-only brand panel, hook classes for the split layout |
| `apps/web/components/shell/AppShell.tsx` | Theme attribute removed from the shell root; `app-drawer` hooks on the mobile drawer |
| `apps/web/components/features/auth/AuthCard.tsx` | `app-card`, `app-display`, `app-wordmark` hooks |
| `apps/web/components/shared/DataTable.tsx` | `app-table`, `app-table-grid` hooks |
| `apps/web/components/shared/Stat.tsx` | `app-stat`, `app-stat--estimate` hooks |
| `apps/web/components/features/shipments/ShipmentsList.tsx` | Table hooks |
| `apps/web/components/features/shipments/ShipmentDetailClient.tsx` | Table hook |
| `apps/web/components/features/capacity/CapacityChart.tsx` | Chart and legend colours to tokens |
| `apps/web/components/features/capacity/CapacityTable.tsx` | Table hook |
| `apps/web/components/features/operator/OperatorClient.tsx` | Chart colours to tokens, table hooks |
| `apps/web/components/features/predictions/ExplanationChart.tsx` | Bar and legend colours to tokens |
| `apps/web/components/features/predictions/ExplanationTable.tsx` | Table hook |
| `apps/web/themes/portiq/theme.css` | Stage 2 rules: chart tokens, drawer, tables, stats, display font, auth split layout |
| `apps/web/themes/portiq/content.ts` | Auth panel heading and body copy |

### Verification

- `npm run typecheck`: passes. `npm run lint`: no warnings or errors.
- `npx vitest run`: 21 files, 173 tests passed. (One run had a timeout in `shipments.test.tsx` while the whole
  suite was under load; it passed alone and on the next full run. That file was not touched.)
- Checked in the browser (mock mode, 1440×900): dashboard, shipments list, shipment detail, prediction result with
  explanation chart, capacity, new shipment, settings, operator overview (port operator role), tariffs (platform admin
  role), sign-up, role-switcher dropdown, and the mobile drawer at 375×812. Demo role switched back to importer.

## Stage 3 — Photo sign-in screen (2026-11-22)

Matches the reference login composition, using the port photo you supplied.

- **Photo:** `apps/web/public/themes/portiq/port-login.webp` (1672×941, 227 KB), set as `--portiq-auth-photo` in
  `theme.css`. To swap it, replace the file or change that variable.
- **Layout (wide screens):** the photo fills the whole page, with a deep-green wash on the left fading to clear on the
  right. Left: larger logo, "PREDICT. PLAN. SHIP." tagline, "Smarter Container Planning" in Playfair Display, the
  supporting line and a short green accent bar. Right: frosted white card (22px corners, soft shadow).
- **Phones:** photo behind everything with an even dark wash, white logo at the top, card centred.
- **Card:** heading now "Welcome to PortIQ", subtitle "Sign in to your account"; mail and lock icons inside the inputs
  (drawn by CSS, theme-only); "Forgot password?" moved to the right.
- **Show/hide password:** a working eye button on the password field (`aria-label`, `aria-pressed`,
  `aria-controls`). Display-only: it switches the input between `password` and `text`; sign-in logic is unchanged.
- Sign-up, forgot-password and reset-password share the same photo layout.

Not copied from the reference, because the app has no such feature (adding them would change behaviour, not just
looks): the Importer / Port Operator tabs (role comes from the account), "Remember me", and "Continue with Google".

| File | Change |
|---|---|
| `apps/web/public/themes/portiq/port-login.webp` | New: sign-in photo |
| `apps/web/themes/portiq/theme.css` | Sign-in section rewritten: photo background, wash, frosted card, input icons |
| `apps/web/app/(auth)/layout.tsx` | Brand panel markup (bigger heading, accent bar) |
| `apps/web/app/(auth)/login/page.tsx` | Heading and subtitle copy |
| `apps/web/components/features/auth/LoginForm.tsx` | Input icon hooks, show/hide password button, forgot link alignment |
| `apps/web/tests/e2e/f02.spec.ts`, `tests/e2e/a11y.spec.ts` | Login heading assertions updated to "Welcome to PortIQ" |

Verification: typecheck and lint clean; 173/173 unit tests pass; checked `/login` at 1440×900 and 375×812; the
password toggle flips the input type both ways. Playwright e2e (including the axe contrast check) not run.

## Stage 4 — Account-type toggle and sidebar photo (2026-11-22)

**Sidebar photo:** the same port photo now sits behind the lower part of the sidebar, under a deep-green wash
(`--portiq-sidebar-photo` in `theme.css`; set it to `none` for a plain sidebar). Text on the bottom panel stays readable.

**Importer / Exporter | Port Operator toggle** (as in the reference), on sign-in and create-account.
This is the one behaviour change in the whole theme work, agreed as "option 1":

- **Sign-in:** the person picks a tab, then signs in as normal. After sign-in the app reads the account's real role
  from `/me`. If it matches the tab, they go to their usual home page. If not, they are signed straight back out and
  see e.g. "This is an Importer / Exporter account. Switch to Importer / Exporter to sign in."
  The toggle never grants or changes a role. Platform admins sign in on the Port Operator side.
- **Create account:** the Importer / Exporter tab shows the normal form. The Port Operator tab replaces the form
  with: "Port operator accounts are set up by your port administrator. If you already have one, sign in with the
  Port Operator option." plus the sign-in link. Self-registration stays importer-only, exactly as before.
- Built as native radio buttons inside a `fieldset` (keyboard: one tab stop, arrow keys switch), styled as the
  reference's segmented control.

| File | Change |
|---|---|
| `apps/web/lib/auth/account-type.ts` | New: tab labels, role-to-tab mapping, mismatch message |
| `apps/web/lib/auth/account-type.test.ts` | New: unit tests for the mapping and messages |
| `apps/web/components/features/auth/AccountTypeToggle.tsx` | New: the segmented toggle |
| `apps/web/components/features/auth/LoginForm.tsx` | Toggle; role check after `/me`, sign out on mismatch |
| `apps/web/components/features/auth/SignupForm.tsx` | Toggle; operator note instead of the form |
| `apps/web/components/features/auth/auth-forms.test.tsx` | New tests: mismatch signs out; operator sign-up note |
| `apps/web/themes/portiq/theme.css` | Sidebar photo and wash |
| `apps/web/tests/e2e/f10.spec.ts` | Keyboard flow counts the toggle and show-password tab stops; new heading; exact `Password` label |

Verification: typecheck and lint clean; 22 test files, 177 tests pass (4 new). In the browser: Port Operator tab
with the importer demo account shows the mismatch message and stays signed out; Importer tab signs in to the
dashboard; sign-up Port Operator tab shows the note with no form; sidebar photo checked at 1440×900.
Playwright e2e not run (browsers not installed here).

## Stage 5 — Bolder sign-in headings, colour-order fix (2026-11-22)

- **Headings:** "Welcome to PortIQ" and "Smarter Container Planning" now use Playfair Display **700** (was 600),
  closer to the reference. `app/layout.tsx` loads weight 700 only; `.app-display` sets `font-weight: 700`.
- **Fix:** while checking, the sign-in button briefly showed the old navy instead of green. Cause: the theme's colour
  block and `globals.css`'s `:root` had equal specificity, so whichever stylesheet loaded last won. The three theme
  token blocks in `theme.css` now use `:root[data-theme="portiq"]`, which always wins. No colour values changed.
- Verified in the browser: both headings at weight 700 with the Playfair file loaded; Sign in button `#165343`.

## Stage 6 — Playwright e2e run and fixes (2026-11-22)

Ran the full Playwright suite on the locally installed Google Chrome (no browser download), against the mock
dev server. First run: 66 passed, 5 failed, 12 not run (serial groups behind failures). All 5 failures were caused by
the theme work and are fixed:

| Failure | Cause | Fix |
|---|---|---|
| Dashboard, sandbox, auth/protected pages accessibility (axe colour contrast) | Grey label text on the mint estimate tiles measured 4.09:1; theme red `#C94D5A` on the page background 4.1:1 (need 4.5:1) | Inside `.app-stat--estimate` the secondary text token is darkened to `#4D5954`; theme `--danger` / `--destructive` darkened to `#B23A48` (`theme.css`) |
| `f02` sign in and sign out | The user's name now also appears in the sidebar, so `getByText("Demo Importer")` matched two elements | Test now looks inside the profile menu: `getByRole("menu").getByText(...)` |
| `f10` importer end-to-end flow | The password label's text is "Password*" (required marker), so the exact match added in stage 4 found nothing | Test uses `getByLabel(/^Password/)`, as the other specs do |

Second run: **83 passed, 0 failed** (3.8 min, 2 workers).

To re-run: `npx playwright test --config playwright.local-chrome.config.ts` from `apps/web`. That config file
(added in this stage) only switches the browser to the installed Chrome; everything else comes from
`playwright.config.ts`. With Playwright's own browsers installed (`npx playwright install chromium`), the normal
`npm run test:e2e` works too.

### Known gaps / next steps

- Default/PortIQ switch in Settings (the theme is always on; marked with a `shortcut:` comment in `app/layout.tsx`).
- Capacity charts stay line charts; the reference's filled area under the line was not added (it would change the
  chart component, not just its colours).
- Not checked: Playwright e2e tests, the theme switched off in a browser, edit-shipment and
  forgot/reset-password screens individually (they share the restyled components).

### Production build (2026-11-22)

`NEXT_PUBLIC_USE_MOCKS=true npm run build` passes: compiled successfully, lint and type checks run by Next.js
pass, all 16 routes generated. Largest first load: `/operator` at 309 kB. No pre-theme build was recorded,
so bundle size has no baseline to compare against.

## Stage 7 — Load planner tab with the 3D container (2026-11-22)

A new **Load planner** sidebar tab (after Capacity) for **importers and port operators**. It shows the container
from `containers/container_v3` in 3D with its cargo, laid out like the reference image: a container picker and
cargo list on the left, the 3D view in the centre with a tool bar, a camera strip with six angles, and the
utilization numbers. Full technical notes: `docs/load-planner-integration.md`.

### What it does

- **20 ft / 40 ft** picker. Internal dimensions come from the model README (5.90 / 12.03 × 2.35 × 2.39 m).
- **Cargo list:** Boxes, Crate, Pallet, Drum (sample cargo, 60 parcels, labelled "Sample cargo"). Opening a line
  shows each parcel as a button that selects it.
- **3D view:** the real container models with doors open, cargo as boxes and drums, click to select (green edge,
  outline and ID tag), drag to rotate, pan mode, zoom buttons, and a cutaway that hides the near wall and the roof.
- **Camera strip:** Perspective, Side, Front (doors), Rear, Top, Interior (POV). The camera glides to each view and
  frames the whole container for the current screen shape. Side, Rear and Top hide the wall in the way.
- **Reset view**, **Fit to container**, **Auto arrange** (re-packs largest and heaviest first). The packing rule is
  a simple heuristic and the page says so.
- **Container utilization:** a volume ring plus used / total / remaining m³, weight, payload and payload remaining.
  A green "fits" line, or warnings for overlaps, parcels outside the walls, payload over the limit, bad dimensions
  or cargo that did not fit.
- **Selected parcel** panel and a **floor utilization matrix** (20 cm grid, four height layers). The 3D view, cargo
  list and matrix share one selection, and selecting a parcel jumps the matrix to its layer.

### Performance and every-screen work

- Models compressed from 7.9 / 8.5 MB to **1.26 / 1.41 MB** (WebP textures, smaller texture sizes, meshopt
  geometry). GPU texture memory drops from about 240 MB to about 105 MB (counted from the texture sizes).
- three.js only downloads on this tab, as lazy chunks of about 230 KB gzipped. The tab's own first load is
  106 kB, and no other page grew.
- The canvas renders on demand, so an idle tab costs nothing. Pixel ratio is capped and drops while moving. No
  live shadows.
- While the model loads, the PortIQ container picture shows with a progress line. If WebGL fails, a message
  appears and the rest of the page still works.
- On phones the 3D view comes first and the cards follow, with no sideways scroll at 375 px. Open doors stay in
  frame in portrait.
- The mouse wheel scrolls the page instead of being trapped by the 3D view. Ctrl/⌘ + scroll or a pinch zooms. A
  hint on the view says so.

### Background picture (`portiq_bg.svg`)

The SVG trace had stray dark specks around the container and blurry lettering. I kept only the container shape:
the SVG gives the outline mask and `portiq_bg.png` gives the sharp pixels. The result is a transparent **52 KB WebP**,
`public/themes/portiq/portiq-container.webp`. It is used as:

- decoration on the **Prediction result** card (beside "Estimated dwell time"),
- decoration in the dashboard's mint **Latest predicted dwell** tile,
- the loading picture for the 3D view.

It is decorative only (hidden from screen readers), theme-only, and hidden below 400 px wide.

### Files

Created:
- `lib/load-planner/{types,config,calculations,packing,views}.ts` and `load-planner.test.ts` (14 tests)
- `components/features/load-planner/`: `LoadPlannerClient`, `ContainerViewport`, `ContainerScene`, `ParcelMeshes`,
  `CargoList`, `LoadSummaryPanels`, `UtilizationMatrix`, `ViewStrip`
- `components/shared/ContainerArt.tsx`
- `app/(app)/load-planner/page.tsx`
- `public/models/container-20ft.glb`, `container-40ft.glb`
- `public/themes/portiq/portiq-container.webp`
- `docs/load-planner-integration.md`

Modified:
- `lib/navigation.ts` (tab for importer and operator), `lib/auth/route-access.ts` (`/load-planner` for both roles),
  `components/shell/AppShell.tsx` (Container icon)
- `lib/navigation.test.ts`, `lib/auth/route-access.test.ts`, `tests/e2e/a11y.spec.ts` (axe check of the new page
  for both roles)
- `components/features/predictions/PredictionResultClient.tsx`, `components/features/dashboard/DashboardClient.tsx`
  (container picture)
- `themes/portiq/theme.css` (`.app-container-art`, `.app-planner-stage` studio backdrop)
- `package.json`: added `three@0.170.0`, `@react-three/fiber@8.18.0`, `@react-three/drei@9.122.0`,
  `@types/three@0.170.0`

### Decisions worth knowing

- **Camera side:** the reference shows the doors on the right. In the models, though, the side lettering reads
  correctly only from the other side; from the reference's side "PortIQ" comes out mirrored. All views therefore
  look from the readable side, which puts the doors on the left.
- The spec's own palette was not applied. The page uses the existing PortIQ theme tokens, so it matches the rest of
  the app. Cargo colours follow the reference (kraft boxes, timber crates, wrapped pallets, blue drums).
- The reference's three small live side previews were not added: each would be another 3D canvas, which works
  against the performance goal. The camera strip covers the same views.

### Verification

- Type check (`tsc --noEmit`): 0 errors. Lint: clean.
- Vitest: 23 files, 191 tests, all passing. In the full parallel run one older `auth-forms` test timed out once
  (a 1-second wait under load); it passes when rerun alone. That test is unrelated to this stage.
- Playwright on local Chrome: **85 passed, 0 failed** (3.8 min). That includes the two new axe checks of
  `/load-planner` (importer and operator).
- Production build passes, with 17 routes. `/load-planner` first load: 106 kB.
- Checked by hand in the browser at 1440, 820 and 375 px:
  - both container sizes
  - all six camera views
  - cutaway
  - zoom buttons
  - click-to-select in 3D, with the inspector and matrix syncing
  - Auto arrange
  - page scrolling over the 3D view
  - the container picture on the dashboard and on the prediction result
- Not checked: a real phone or tablet (only browser emulation), touch gestures on the 3D view, and slow networks.
