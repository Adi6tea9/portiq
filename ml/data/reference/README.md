# Reference data: India port dwell time (aggregate)

Files: `port_dwell_2020.csv`, `port_dwell_2021.csv` (copy to `ml/data/reference/`).
Columns: port, month, year, category (Import or Export), dwell_hours.
Original file names: `DGQI.csv` (2020) and `DGQI_2021.csv` (2021). The only change is normalised column names and casing; values are unchanged.

TODO (human): record the source URL, download date and licence here and in `docs/data-dictionary.md`. Confirm the unit is hours.

Use: calibrate the synthetic generator's port-level means and run the calibration check and the disruption scenario only.
These are monthly aggregates per port, not individual-container records.
Known quirks: Kandla has no Export rows; NMPT Export has 4 months; April to June 2020 is a COVID lockdown disruption (excluded from the base means).
