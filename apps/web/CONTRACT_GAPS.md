# Contract Gaps

Assumptions and deviations made while implementing F01 and F02.

## GAP-001: Supabase session wiring

**Location:** `lib/auth/client.ts`, `lib/auth/server.ts`, `lib/api/client.ts`

F02 adds browser and server Supabase clients plus the login, signup, recovery, and callback flow. Requests attach a Bearer token when a Supabase session exists. Mock mode bypasses Supabase and uses the mock auth adapter in GAP-010.

## GAP-002: 401 redirect

**Location:** `lib/api/client.ts`, `components/features/auth/AppGuard.tsx`

A 401 calls `window.location.assign(buildLoginRedirectUrl())` with the current path as `returnTo`. F02 adds `/login`, safe return-path validation, and the AppGuard fallback for unauthenticated users. The typed `ApiError` is still thrown for callers.

## GAP-003: Role source

**Location:** `lib/mocks/role.ts`, `components/providers/RoleProvider.tsx`, `components/providers/MeProvider.tsx`

The spec says role comes only from `GET /me`. In real mode, AppShell and AppGuard use the role returned by `/me`. In mock mode, the dev role switcher stores `portiq.mock.role` in `localStorage` and `/me` returns the matching fixture so the dev switcher remains useful without a real Supabase account. The switcher is never rendered when mocks are disabled.

## GAP-004: Placeholder routes

**Location:** `app/(app)/*/page.tsx`

F01/F02 routes render `Coming in F0N` placeholders instead of 404s, matching the requirement that later-feature routes have a placeholder. Placeholder feature numbers: dashboard F07, shipments F03, capacity F06, operator F08, tariffs F09, shipments/new F03, shipment detail F04, prediction F05, settings F10.

## GAP-005: Muted token contrast

**Location:** `app/globals.css`

The spec token `muted` is `#627D98`, which measures 3.98:1 on `canvas` and 4.28:1 on `surface`, below WCAG AA for normal text. It is darkened to `#5B738B` (4.58:1 and 4.92:1) so secondary text meets the spec's accessibility requirement. No other token is changed.

## GAP-006: Mock role switcher is a dev tool

**Location:** `components/shell/DevRoleSwitcher.tsx`

The spec forbids a role picker in production. The switcher is rendered only when `NEXT_PUBLIC_USE_MOCKS=true`; it disappears with mocks disabled.

## GAP-007: Sandbox route

**Location:** `app/(app)/dev/sandbox/page.tsx`

The sandbox is a development-only surface for every shared component and fixture state. It is not in primary navigation and calls `notFound()` when `NODE_ENV === "production"`. It is intentionally exempt from the auth guard so component and role-switcher checks remain usable without signing in.

## GAP-008: Mock computed values

**Location:** `lib/mocks/fixtures/capacity.ts`, `lib/mocks/fixtures/shipments.ts`

Fixtures derive a few display values (utilization percent, actual dwell days, events) so the mock API returns complete payloads. Application components never compute dwell, cost, totals, clearance dates, or utilization; they only format API values.

## GAP-009: Node 26 localStorage warning

**Location:** `apps/web/.npmrc`

Node 26 warns when the experimental global `localStorage` is accessed without `--localstorage-file`. `.npmrc` supplies the ignored `.localstorage` file so dev, build, and test commands run without that warning. Browser code still uses `window.localStorage` with an in-memory fallback.

## GAP-010: Mock auth adapter

**Location:** `lib/auth/mock.ts`, `lib/auth/actions.ts`

The spec describes Supabase auth but not how mock-mode E2E should establish a session. Mock mode uses a session-only flag in `sessionStorage` (`portiq.mock.auth`) and a `portiq:mock-auth` event. It accepts any validly formatted email/password, never stores a token, and is used only when `NEXT_PUBLIC_USE_MOCKS=true`.

## GAP-011: Recovery and reset routes

**Location:** `app/(auth)/forgot-password/page.tsx`, `app/(auth)/reset-password/page.tsx`, `app/auth/callback/route.ts`

The spec mentions password recovery but does not define route names or copy. F02 adds `/forgot-password`, `/reset-password`, and `/auth/callback`, with the callback exchanging the Supabase code and redirecting to a safe internal `next` path. The reset screen is required to complete the recovery flow.

## GAP-012: Auth copy and validation

**Location:** `lib/auth/validation.ts`, `lib/auth/actions.ts`

The spec does not define field-level auth validation or error copy. F02 uses email format validation, required passwords, and an 8-character signup/reset minimum. Auth errors are deliberately generic and non-enumerating, for example `Unable to sign in. Check your details and try again.` and `If an account exists for that email, a recovery link has been sent.`

## GAP-013: Route access table

**Location:** `lib/auth/route-access.ts`

The spec defines navigation and role permissions but not a complete URL-to-role table. F02 derives it from the role navigation and feature permissions: dashboard/shipments/new are importer-only, shipment detail and capacity are importer/operator, operator overview is operator/admin, tariffs are admin-only, and settings is available to every signed-in role. Unknown routes are not guarded by this table.

## GAP-014: Auth link contrast

**Location:** `components/features/auth/LoginForm.tsx`, `SignupForm.tsx`, `ForgotPasswordForm.tsx`

The `route-blue` token (`#3B82F6`) measures 3.67:1 on the white auth surface, below WCAG AA for 14px text. Auth links use the darker `primary` token instead. The shared `route-blue` token is unchanged, and the F02 axe check covers login and the protected shell.


