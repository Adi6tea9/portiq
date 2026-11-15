"""
Prepare raw synthetic data into train/val/test/stress CSVs.

  python prepare_data.py              # v2 (default) -> ml/data/processed/v2/
  python prepare_data.py --version v1 # v1          -> ml/data/processed/  (same as before)

v1 outputs keep their original location and logic, so existing v1 data is not changed.

Changes vs the previous copy:
  * raises an error if no arrival-date column exists (the split MUST be time-ordered)
  * reports how many rows dropna() removed instead of dropping them silently
"""
import argparse
from pathlib import Path

import pandas as pd

# Setup paths
current_dir = Path(__file__).resolve().parent
raw_dir = current_dir.parent / "data" / "raw"
processed_root = current_dir.parent / "data" / "processed"

DATE_COLUMNS = ["arrival_date", "expected_arrival_at", "arrival_time", "date"]


def load_and_prepare(
    filename: str, is_train: bool = True
) -> tuple[pd.DataFrame, pd.DataFrame | None, pd.DataFrame | None]:
    file_path = raw_dir / filename
    if not file_path.exists():
        raise FileNotFoundError(
            f"Cannot find {file_path}. Run generate_synthetic.py (v1) or generate_synthetic_v2.py (v2) first."
        )

    df = pd.read_csv(file_path)

    # 1. Schema validation & types
    if "hs_chapter" in df.columns:
        df["hs_chapter"] = df["hs_chapter"].astype(str).str.zfill(2)

    # 2. Find the date column. Without one a time-ordered split is impossible, so fail loudly.
    date_col = next((c for c in DATE_COLUMNS if c in df.columns), None)
    if date_col is None:
        raise ValueError(
            f"{filename}: no date column found (looked for {DATE_COLUMNS}). "
            "A time-ordered split needs one; refusing to split in file order."
        )

    df[date_col] = pd.to_datetime(df[date_col])
    df["arrival_day_of_week"] = df[date_col].dt.day_name()
    df["arrival_month"] = df[date_col].dt.month_name()

    before = len(df)
    df = df.dropna()
    dropped = before - len(df)
    if dropped:
        print(f"  WARNING {filename}: dropna() removed {dropped} of {before} rows")

    # Sort strictly by arrival date so the split never leaks the future into training
    df = df.sort_values(date_col).reset_index(drop=True)
    # The raw date is not a model feature; month and day-of-week carry what the model needs
    df = df.drop(columns=[date_col])

    if not is_train:
        return df, None, None

    # 3. Time-ordered split (70% train, 15% validation, 15% test)
    n = len(df)
    train_end = int(n * 0.70)
    val_end = int(n * 0.85)

    train_df = df.iloc[:train_end].copy()
    val_df = df.iloc[train_end:val_end].copy()
    test_df = df.iloc[val_end:].copy()

    return train_df, val_df, test_df


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", default="v2", choices=["v1", "v2"])
    args = ap.parse_args()
    v = args.version

    # v1 keeps writing into processed/ exactly as before; v2 goes to processed/v2/
    processed_dir = processed_root if v == "v1" else processed_root / v
    processed_dir.mkdir(parents=True, exist_ok=True)

    print(f"Preparing Main Dataset ({v})...")
    train_df, val_df, test_df = load_and_prepare(f"synthetic_{v}.csv", is_train=True)

    train_df.to_csv(processed_dir / "train.csv", index=False)
    val_df.to_csv(processed_dir / "val.csv", index=False)
    test_df.to_csv(processed_dir / "test.csv", index=False)

    print(f"Main Split complete: Train ({len(train_df)}), Val ({len(val_df)}), Test ({len(test_df)})")

    print("Preparing Stress Dataset...")
    stress_df, _, _ = load_and_prepare(f"synthetic_{v}_stress.csv", is_train=False)
    stress_df.to_csv(processed_dir / "stress.csv", index=False)

    print(f"Stress Prep complete: ({len(stress_df)} rows)")
    print(f"All processed data saved to {processed_dir}")
