# PortIQ UI · 09 Admin tariff management and audit trail

> Read `00_READ_FIRST.md` and `PortIQ_API_Contract_v0.1.md` first. Build **only** this feature. Use the mock API. Do not change other features.

**Depends on:** 01, 02
**Goal:** Platform admins can view, version and deactivate demo tariff rules with an audit trail.

## Endpoints
`GET /admin/tariffs`, `POST /admin/tariffs`, `PATCH /admin/tariffs/{rule_id}`, `GET /admin/audit-logs`

## Page `/admin/tariffs`
- **Rules tab:** table with filters (rule type, port, HS prefix, shipping line, active, effective period). Show a "Demo tariff data" badge.
- **New version** form: rule type, port, HS prefix, shipping line, cargo type, container size, rate type, rate value, currency, free days, tier config, valid from, valid to (optional), required source note, version label. Zod: valid_to after valid_from, rate >= 0, source note required.
- Server `409 TARIFF_CONFLICT` opens a dialog showing the conflicting rule.
- **No delete button.** Only "Deactivate" and "Create new version" (supersede), each with a confirm dialog.
- **Audit trail tab:** who, when, action, before and after values, paginated.
- Admin only. Everyone else sees the permission page.

## Out of scope
Anything outside admin.

## Done when (and how a human tests it)

- Mock admin: table, filters, new version works.
- Mock 409: conflict dialog shows the other rule.
- valid_to before valid_from: field error.
- No delete control anywhere.
- Mock importer opens the route: permission page.
- Audit tab shows before and after.
- Tests: form rules, conflict dialog, no-delete, role access.

## Report back
Summary, files changed, commands run with results, assumptions, known gaps, human decisions needed.
