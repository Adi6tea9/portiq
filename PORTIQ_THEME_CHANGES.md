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

## UI/UX overhaul — Phase 2: design tokens (2026-11-24)

Status: **done, waiting for Phase 3.** Presentation only; no data, API, route or ML logic touched.

### Tokens (CSS variables in `apps/web/app/globals.css`, Tailwind names in `tailwind.config.ts`)

| Token | Value | Tailwind |
|---|---|---|
| `--sidebar-width` / `--sidebar-width-collapsed` | 240px / 72px | `w-sidebar`, `w-sidebar-collapsed` |
| `--header-height` | 64px | `h-header` |
| `--content-max` | 1600px (was 1280px) | `max-w-content` |
| `--page-gutter` | 16 / 24 / 32px (mobile / md / lg) | `px-gutter` |
| `--page-gutter-y` | 24 / 32px | `py-gutter-y` |
| `--section-gap` | 24px | `gap-section`, `space-y-section` |
| `--card-padding` | 20 / 24px | `p-card` |
| `--radius-card`, `--shadow-card` | 12px + Tailwind shadow; theme: 16px + soft shadow | `rounded-card`, `shadow-card` |
| `--control-height` / `-sm` | 40px / 36px | `h-control`, `h-control-sm`, `size-control` |
| `--table-row-height` | 48px (minimum, on every `.app-table-grid` row) | `h-row` |
| `--icon-sm/md/lg` | 16 / 20 / 24px | `size-icon-sm` … |
| `--text-page-title` / `--text-section-title` | 24→28px / 16px | `text-page-title`, `text-section-title` |

### Applied to shared components

- `ui/button.tsx`, `ui/input.tsx`, `shipments/SelectControl.tsx`, `ui/tabs.tsx`, Capacity date select and toggle:
  one control height (inputs and selects were 36px beside 40px buttons), one radius.
- `ui/card.tsx`: `rounded-card shadow-card p-card`; theme `.app-card` and `.app-table` now read the same tokens
  (tables were 14px vs cards 16px).
- `shell/AppShell.tsx`: sidebar, header, gutters and content width from tokens.
- `shell/PageHeader.tsx`, `shared/SectionTitle.tsx`: type-scale tokens.

### Verification

- `npm run typecheck` passes; `npm run lint` clean; `npx vitest run` 30 files, 250 tests passed.
- Browser (mock mode): `/shipments` at 1024px (controls 40px, header 64px, sidebar 240px, cards/tables 16px radius)
  and 375px (16px gutter, 24px title, no horizontal overflow, no console errors).

## UI/UX overhaul — Phase 3: navigation and responsive shell (2026-11-24)

Status: **done, waiting for Phase 4.** No API, data or ML logic touched.

### Routes

| Route | Change |
|---|---|
| `/predictions/[shipmentId]/[predictionId]` | **New** home of Prediction Results. URL, sidebar (Predictions), breadcrumb (Predictions → Results) and back button now agree. |
| `/shipments/[id]/prediction/[predictionId]` | Now only redirects to the new route, keeping query params (old bookmarks keep working). |
| `/predictions` (middleware) | Added to `PROTECTED_PREFIXES`; it was missing, so live mode didn't server-check sign-in there. |

All result links go through one helper, `predictionResultHref()` in `lib/navigation.ts`
(dashboard, predictions list, shipment detail, Run prediction button).

### Navigation

- Sidebar order: Dashboard, Shipments, Capacity, Load planner, Predictions, Settings (operators: Operator overview,
  Capacity, Load planner, Predictions, Settings). Predictions badge is **ML** (was AI); the results and predictions page pills too.
- Results page: **Back to Predictions** (→ `/predictions`); the shipment reference in the subtitle links back to the shipment.
- Top-bar back arrow on results goes to Predictions.

### Responsive shell

- 768–1023px: sidebar starts as the 72px icon rail (toggle still expands it); ≥1024px full; <768px drawer.
- Mobile drawer now closes on any route change, including browser back/forward.

### Verification

- typecheck passes, lint clean, `npx vitest run` 30 files / 251 tests passed (one auth test timed out once under
  load, passed alone and on the full rerun; auth untouched). Unit and e2e specs updated for the new route and nav.
