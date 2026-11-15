"""
PortIQ synthetic data v2.

Adds a NEW dataset next to v1. Nothing here touches v1:
  reads  : services/api/app/services/capacity_sim.py  (same as v1)
  writes : ml/data/raw/synthetic_v2.csv, synthetic_v2_stress.csv
  v1 files (synthetic_v1*.csv) and generate_synthetic.py are left alone.

What changed versus v1 (all of it additive or a bug fix):
  1. Congestion effect is convex instead of linear:
         1 + 1.5 * (max(0, util - 70) / 30) ** 2      (about x2.3 at 98%)
     v1 was 1 + 0.012 * (util - 70), at most about x1.34, which noise buried.
  2. Noise sigma 0.6 -> 0.35 so the planted signals are learnable.
  3. Stress-set bug fixed: v1 re-calibrated the stress set to the SAME per-port
     means as the main set, which cancelled the disruption and the high
     utilization. v2 learns the scale factors on the main set and REUSES them
     for the stress set, so the stress set really is harder.
  4. HS multiplier bug fixed: v1 tested for chapter "30", which is not in
     HS_CHAPTERS, so that branch never fired.
  5. utilization_for(...) returning 0 is no longer treated as missing.
  6. New columns (appended after the v1 columns):
       customs_channel : green / orange / red / unknown (35% unknown, as if the
                         importer does not know it before arrival)
       importer_type   : AEO / regular / new
       is_holiday      : 1 on fixed national holidays (deterministic from date)
       exam_queue_len  : customs exam queue at arrival, derived from yard
                         utilization (system-state feature)

  7. (14 Nov) BUSY_SHARE of main-set rows get utilization drawn from 80-98% instead of
     the capacity simulator's value, so the congestion effect is actually exercised.
     This is a deliberate choice: the main set covers a wider range than the
     simulator alone produces. Say so in the report.

  8. (14 Nov) cargo_priority column: standard / expedited / government. Government is 3%
     of rows; expedited is 40% of reefer cargo and 5% of other cargo. Multipliers 1.0 /
     0.75 / 0.6 are ASSUMPTIONS, and importer_type x priority is floored at 0.5.
     The API must supply cargo_priority at prediction time (default "standard").

HONEST CAVEATS
  * Every effect above is PLANTED by this script. A model recovering them shows
    the pipeline works, not that real ports behave this way. Say so in the report.
  * exam_queue_len and customs_channel need a source at prediction time. If the
    API cannot supply them, train without them (see train.py ablation) or
    supply them as "unknown" / from the capacity simulator.
  * Calibration keeps the per-port, per-direction MEANS equal to BASE_MEANS on
    the main set, so congestion changes the spread, not the average.
"""
import os
import sys
from datetime import date, timedelta

import numpy as np
import pandas as pd

# Point Python to the FastAPI app so we can use the Capacity Simulator
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../services/api')))
from app.services.capacity_sim import utilization_for  # pyright: ignore[reportMissingImports]

# Constants from Spec Section 10 (unchanged from v1)
SEED = 42
MAIN_ROWS = 10000
STRESS_ROWS = 1500
START_DATE = date(2025, 1, 1)
END_DATE = date(2026, 10, 31)

BASE_MEANS = {
    ("INNSA", "import"): 0.87,
    ("INMUN", "import"): 1.17,
    ("INNSA", "export"): 3.14,
    ("INMUN", "export"): 5.18,
}

HS_CHAPTERS = ["02", "08", "29", "84", "85"] + [str(i).zfill(2) for i in range(10, 25)]

# --- v2 parameters -----------------------------------------------------------
NOISE_SIGMA = 0.35
CONG_THRESHOLD = 70.0
CONG_STRENGTH = 1.5
BUSY_SHARE = 0.20  # share of MAIN-set rows overridden into the busy band
BUSY_LOW, BUSY_HIGH = 80.0, 98.0
UNKNOWN_CHANNEL_PROB = 0.35

