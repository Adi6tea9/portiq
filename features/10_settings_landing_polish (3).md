# PortIQ UI · how to use these files

Give the agent `00_READ_FIRST.md`, `PortIQ_API_Contract_v0.1.md` and **one** feature file per session. Test it, then move on.

| # | File | Needs | You can test it when |
| --- | --- | --- | --- |
| 01 | `01_setup_shell_mocks.md` | none | Shell renders with mock data and a role switcher |
| 02 | `02_auth_and_navigation.md` | 01 | Sign in works and nav changes by role |
| 03 | `03_shipment_create_list.md` | 01, 02 | You can create a shipment and see it in a list |
| 04 | `04_shipment_detail_events.md` | 03 | Detail, timeline, edit and events work |
| 05 | `05_prediction_result.md` | 04 | Full, partial and unavailable results all display correctly |
| 06 | `06_capacity_forecast.md` | 01, 02 | Chart and table work, empty state shown |
| 07 | `07_importer_dashboard.md` | 03 to 05 | Cards fill, one failure doesn't blank the page |
| 08 | `08_operator_overview.md` | 04, 06 | Scoped KPIs, at-risk reasons |
| 09 | `09_admin_tariffs.md` | 01, 02 | Versioning, conflict dialog, audit |
| 10 | `10_settings_landing_polish.md` | all | E2E and accessibility pass |

Features 06 and 09 only need 01 and 02, so they can run in parallel with 03 to 05.
Every feature works against the mock API, so none of them waits for the backend.