- Browser (isolated mock server, see below): every sidebar link → correct page, active item, breadcrumb, heading;
  old results URL redirects with query kept; Run prediction from a shipment lands on `/predictions/…` with
  Predictions active; tablet rail 72px ↔ 240px; mobile drawer navigates and closes; no horizontal overflow at 768/375.
- Playwright e2e **not run**.

### Dev note

A second `next dev` in this folder shares `.next` and corrupts both servers. `.claude/launch.json` now has
`portiq-web-mock-isolated` (port 3002, `NEXT_DIST_DIR=.next-preview`).

## UI/UX overhaul — Phase 4: prediction workflow (2026-11-24)

Status: **done, waiting for Phase 5.** No API contract, model, feature calculation or data changed.

### Run → processing → result

- **New route** `/predictions/[shipmentId]/run?key=<Idempotency-Key>` (`PredictionRunClient.tsx`).
  - Run prediction button (shipment detail, dashboard, results page) now only acknowledges the click
    (disabled, "Starting prediction") and opens this page with a fresh key. Double clicks navigate once.
  - The page sends the POST once per key (a ref guard survives React's dev double-mount; checked: 1 POST),
    shows a spinner, an honest message and the shipment reference, with Predictions active in the sidebar
    and the breadcrumb Predictions → Run prediction.
  - Success: `router.replace` to the result, so browser Back returns to where the run started.
  - Failure: "Prediction not completed" card with the reason, request ID, **Retry prediction** (new key),
    Back to shipment and Back to Predictions. 429/503/409/404 messages kept from the old button.
  - The key lives in the URL, so a reload replays the same request instead of starting a second run.
- **Removed the timed fake stages.** The old dialog advanced "Checking… Scoring… Saving…" every 1.2s
  regardless of the request. The API returns in one call with no stages, so `PredictionProgress` is now an
  indeterminate spinner with no steps or percentages.

### Results page (`PredictionResultClient.tsx`)

- Tabs that hid content replaced by **jump links** (Overview, Feature impact, What it means, Key insights):
  a sticky bar under the header, every section on one page, current section highlighted while scrolling,
  smooth scroll only when the user allows motion.
- Header: "Completed" badge, subtitle "Dwell-time and cost estimation based on our machine learning model
  for <shipment link>". Back to Predictions + Run new prediction.
- **Full feature breakdown always shown** (the 5-row limit and "View all" toggle are gone).
- Model attribution: "Prediction generated by PortIQ's machine learning model (<version>), trained in-house on
  the <dataset> dataset: synthetic shipment data calibrated to published port dwell averages." The synthetic
  clause only shows when `is_demo_data` is true. Per `ml/README.md` the model is an in-house scikit-learn
  HistGradientBoosting model trained on **synthetic** data, so the page does not claim real historical data.
- Chart: bars ordered by impact (same order as the table); long axis labels are shortened with "…", and the
  tooltip and table still show them in full.
- Not added: "vs. port average" from the reference. The API returns no port-average field.

### Verification

- typecheck passes, lint clean. `npx vitest run --no-file-parallelism`: 30 files, 253 tests passed.
  The default parallel run times out one random untouched test at 5s (auth / operator / active-port across
  runs); each passes alone. Pre-existing load flakiness, not fixed here.
- Browser (mock, port 3002): shipment → run page → result; 1 POST; Back returns to the shipment;
  `mock_run_error=503` shows the failure card, Retry sends a new key; jump links scroll and highlight;
  375px: no page overflow, section bar scrolls sideways, table scrolls in its own container.
- Playwright e2e specs updated, **not run**.

## UI/UX overhaul — Phase 5: Dashboard, Shipments, Capacity, Load planner (2026-11-24)

Status: **done, waiting for Phase 6.** Presentation only; filtering, sorting, creation, data and the 3D viewer
logic are unchanged.

### Shipments (`ShipmentsList.tsx`)
- **Filter row aligned.** Root cause: `Field` puts a hint between label and input, so the two date fields
  ("UTC day" hint) sat lower than the others. The UTC note moved into the label's info tip; all five controls
  now share one top edge and 40px height. Grid: four equal columns plus an auto-width Clear filters button
  (full width on phones). Reference field gets an example placeholder.
- Table: fixed column widths (`table-fixed` + `colgroup`), tabular numbers for dates and dwell, and a
  row **Open** action (chevron, labelled "Open SHIP-…").
- Same UTC-tip fix on the operator overview filters.
- `shared/Field.tsx`: label row has one minimum height with or without an info tip (lines up any field grid).

### Dashboard (`DashboardClient.tsx`)
- Cards regrouped into one two-column grid of matched pairs: Active shipments + Capacity snapshot,
  Latest predicted dwell + Latest indicative cost, Upcoming arrivals + Latest milestone. The capacity card no
  longer spans the full width half-empty. Every card, action and figure is kept.

### Capacity (`CapacityClient.tsx`)
- Yard/Berth switch moved into the controls row with a visible "Area" label, same 40px height as Port,
  From and To. Tab semantics and keyboard arrows unchanged.

### Load planner
- Layout kept (300px control column, large 3D stage; stage first on phones). Only page spacing and the
  stage's corner radius moved onto the tokens. Viewer size and interactions untouched.

### Token sweep
- Page-level `space-y-6` / `gap-5|6` → `space-y-section` / `gap-section`, and card-level `rounded-2xl` →
  `rounded-card` (new/edit shipment, shipment detail, predictions list, results page panels, planner).
  Inner boxes inside cards keep 12px corners on purpose (nested corners stay smaller than the card's).

### Verification
- typecheck passes, lint clean, `npx vitest run --no-file-parallelism`: 30 files, 253 tests passed.
- Browser (mock, port 3002): Dashboard, Shipments, Capacity, Load planner at 1440, 1024, 768 and 375px:
  no page-level horizontal scroll at any width (tables scroll inside their own container); Shipments filter
  controls and Capacity controls measured on one row at 40px; capacity chart and legend inside the card at
  375px; 3D container renders at 1440 and 375px.
- Playwright e2e **not run**.

## UI/UX overhaul — Phase 6: testing (2026-11-24)

Status: **done.**

### Results (all actually run, final state)

| Check | Command (from `apps/web`) | Result |
|---|---|---|
| Type check | `npm run typecheck` | Pass |
| Lint | `npm run lint` | No warnings or errors |
| Unit tests | `npx vitest run --no-file-parallelism` | 30 files, **253 passed** |
| Production build | `NEXT_PUBLIC_USE_MOCKS=true NEXT_DIST_DIR=.next-build npx next build` | Pass, 22 routes incl. `/predictions/[shipmentId]/[predictionId]` and `/predictions/[shipmentId]/run` |
| E2E (Playwright, bundled Chromium, mock server) | `PLAYWRIGHT_PORT=3010 npx playwright test --workers=2` | **90 passed, 0 failed** |

First e2e run: 62 passed, 11 failed. Fixed:

| Failure | Cause | Fix |
|---|---|---|
| f04 ×3 (row link lookups) | Phase 5 "Open" row link: two links per row, and its name contained the reference | Removed the extra link. The reference link now covers the whole row (stretched link); the chevron is decorative |
| a11y, f01, f02, f03 axe `label-content-name-mismatch` | Profile button named "Open profile menu" while showing initials. Pre-existing; surfaced under axe 4.14 / bundled Chromium | Name is now "<initials>, open profile menu" |
| f05 full fixture, f02 | Content that used to sit in hidden tabs (Key insights, What it means) is now always visible, so loose text matchers found two elements | Matchers made exact |
| f10 end-to-end | Waited for the old `/shipments/…/prediction/…` URL; then asserted text "Estimated dwell time: X days" that no longer exists in the code (stale before this work) | New URL; asserts the dwell value in the summary region |
| f04 header | Looked for "Port: …" inside the h1's parent, but the shared PageHeader puts the subtitle beside it (stale before this work) | Scoped to the page header block |
| f04 409 event | Picked the page's first `<select>`, the sidebar port picker behind the modal sheet (stale before this work) | Scoped to the dialog |

### Unit test flakiness (pre-existing, not fixed)
The default parallel `npx vitest run` times out one random test at 5s (auth, operator or active-port; a different
one each run). Each passes alone, and the suite passes with `--no-file-parallelism`. None of these files were changed.

### Housekeeping
- `tsconfig.json` restored to its original `include` (Next.js had appended `.next-preview`, `.next-build` and
  `.next-e2e` during these runs; it re-adds them automatically when needed). `.next-build`, `.next-e2e` and
  `test-results` deleted.

---

## UI/UX overhaul — final summary (2026-11-24)

### Improvements
1. **Design tokens:** one set of CSS variables plus Tailwind names for layout, controls, cards, tables, icons and type
   (Phase 2). Controls are 40px everywhere; cards and tables share one radius and shadow; gutters adapt to screen size.
2. **Navigation:** sidebar order Dashboard, Shipments, Capacity, Load planner, Predictions (ML badge), Settings.
   URL, active item, breadcrumb and back button agree on every page; tablets get an icon rail; the mobile drawer
   closes on navigation.
3. **Prediction workflow:** dedicated processing page with honest loading, failure and retry states; one request per
   click (idempotency key in the URL); fake timed stages removed. The results page keeps every block, shows all
   sections with jump links, shows the full feature table, and attributes the model accurately (in-house, synthetic data).
4. **Pages:** Shipments filters aligned (shared `Field` fix), fixed-width table with whole-row click; Dashboard in
   balanced pairs; Capacity controls on one row; Load planner spacing on tokens with the 3D viewer untouched.

### Routes
| Route | Status |
|---|---|
| `/predictions/[shipmentId]/[predictionId]` | New: Prediction Results |
| `/predictions/[shipmentId]/run?key=…` | New: prediction processing / failure / retry |
| `/shipments/[id]/prediction/[predictionId]` | Kept as a redirect to the new results URL (query kept) |
| `/predictions` | Now also protected in `middleware.ts` (was missing) |

### Files
- **New:** `app/(app)/predictions/[shipmentId]/[predictionId]/page.tsx`, `app/(app)/predictions/[shipmentId]/run/page.tsx`,
  `components/features/predictions/PredictionRunClient.tsx`.
- **Rewritten:** `RunPredictionButton.tsx`, `PredictionProgress.tsx` (+ test), `app/(app)/shipments/[id]/prediction/[predictionId]/page.tsx` (redirect).
- **Modified:** `app/globals.css`, `tailwind.config.ts`, `themes/portiq/theme.css`, `middleware.ts`, `lib/navigation.ts`;
  `components/ui/{button,input,card,tabs}.tsx`; `components/shell/{AppShell,PageHeader}.tsx`;
  `components/shared/{Field,SectionTitle}.tsx`; `features/predictions/{PredictionResultClient,PredictionsClient,ExplanationChart}.tsx`;
  `features/shipments/{ShipmentsList,SelectControl,ShipmentDetailClient,NewShipmentForm,EditShipmentForm,ShipmentFormAside}.tsx`;
  `features/dashboard/DashboardClient.tsx`; `features/capacity/CapacityClient.tsx`; `features/operator/OperatorClient.tsx`;
  `features/load-planner/{LoadPlannerClient,ContainerViewport}.tsx`.
- **Tests updated:** `lib/navigation.test.ts`, `lib/auth/route-access.test.ts`, `features/predictions/{prediction-result,predictions}.test.tsx`,
  `tests/e2e/{a11y,f02,f04,f05,f10}.spec.ts`.
- **Dev config:** `.claude/launch.json` (outside `portiq-main`): `portiq-web-mock-isolated` preview on port 3002 with its own build folder.
- Not touched: backend, ML model and pipeline, API contracts, Supabase auth, database, env files.

### Remaining limitations
- No "vs. port average" comparison on the results page: the API returns no port-average figure.
- Breadcrumbs say "Shipment", not the shipment reference (crumbs come from the URL, not data).
- On tablets the active-port picker only shows when the sidebar is expanded.
- In mock mode a newly run prediction disappears after a page reload (mock data lives in memory).
- Default parallel unit run is flaky (see above); not caused or fixed here.
- Checked in Chromium only (no Firefox or Safari), and only against mock data, not the live API and Supabase.
- The project is not a git repository, so there is no diff or rollback for these changes.
