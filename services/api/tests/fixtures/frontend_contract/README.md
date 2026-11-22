# Frontend contract fixtures

One example of every API response type, copied from the frontend's MSW mock fixtures
(`apps/web/lib/mocks/fixtures/*.ts`) as backend spec B10 asks. `tests/test_contract.py` checks
that each real API response has the same field names and JSON types as these files.

They were generated, not hand-written: the TypeScript fixtures were bundled with esbuild and the
chosen example of each type was written out as JSON (22 Nov 2026). `shipment_summary.json` has no
fixture constant in the frontend; it is the object the mock handler builds.

If the frontend contract changes, regenerate these files from the mocks rather than editing them,
so the test keeps comparing against what the UI really consumes.