# Formal cargo priority (government, perishable/medical). All multipliers are ASSUMPTIONS:
# no published data says how much faster priority cargo clears at Indian ports.
PRIORITY_MULT = {"standard": 1.0, "expedited": 0.75, "government": 0.6}
GOV_PROB = 0.03                # government / defence cargo
EXPEDITE_PROB_REEFER = 0.40    # perishables are often expedited
EXPEDITE_PROB_OTHER = 0.05     # medical / emergency / other urgent cargo
MIN_COMBINED_MULT = 0.5        # importer_type x priority never speeds a shipment past x0.5
FIXED_HOLIDAYS = {(1, 26), (5, 1), (8, 15), (10, 2), (12, 25)}  # month, day

IMPORTER_TYPES = ["AEO", "regular", "new"]
IMPORTER_P = [0.10, 0.60, 0.30]
IMPORTER_MULT = {"AEO": 0.75, "regular": 1.00, "new": 1.15}
CHANNEL_P = {  # green, orange, red
    "AEO": [0.90, 0.08, 0.02],
    "regular": [0.70, 0.20, 0.10],
    "new": [0.50, 0.30, 0.20],
}


def is_holiday(d: date) -> int:
    """Deterministic from the date, so the API can reproduce it exactly."""
    return int((d.month, d.day) in FIXED_HOLIDAYS)


def congestion_mult(util):
    return 1 + CONG_STRENGTH * (np.maximum(0, util - CONG_THRESHOLD) / 30.0) ** 2


def exam_queue_from_util(rng, util):
    """Customs exam queue grows with yard utilization (plus noise)."""
    q = 10 + 0.9 * (util - 50) + rng.normal(0, 8, size=len(util))
    return np.maximum(0, np.round(q)).astype(int)


def calibrate(df: pd.DataFrame, scale=None):
    """Scale dwell_days so per-port/direction means match BASE_MEANS.

    scale=None  -> learn factors from df (main set)
    scale=dict  -> reuse factors learned on the main set (stress set)
    """
    if scale is None:
        scale = {}
        for (p, d), target_mean in BASE_MEANS.items():
            mask = (df["port_code"] == p) & (df["direction"] == d)
            current_mean = df.loc[mask, "dwell_days"].mean()
            scale[(p, d)] = target_mean / current_mean if current_mean > 0 else 1.0
    for (p, d), s in scale.items():
        mask = (df["port_code"] == p) & (df["direction"] == d)
        df.loc[mask, "dwell_days"] *= s
    return scale


