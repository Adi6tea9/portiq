# PortIQ architecture

Short notes for the backend as it stands after B02 (database, migrations, seed). This file grows
in later features; B11 turns it into the full architecture/security write-up.

## Database access

Postgres 15, one schema (`public`), accessed with SQLAlchemy 2 (sync) and psycopg 3 through
`DATABASE_URL`. All migrations live in `services/api/migrations/`; `0001_initial` is hand-written
so the enums, checks, indexes and RLS settings match backend spec section 6 exactly.

Enums exist twice on purpose, from one source: `app/schemas/enums.py` is the Python source of
truth, and the Alembic revision creates the matching Postgres enum types. A value that is not in
both is rejected by the database.

## Row Level Security (backend spec 4.7)

`ENABLE ROW LEVEL SECURITY` is set on every application table (`profiles`, `ports`,
`operator_ports`, `shipments`, `shipment_events`, `prediction_runs`, `capacity_forecasts`,
`tariff_rules`, `audit_logs`) and **no policies are created**.

- Direct access from Supabase's `anon`/`authenticated` roles is therefore denied by default.
  Only the API can read or write.
- The API connects as the table owner, which bypasses RLS by design. **All authorization is
  enforced in the API**: role from `profiles`, operator scope from `operator_ports`, shipment
  ownership from `shipments.owner_user_id` (backend spec section 7).
- `FORCE ROW LEVEL SECURITY` is deliberately not set: it would also apply to the owner and break
  the seed and the migrations. **Flag for B11:** if the deployed API ever connects with a
  non-owner role (for example a scoped Supabase role instead of the database owner), RLS will
  apply to it and explicit policies must be written before that change ships — enabling RLS
  alone is not a substitute for the API-layer checks.

## Immutability

`shipment_events`, `prediction_runs` and `audit_logs` are append-only by convention (backend spec
5.11). There is no repository code that updates or deletes them, and `tariff_rules` is never
deleted — deactivation flips `is_active`.

## Time and money

All `timestamptz` columns store UTC; the API renders ISO-8601 with `Z`. Money and rates use
`numeric` and are handled as `Decimal` in Python, never `float`.
