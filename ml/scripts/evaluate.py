"""Calibration check for the synthetic data (backend spec section 10).

    python evaluate.py              # v2 -> reports/calibration_v2.json

Checks the DATA, not the model's accuracy:
  1. the generated mean dwell per port and direction against the reference means it is calibrated
     to (2020-2021 monthly port averages, Apr-Jun 2020 lockdown excluded);
  2. the same means against each reference year separately (2020, 2021, and 2022 when present),
     because the real means differ between years;
  3. that the reference files reproduce the generator's base values, and the lockdown multiplier
     the stress set's disruption scenario is based on.
Reference files: ml/data/reference/port_dwell_<year>.csv, dwell in HOURS (confirmed by the owner).
"""

import argparse
import json
from pathlib import Path

import pandas as pd
from generate_synthetic_v2 import BASE_MEANS

ML = Path(__file__).resolve().parents[1]
REFERENCE_DIR = ML / "data" / "reference"
TOLERANCE = 0.15  # spec 10: within 15%
# Spec 10 port mapping: JNPT (Nhava Sheva) = INNSA, APSEZ (Adani Ports, Mundra) = INMUN.
PORT_MAP = {"JNPT": "INNSA", "APSEZ": "INMUN"}
LOCKDOWN_YEAR, LOCKDOWN_MONTHS = 2020, {"APRIL", "MAY", "JUNE"}
BASE_YEARS = (2020, 2021)


def load_reference(directory: Path = REFERENCE_DIR) -> pd.DataFrame:
    """All port_dwell_<year>.csv files, long format, with `dwell_days` and a lockdown flag."""
    files = sorted(directory.glob("port_dwell_*.csv"))
    if not files:
        return pd.DataFrame()
    # utf-8-sig: one of the supplied files starts with a byte-order mark.
    ref = pd.concat([pd.read_csv(f, encoding="utf-8-sig") for f in files], ignore_index=True)
    expected = {"port", "month", "year", "category", "dwell_hours"}
    if set(ref.columns) != expected:
        raise ValueError(f"reference columns {sorted(ref.columns)} != {sorted(expected)}")
    if ref.duplicated(["port", "month", "year", "category"]).any():
        raise ValueError("duplicate port/month/year/category rows in the reference files")
    ref["dwell_days"] = ref["dwell_hours"] / 24.0
    ref["lockdown"] = (ref["year"] == LOCKDOWN_YEAR) & ref["month"].isin(LOCKDOWN_MONTHS)
    return ref


def reference_means(ref: pd.DataFrame, years: tuple[int, ...]) -> dict:
    """Mean reference dwell (days) and month count per (port_code, direction), lockdown excluded."""
    rows = ref[ref["port"].isin(PORT_MAP) & ref["year"].isin(years) & ~ref["lockdown"]]
    out = {}
    for (port, category), group in rows.groupby(["port", "category"]):
        out[(PORT_MAP[port], category.lower())] = (float(group["dwell_days"].mean()), len(group))
    return out


def lockdown_multiplier(ref: pd.DataFrame) -> dict:
    """JNPT import dwell in Apr-Jun 2020 relative to the rest of 2020 (stress disruption basis)."""
    jnpt = ref[(ref["port"] == "JNPT") & (ref["category"] == "Import") & (ref["year"] == LOCKDOWN_YEAR)]
    normal = jnpt.loc[~jnpt["lockdown"], "dwell_hours"].mean()
    ratios = jnpt.loc[jnpt["lockdown"], "dwell_hours"] / normal
    return {
        "normal_2020_hours": round(float(normal), 1),
        "lockdown_hours": jnpt.loc[jnpt["lockdown"], "dwell_hours"].tolist(),
        "ratio_min": round(float(ratios.min()), 2),
        "ratio_max": round(float(ratios.max()), 2),
        "generator_disruption_range": [2.0, 3.0],
    }


def compare(simulated: pd.DataFrame, targets: dict) -> dict:
    rows = {}
    for (port, direction), (target, months) in sorted(targets.items()):
        group = simulated[(simulated.port_code == port) & (simulated.direction == direction)]
        diff = (group["dwell_days"].mean() - target) / target
        rows[f"{port} {direction}"] = {
            "reference_mean_days": round(target, 4),
            "reference_months": months,
            "simulated_mean_days": round(float(group["dwell_days"].mean()), 4),
            "difference_pct": round(100 * float(diff), 2),
            "within_tolerance": bool(abs(diff) <= TOLERANCE),
        }
    return rows


def main(version: str) -> None:
    raw = ML / "data" / "raw" / f"synthetic_{version}.csv"
    simulated = pd.read_csv(raw, dtype={"hs_chapter": str})
    ref = load_reference()
    base_targets = {key: (value, 0) for key, value in BASE_MEANS.items()}
    report: dict = {
        "dataset": raw.name,
        "what_this_checks": "The synthetic data's per port/direction means, not model accuracy.",
        "tolerance_pct": 100 * TOLERANCE,
        "units": "reference files are in hours (confirmed by the owner); compared in days",
        "against_generator_base_means": compare(simulated, base_targets),
        "assumption": "The container-level spread (lognormal noise) cannot be derived from monthly "
                      "averages; it is an assumption.",
    }
    if ref.empty:
        report["per_year"] = "Not run: no ml/data/reference/port_dwell_<year>.csv files."
    else:
        pooled = reference_means(ref, BASE_YEARS)
        report["base_means_reproduced"] = {
            f"{port} {direction}": {
                "generator_base_days": BASE_MEANS[(port, direction)],
                "reference_2020_2021_days": round(days, 3),
                "matches": abs(days - BASE_MEANS[(port, direction)]) < 0.005,
            }
            for (port, direction), (days, _) in sorted(pooled.items())
        }
        report["per_year"] = {
            str(year): compare(simulated, reference_means(ref, (year,)))
            for year in sorted(ref["year"].unique())
        }
        report["lockdown_multiplier"] = lockdown_multiplier(ref)

    out = ML / "reports" / f"calibration_{version}.json"
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    if isinstance(report["per_year"], str):
        print(report["per_year"])
    else:
        for name, row in report["base_means_reproduced"].items():
            print(f"base {name:13s} generator {row['generator_base_days']:.2f} | reference 2020-21 "
                  f"{row['reference_2020_2021_days']:.3f} days | {'match' if row['matches'] else 'MISMATCH'}")
        for year, rows in report["per_year"].items():
            for name, row in rows.items():
                flag = "ok" if row["within_tolerance"] else "OUTSIDE"
                print(f"{year} {name:13s} simulated {row['simulated_mean_days']:.3f} vs "
                      f"{row['reference_mean_days']:.3f} days ({row['reference_months']} months) "
                      f"{row['difference_pct']:+.1f}% {flag}")
        lock = report["lockdown_multiplier"]
        print(f"lockdown: JNPT import x{lock['ratio_min']}-x{lock['ratio_max']} of normal "
              f"({lock['normal_2020_hours']} h); generator uses x2.0-x3.0")
    print(f"Saved: {out}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", default="v2", choices=["v2"])
    main(ap.parse_args().version)