def generate_dataset(n_rows: int, is_stress: bool = False, seed_offset: int = 0, scale=None):
    rng = np.random.default_rng(SEED + seed_offset)

    # Random arrival dates
    date_range = (END_DATE - START_DATE).days
    random_days = rng.integers(0, date_range, size=n_rows)
    arrival_dates = [START_DATE + timedelta(days=int(d)) for d in random_days]

    # Feature distributions (same as v1)
    if is_stress:
        cargo_type = rng.choice(["general_container", "reefer", "hazardous", "oversized"], size=n_rows, p=[0.4, 0.25, 0.15, 0.20])
        doc_status = rng.choice(["complete", "incomplete", "unknown"], size=n_rows, p=[0.5, 0.3, 0.2])
        shipping_line = rng.choice(["Line A", "Line B", "Line C", "Line D", "other"], size=n_rows, p=[0.2, 0.2, 0.15, 0.15, 0.3])
    else:
        cargo_type = rng.choice(["general_container", "reefer", "hazardous", "oversized"], size=n_rows, p=[0.7, 0.15, 0.08, 0.07])
        doc_status = rng.choice(["complete", "incomplete", "unknown"], size=n_rows, p=[0.7, 0.2, 0.1])
        shipping_line = rng.choice(["Line A", "Line B", "Line C", "Line D", "other"], size=n_rows, p=[0.3, 0.25, 0.2, 0.15, 0.1])
    port_code = rng.choice(["INNSA", "INMUN"], size=n_rows, p=[0.6, 0.4])
    direction = rng.choice(["import", "export"], size=n_rows, p=[0.6, 0.4])

    container_size_ft = rng.choice([20, 40], size=n_rows, p=[0.35, 0.65])
    hs_chapter = rng.choice(HS_CHAPTERS, size=n_rows)
    vessel_size_band = rng.choice(["small", "medium", "large"], size=n_rows, p=[0.25, 0.45, 0.3])

    # Weight lognormal between 500 and 40000
    weight_kg = np.clip(rng.lognormal(mean=9.5, sigma=1.0, size=n_rows), 500, 40000)

    # Capacity utilization from your capacity model (0 is a valid value now)
    utilization = np.array([
        (u if (u := utilization_for(p, "yard", d)) is not None else 70.0)
        for p, d in zip(port_code, arrival_dates)
    ])
    if is_stress:
        utilization = rng.uniform(75, 98, size=n_rows)
    else:
        # Main set only: the capacity simulator alone rarely goes above ~80%, so the
        # congestion effect would be almost untested. Push a share of rows into the
        # busy band so the model (and the demo curve) sees real congestion.
        busy = rng.random(n_rows) < BUSY_SHARE
        busy_util = rng.uniform(BUSY_LOW, BUSY_HIGH, size=n_rows)
        utilization = np.where(busy, busy_util, utilization)

    # --- v2 features ---------------------------------------------------------
    importer_type = rng.choice(IMPORTER_TYPES, size=n_rows, p=IMPORTER_P)
    true_channel = np.array([rng.choice(["green", "orange", "red"], p=CHANNEL_P[i]) for i in importer_type])
    customs_channel = np.where(rng.random(n_rows) < UNKNOWN_CHANNEL_PROB, "unknown", true_channel)
    exam_queue_len = exam_queue_from_util(rng, utilization)
    holiday = np.array([is_holiday(d) for d in arrival_dates])

    # Formal cargo priority: government cargo, plus expedited (perishable / medical / urgent)
    is_gov = rng.random(n_rows) < GOV_PROB
    expedite_p = np.where(cargo_type == "reefer", EXPEDITE_PROB_REEFER, EXPEDITE_PROB_OTHER)
    is_expedited = (~is_gov) & (rng.random(n_rows) < expedite_p)
    cargo_priority = np.where(is_gov, "government", np.where(is_expedited, "expedited", "standard"))

    df = pd.DataFrame({
        "expected_arrival_at": [d.isoformat() + "T10:00:00Z" for d in arrival_dates],
        "port_code": port_code,
        "direction": direction,
        "cargo_type": cargo_type,
        "container_size_ft": container_size_ft,
        "hs_chapter": hs_chapter,
        "weight_kg": weight_kg,
        "shipping_line": shipping_line,
        "vessel_size_band": vessel_size_band,
        "documentation_status": doc_status,
        "forecast_capacity_utilization_pct": utilization,
        # v2 additions (appended after the v1 columns)
        "customs_channel": customs_channel,
        "importer_type": importer_type,
        "is_holiday": holiday,
        "exam_queue_len": exam_queue_len,
        "cargo_priority": cargo_priority,
    })

    # Dwell time multipliers
    cargo_mult = df["cargo_type"].map({"general_container": 1.0, "reefer": 0.85, "hazardous": 1.5, "oversized": 1.8})
    doc_mult = df["documentation_status"].map({"complete": 1.0, "incomplete": 1.8, "unknown": 1.3})
    cong_mult = congestion_mult(df["forecast_capacity_utilization_pct"])
    hs_mult = df["hs_chapter"].map({"29": 1.2, "84": 1.1, "85": 1.1}).fillna(1.0)
    weight_mult = 1 + (df["weight_kg"] / 200000)
    weekend_mult = np.array([1.15 if d.weekday() >= 5 else 1.0 for d in arrival_dates])
    line_mult = df["shipping_line"].map({"Line D": 1.1, "other": 1.25}).fillna(1.0)
    # v2 multipliers use the TRUE channel, so "unknown" rows still carry the effect
    channel_mult = np.where(true_channel == "red", 1.4 + 0.01 * exam_queue_len,
                            np.where(true_channel == "orange", 1.2, 1.0))
    importer_mult = df["importer_type"].map(IMPORTER_MULT)
    holiday_mult = 1 + 0.2 * holiday
    priority_mult = df["cargo_priority"].map(PRIORITY_MULT)
    # AEO importers and priority cargo both speed things up, but not without limit
    speed_mult = np.maximum(importer_mult * priority_mult, MIN_COMBINED_MULT)

    noise = rng.lognormal(mean=0, sigma=NOISE_SIGMA, size=n_rows)

    base_dwell = np.array([BASE_MEANS[(p, d)] for p, d in zip(df["port_code"], df["direction"])])
    raw_dwell = (base_dwell * cargo_mult * doc_mult * cong_mult * hs_mult * weight_mult
                 * weekend_mult * line_mult * channel_mult * speed_mult * holiday_mult * noise)

    # Disruption scenario for the stress file (not visible in any feature)
    if is_stress:
        disruption_mask = (rng.uniform(size=n_rows) < 0.20) & (df["direction"] == "import")
        raw_dwell = np.array(raw_dwell, dtype=float)  # writable copy
        raw_dwell[disruption_mask.to_numpy()] *= rng.uniform(2.0, 3.0, size=int(disruption_mask.sum()))

    df["dwell_days"] = np.array(raw_dwell, dtype=float)

    # Calibrate: learn on the main set, REUSE on the stress set
    scale = calibrate(df, scale)

    df["dwell_days"] = df["dwell_days"].clip(0.1, 30.0).round(3)
    df["weight_kg"] = df["weight_kg"].round(2)
    df["forecast_capacity_utilization_pct"] = df["forecast_capacity_utilization_pct"].round(2)

    return df, scale


