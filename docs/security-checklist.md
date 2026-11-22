# PortIQ security checklist

Status of every security-relevant control in the prototype, as of 2026-11-22 (B10 complete). This is an
honest snapshot, not a certification.

Legend: **PASS** = implemented and exercised this session; **BLOCKED** = cannot be checked until
the human supplies the section 18 values; **FAIL** = known gap, listed with the impact;
**HUMAN** = a deployment step only the operator can take.

## 1. Secrets and configuration

| Check | Status | Evidence / notes |
| --- | --- | --- |
| No secret is committed | PASS | `.env`, `.env.local`, `.env.*.local` and `ml/artifacts/` are git-ignored (`.env.local` was added to `.gitignore` on 22 Nov; before that it was not covered). `.env.example` has placeholders only. Note: the working copy is not a git repository yet. |
| Only the documented environment variables are read | PASS | Backend spec section 3 list only (`app/core/config.py`). No service-role key is read anywhere. |
| Local `.env` cannot weaken a real environment | PASS | `load_env_file` uses `setdefault`, so an exported variable always wins; no interpolation. |
| Tests ignore a developer's `.env` | PASS | Loading is skipped when `APP_ENV=test`; `tests/test_config.py` covers both rules. |
| `AUTH_MODE=dev` is refused in staging/production | PASS | Startup raises; `tests/test_config.py::test_dev_auth_mode_refuses_to_start_outside_local`. |
| Supabase values live only in git-ignored files | BLOCKED | `services/api/.env` and `apps/web/.env.local` exist (git-ignored) with the Supabase lines empty; the real values are not supplied yet. |
| Model artifact path is explicit | PASS | `MODEL_PATH` (set to `/models/dwell_model_v2.joblib` in Docker) overrides the default `ml/artifacts/dwell_model_v2.joblib`; a missing file leaves the model unavailable (503) instead of crashing start-up. |

## 2. Authentication

| Check | Status | Evidence / notes |
| --- | --- | --- |
| JWT signature verified against the project JWKS | PASS (code) | `PyJWT` + `PyJWKClient`, `RS256`/`ES256`, 5-minute key-set cache, 5-second fetch timeout. Never decodes without verification. |
| Issuer, audience, expiry and required claims verified | PASS (code) | `jwt.decode(..., audience=..., issuer=..., options={"require": [exp, iat, sub, aud, iss]})`. |
| JWT settings verified against the real Supabase project | BLOCKED | Needs `SUPABASE_URL` (the JWKS URL, issuer and audience are now derived from it; explicit values still win) and a test user. |
| Legacy shared-secret projects are a hard stop | PASS | No shared-secret fallback exists. |
| Tokens and secrets never logged | PASS | Rejections log `reason=type(exc).__name__` only; the request log carries actor id, never the token. The smoke script prints the user id/email only. |
| Missing/invalid token → 401 `UNAUTHENTICATED` | PASS | `tests/test_auth.py` covers every protected route. |
| First-time Supabase user gets an importer profile only | PASS | `_get_or_provision` hard-codes `importer_exporter`; concurrent inserts resolved via `IntegrityError`. |
| Inactive profile → 403 | PASS | `get_current_user`. |

## 3. Authorization

| Check | Status | Evidence / notes |
| --- | --- | --- |
| Role always from `profiles`, never the body or a claim | PASS | `require_role`; body fields such as `role`/`owner_user_id` are rejected as unknown. |
| Importer isolation (A cannot read, patch, predict, list B) | PASS | Owner checks return 404; `tests/test_shipments.py`, `tests/test_predict.py`. |
| Operator port scope | PASS | `operator_ports` filter; out-of-scope shipment/capacity/overview port is 404; operator lists never include other ports (`tests/test_b10_endpoints.py`). |
| Audit trail readable by the admin only | PASS | `GET /admin/audit-logs` is admin-only; importer and operator get 403, no token 401. |
| Admin blocked from owner flows; importers/operators blocked from `/admin/*` | PASS | `tests/test_admin.py`, `tests/test_auth.py`. |
| 404 for hidden resources, 403 for forbidden roles | PASS | Spec 4.9 convention, asserted in the suite. |
| Admin can call `/operator/*` (spec section 7) | PASS | `/operator/overview` and `/operator/shipments` accept the admin with every port in scope (`tests/test_b10_endpoints.py`). The older non-contract `/operator/dashboard/summary` stays operator-only. |
| No self-promotion path | PASS | No endpoint writes `profiles.role`; profile creation is importer-only. |

## 4. Data protection

| Check | Status | Evidence / notes |
| --- | --- | --- |
| RLS enabled on every table with no policies | PASS | `migrations/versions/0001_initial.py`; direct `anon`/`authenticated` access is denied by default. |
| All authorization enforced in the API | PASS | API connects as the table owner and checks owner/scope in Python. |
| RLS would still protect a non-owner connection | HUMAN | `FORCE ROW LEVEL SECURITY` is off on purpose. If the API is ever pointed at a non-owner DB role, policies must be written first. |
| Queries are parameterised | PASS | SQLAlchemy ORM/`select()` throughout; no string-built SQL with user input. |
| Input validation at the trust boundary | PASS | Pydantic models plus database `CHECK` constraints (weight, value, hs_code, enums). |
| Money handled as `Decimal`, times as UTC | PASS | Numeric columns, `ROUND_HALF_UP` at the line amount, `timestamptz`, `Z` serialization. |
| Append-only history | PASS | No update/delete path for `shipment_events`, `prediction_runs`, `audit_logs`; tariffs deactivate. |

