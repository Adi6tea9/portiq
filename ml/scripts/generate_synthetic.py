import sys
import os
import pandas as pd
import numpy as np
from datetime import date, timedelta

# Point Python to the FastAPI app so we can use your Capacity Simulator
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../services/api')))
from app.services.capacity_sim import utilization_for

# Constants from Spec Section 10
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

def generate_dataset(n_rows: int, is_stress: bool = False, seed_offset: int = 0) -> pd.DataFrame:
    rng = np.random.default_rng(SEED + seed_offset)
    
    # Generate random dates
    date_range = (END_DATE - START_DATE).days
    random_days = rng.integers(0, date_range, size=n_rows)
    arrival_dates = [START_DATE + timedelta(days=int(d)) for d in random_days]
    
    # Feature distributions
    if is_stress:
        port_code = rng.choice(["INNSA", "INMUN"], size=n_rows, p=[0.6, 0.4])
        direction = rng.choice(["import", "export"], size=n_rows, p=[0.6, 0.4])
        cargo_type = rng.choice(["general_container", "reefer", "hazardous", "oversized"], size=n_rows, p=[0.4, 0.25, 0.15, 0.20])
        doc_status = rng.choice(["complete", "incomplete", "unknown"], size=n_rows, p=[0.5, 0.3, 0.2])
        shipping_line = rng.choice(["Line A", "Line B", "Line C", "Line D", "other"], size=n_rows, p=[0.2, 0.2, 0.15, 0.15, 0.3])
    else:
        port_code = rng.choice(["INNSA", "INMUN"], size=n_rows, p=[0.6, 0.4])
        direction = rng.choice(["import", "export"], size=n_rows, p=[0.6, 0.4])
        cargo_type = rng.choice(["general_container", "reefer", "hazardous", "oversized"], size=n_rows, p=[0.7, 0.15, 0.08, 0.07])
        doc_status = rng.choice(["complete", "incomplete", "unknown"], size=n_rows, p=[0.7, 0.2, 0.1])
        shipping_line = rng.choice(["Line A", "Line B", "Line C", "Line D", "other"], size=n_rows, p=[0.3, 0.25, 0.2, 0.15, 0.1])

    container_size_ft = rng.choice([20, 40], size=n_rows, p=[0.35, 0.65])
    hs_chapter = rng.choice(HS_CHAPTERS, size=n_rows)
    vessel_size_band = rng.choice(["small", "medium", "large"], size=n_rows, p=[0.25, 0.45, 0.3])
    
    # Weight lognormal between 500 and 40000
    weight_kg = rng.lognormal(mean=9.5, sigma=1.0, size=n_rows)
    weight_kg = np.clip(weight_kg, 500, 40000)

    # Fetch real capacity utilization from your math model
    utilization = np.array([
        utilization_for(p, "yard", d) or 70.0 
        for p, d in zip(port_code, arrival_dates)
    ])
    
    if is_stress:
        # Override with high stress utilization
        utilization = rng.uniform(75, 98, size=n_rows)

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
        "forecast_capacity_utilization_pct": utilization
    })

    # Dwell Time Multipliers
    cargo_mult = df["cargo_type"].map({"general_container": 1.0, "reefer": 0.85, "hazardous": 1.5, "oversized": 1.8})
    doc_mult = df["documentation_status"].map({"complete": 1.0, "incomplete": 1.8, "unknown": 1.3})
    cong_mult = 1 + 0.012 * np.maximum(0, df["forecast_capacity_utilization_pct"] - 70)
    hs_mult = df["hs_chapter"].map(lambda x: 1.2 if x in ["29", "30"] else (1.1 if x in ["84", "85"] else 1.0))
    weight_mult = 1 + (df["weight_kg"] / 200000)
    weekend_mult = np.array([1.15 if d.weekday() >= 5 else 1.0 for d in arrival_dates])
    line_mult = df["shipping_line"].map({"Line D": 1.1, "other": 1.25}).fillna(1.0)
    
    noise = rng.lognormal(mean=0, sigma=0.6, size=n_rows)
    
    # Calculate base array and multiply
    base_dwell = np.array([BASE_MEANS[(p, d)] for p, d in zip(df["port_code"], df["direction"])])
    raw_dwell = base_dwell * cargo_mult * doc_mult * cong_mult * hs_mult * weight_mult * weekend_mult * line_mult * noise

    # Disruption Scenario for stress file
    if is_stress:
        disruption_mask = (rng.uniform(size=n_rows) < 0.20) & (df["direction"] == "import")
        raw_dwell[disruption_mask] *= rng.uniform(2.0, 3.0, size=disruption_mask.sum())

    df["dwell_days"] = raw_dwell

    # Calibrate back to specific means to match spec
    for (p, d), target_mean in BASE_MEANS.items():
        mask = (df["port_code"] == p) & (df["direction"] == d)
        current_mean = df.loc[mask, "dwell_days"].mean()
        if current_mean > 0:
            df.loc[mask, "dwell_days"] *= (target_mean / current_mean)

    df["dwell_days"] = df["dwell_days"].clip(0.1, 30.0).round(3)
    df["weight_kg"] = df["weight_kg"].round(2)
    df["forecast_capacity_utilization_pct"] = df["forecast_capacity_utilization_pct"].round(2)

    return df

if __name__ == "__main__":
    print("Generating main synthetic dataset...")
    df_main = generate_dataset(MAIN_ROWS, is_stress=False, seed_offset=0)
    
    print("Generating stress holdout dataset...")
    df_stress = generate_dataset(STRESS_ROWS, is_stress=True, seed_offset=1)
    
    # Save CSVs
    raw_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../data/raw'))
    os.makedirs(raw_dir, exist_ok=True)
    
    main_path = os.path.join(raw_dir, "synthetic_v1.csv")
    stress_path = os.path.join(raw_dir, "synthetic_v1_stress.csv")
    
    df_main.to_csv(main_path, index=False)
    df_stress.to_csv(stress_path, index=False)
    
    print(f"Data saved to {raw_dir}")
    print(f"Main shape: {df_main.shape} | Stress shape: {df_stress.shape}")