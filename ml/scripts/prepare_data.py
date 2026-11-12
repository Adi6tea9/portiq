import pandas as pd
from pathlib import Path

# Setup paths
current_dir = Path(__file__).resolve().parent
raw_dir = current_dir.parent / "data" / "raw"
processed_dir = current_dir.parent / "data" / "processed"
processed_dir.mkdir(parents=True, exist_ok=True)

def load_and_prepare(filename: str, is_train: bool = True) -> tuple[pd.DataFrame, pd.DataFrame | None, pd.DataFrame | None]:
    file_path = raw_dir / filename
    if not file_path.exists():
        raise FileNotFoundError(f"Cannot find {file_path}. Run generate_synthetic.py first.")

    df = pd.read_csv(file_path)

    # 1. Schema Validation & Types
    if "hs_chapter" in df.columns:
        df["hs_chapter"] = df["hs_chapter"].astype(str).str.zfill(2)
    
    # 2. Derive new time features (Auto-detect the date column name!)
    date_col = None
    for col in ["arrival_date", "expected_arrival_at", "arrival_time", "date"]:
        if col in df.columns:
            date_col = col
            break
            
    if date_col:
        df[date_col] = pd.to_datetime(df[date_col])
        df["arrival_day_of_week"] = df[date_col].dt.day_name()
        df["arrival_month"] = df[date_col].dt.month_name()
        
        df = df.dropna()
        # Sort strictly by arrival date to prevent data leaking into the past
        df = df.sort_values(date_col).reset_index(drop=True)
        # Drop the raw date since the model only needs month/day_of_week
        df = df.drop(columns=[date_col])
    else:
        # Fallback if no date column exists at all
        df = df.dropna()

    if not is_train:
        return df, None, None

    # 3. Time-ordered split (70% train, 15% validation, 15% test) per Section 11.1
    n = len(df)
    train_end = int(n * 0.70)
    val_end = int(n * 0.85)

    train_df = df.iloc[:train_end].copy()
    val_df = df.iloc[train_end:val_end].copy()
    test_df = df.iloc[val_end:].copy()

    return train_df, val_df, test_df

if __name__ == "__main__":
    print("Preparing Main Dataset...")
    train_df, val_df, test_df = load_and_prepare("synthetic_v1.csv", is_train=True)
    
    train_df.to_csv(processed_dir / "train.csv", index=False)
    val_df.to_csv(processed_dir / "val.csv", index=False)
    test_df.to_csv(processed_dir / "test.csv", index=False)
    
    print(f"Main Split complete: Train ({len(train_df)}), Val ({len(val_df)}), Test ({len(test_df)})")

    print("Preparing Stress Dataset...")
    stress_df, _, _ = load_and_prepare("synthetic_v1_stress.csv", is_train=False)
    stress_df.to_csv(processed_dir / "stress.csv", index=False)
    
    print(f"Stress Prep complete: ({len(stress_df)} rows)")
    print(f"All processed data saved to {processed_dir}")