def sanity_report(name: str, df: pd.DataFrame):
    print(f"\n[{name}] mean dwell_days by port/direction (spec targets in brackets)")
    for (p, d), target in BASE_MEANS.items():
        m = df[(df.port_code == p) & (df.direction == d)]["dwell_days"].mean()
        print(f"  {p} {d:6s} {m:5.2f}  [{target}]")
    bins = [0, 50, 70, 80, 90, 100]
    g = df.groupby(pd.cut(df["forecast_capacity_utilization_pct"], bins), observed=True)["dwell_days"]
    print(f"[{name}] mean dwell_days by utilization bucket")
    print(g.agg(["count", "mean"]).round(2).to_string())


if __name__ == "__main__":
    print("Generating v2 main synthetic dataset...")
    df_main, scale = generate_dataset(MAIN_ROWS, is_stress=False, seed_offset=0)

    print("Generating v2 stress holdout dataset (reusing main-set calibration)...")
    df_stress, _ = generate_dataset(STRESS_ROWS, is_stress=True, seed_offset=1, scale=scale)

    raw_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../data/raw'))
    os.makedirs(raw_dir, exist_ok=True)

    main_path = os.path.join(raw_dir, "synthetic_v2.csv")
    stress_path = os.path.join(raw_dir, "synthetic_v2_stress.csv")
    df_main.to_csv(main_path, index=False)
    df_stress.to_csv(stress_path, index=False)

    print(f"Data saved to {raw_dir}  (v1 files untouched)")
    print(f"Main shape: {df_main.shape} | Stress shape: {df_stress.shape}")
    sanity_report("main", df_main)
    sanity_report("stress", df_stress)