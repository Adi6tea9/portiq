# PortIQ UI · 02 Auth and role navigation

> Read `00_READ_FIRST.md` and `PortIQ_API_Contract_v0.1.md` first. Build **only** this feature. Use the mock API. Do not change other features.

**Depends on:** 01
**Goal:** Sign up, sign in, sign out, session expiry, and role-based navigation driven by the server.

## Scope
- Pages: `/login`, `/signup`, password recovery link, `/settings` is NOT in this feature.
- Supabase Auth with `@supabase/ssr`. Email and password.
- After sign-in call `GET /me`. Role comes only from this response.
- Sidebar and allowed routes by role:

| Route | Roles |
| --- | --- |
| `/dashboard`, `/shipments`, `/shipments/new` | importer_exporter |
| `/shipments/[id]`, `/capacity` | importer_exporter, port_operator |
| `/operator` | port_operator, platform_admin |
| `/admin/tariffs` | platform_admin |

- Public sign-up gets importer only. No role picker anywhere.
- Forbidden route shows the permission page, not a blank screen or a redirect loop.
- 401 from any call: redirect to `/login` and return to the same page after sign-in.
- Forms: persistent labels, inline errors, safe error text (never say whether an email exists), no double submit.
- Placeholder pages for routes owned by later features, each reading "Coming in feature NN".

## Out of scope
Settings page, landing page.

## Done when (and how a human tests it)

- Sign up creates an importer and lands on `/dashboard` placeholder.
- Mock `/me` as operator: sidebar shows Operator and Capacity, not Shipments. Opening `/admin/tariffs` shows the permission page.
- Mock a 401: user lands on login, then returns to the page after sign-in.
- Sign out clears the session; back button does not show protected pages.
- Tests: form validation, role-to-nav map for all 3 roles, forbidden route UX, 401 redirect.

## Report back
Summary, files changed, commands run with results, assumptions, known gaps, human decisions needed.