## 5. Transport and browser

| Check | Status | Evidence / notes |
| --- | --- | --- |
| CORS restricted to `ALLOWED_ORIGINS` | PASS | `*` rejected at startup because credentials are allowed; `tests/test_cors.py`. |
| Frontend origin configured for deployment | BLOCKED | Needs the real origin for `ALLOWED_ORIGINS`. |
| TLS for API and Supabase in deployment | HUMAN | Supabase serves HTTPS; the API must be deployed behind HTTPS. Local dev is plain HTTP on localhost. |
| Session storage in the browser | PASS (upstream) | Supabase SSR cookie session; the API does not read cookies. |
| Security headers / CSP on the Next.js app | HUMAN | Not configured in this repo beyond Next.js defaults; review before a public deployment. |

## 6. Abuse resistance and availability

| Check | Status | Evidence / notes |
| --- | --- | --- |
| Prediction rate limit (10/min/user, then 429) | PASS | In-memory per process, as spec 4.13 permits; `tests/test_predict.py`. |
| Model timeout → 503 `MODEL_UNAVAILABLE` | PASS | `PREDICTION_TIMEOUT_SECONDS`, worker thread; tests cover missing model. |
| No fabricated prediction, cost, capacity or explanation | PASS | Model failure → 503; missing tariff → `null` + warning; missing capacity → `unavailable`; SHAP failure isolated. |
| Request body size cap | PASS | 1 MiB (CG-019): a declared oversize `Content-Length` is refused before the app runs, a streamed body is counted; both 413 with the error envelope (`tests/test_hardening.py`). |
| Date-range caps on forecast filters | PASS | `/capacity/forecast` and `/operator/overview` cap the range at 31 days (422 on `to`); backwards list ranges are 422 (CG-020). |

## 7. Errors, logging, operations

| Check | Status | Evidence / notes |
| --- | --- | --- |
| Standard error envelope, generic `INTERNAL_ERROR` | PASS | `app/core/errors.py`; traceback logged server-side only. |
| Every response has a request id | PASS | Middleware sets `X-Request-ID` and `meta.request_id`. |
| Structured JSON logs with actor and model version | PASS | `RequestContextMiddleware._log_request`. |
| `/ready` exposes only component states | PASS | `database` and `model` states; no secrets or connection strings. |

## 8. Dependencies and tests

| Check | Status | Evidence / notes |
| --- | --- | --- |
| Direct dependencies pinned and installed | PASS | `services/api/requirements.txt`; `PyJWT[crypto]==2.15.1`. |
| No unvetted library added | PASS | Nothing new this session; `.env` parsing is standard library (`CONTRACT-GAP CG-017`). |
| Authorization denial matrix in the test suite | PASS | `tests/test_auth_matrix.py`: every route × role from the section 7 table (401 without a token, 403 for forbidden roles, never 401/403 for allowed ones), hidden resources 404, and a guard that fails if a new route is not in the matrix. 172 tests pass. |
| Contract tests against the frontend mocks | PASS | `tests/test_contract.py` compares 14 real responses with payloads copied from `apps/web/lib/mocks` (field names and JSON types). |
| Dependency vulnerability scan | HUMAN | `pip-audit`/`npm audit` were not run; run them before a public deployment. |
| Real Supabase smoke test (sign-in, `/me`, create, predict) | BLOCKED | Script is written and reviewed; it has not been run against a project yet. |

## 9. Deployment checklist (human)

1. Create the Supabase project (asymmetric JWT signing keys, the default). Put `AUTH_MODE=supabase`
   and `SUPABASE_URL` into `services/api/.env` (JWKS URL, issuer and audience are derived), and the
   URL + publishable key into `apps/web/.env.local` (`NEXT_PUBLIC_USE_MOCKS=false`).
2. Set `APP_ENV=production`, `ALLOWED_ORIGINS=https://<your-frontend-origin>` and the pooled
   `DATABASE_URL`. Leave `AUTH_MODE=dev` behind — startup refuses it in production.
3. Run `alembic upgrade head`. Do **not** run `seed_dev.py` (it refuses `production` anyway) and do
   not run the pytest suite against Supabase.
4. Sign up once, then promote the operator/admin profiles and insert `operator_ports` rows with
   SQL, as section 18 step 5 describes. Never add a role-setting endpoint.
5. Confirm RLS is still enabled and still has no policies, and that the API's DB role is the
   intended one.
6. Run `python scripts/smoke_supabase.py ...` against the deployed API with a real importer.
7. Keep the publishable key in the browser only; never put the service-role key or the DB password
   in a `NEXT_PUBLIC_*` variable.

## Accepted gaps

See `services/api/CONTRACT_GAPS.md`. The security-relevant ones are CG-008 (fail-fast config),
CG-013 (unknown dev email, invalid `sub`), CG-015 (model metadata, resolved 22 Nov), CG-016 (no invented
capacity feature) and CG-017 (`.env` fallback precedence).
