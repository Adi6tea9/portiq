import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

# 1. Setup Paths
current_dir = Path(__file__).resolve().parent
processed_dir = current_dir.parent / "data" / "processed"
artifacts_dir = current_dir.parent / "artifacts"
reports_dir = current_dir.parent / "reports"

artifacts_dir.mkdir(parents=True, exist_ok=True)
reports_dir.mkdir(parents=True, exist_ok=True)

def evaluate_model(model: Pipeline, X: pd.DataFrame, y: pd.Series, dataset_name: str) -> dict:
    """Scores the model and prints standard regression metrics."""
    predictions = model.predict(X)
    mae = mean_absolute_error(y, predictions)
    rmse = mean_squared_error(y, predictions) ** 0.5
    r2 = r2_score(y, predictions)
    
    print(f"[{dataset_name}] MAE: {mae:.2f} days | RMSE: {rmse:.2f} days | R2: {r2:.2f}")
    return {"mae": mae, "rmse": rmse, "r2": r2}

if __name__ == "__main__":
    print("Loading prepared datasets...")
    train_df = pd.read_csv(processed_dir / "train.csv")
    test_df = pd.read_csv(processed_dir / "test.csv")
    stress_df = pd.read_csv(processed_dir / "stress.csv")

    # 2. Separate Features (X) from Target (y)
    target = "dwell_days"
    X_train, y_train = train_df.drop(columns=[target]), train_df[target]
    X_test, y_test = test_df.drop(columns=[target]), test_df[target]
    X_stress, y_stress = stress_df.drop(columns=[target]), stress_df[target]

    # 3. Categorize column types for the pipeline
    numeric_features = ["weight_kg", "forecast_capacity_utilization_pct", "container_size_ft"]
    categorical_features = [col for col in X_train.columns if col not in numeric_features]

    # 4. Build the Preprocessing Pipeline
    # Standardizes numbers (mean=0, variance=1) and One-Hot Encodes categories (e.g., "INNSA" -> [1, 0])
    preprocessor = ColumnTransformer(
        transformers=[
            ("num", StandardScaler(), numeric_features),
            ("cat", OneHotEncoder(handle_unknown="ignore"), categorical_features),
        ]
    )

    # 5. Define the Model Architecture
    # Random Forest is highly robust against overfitting on tabular logistics data
    model_pipeline = Pipeline([
        ("preprocessor", preprocessor),
        ("regressor", RandomForestRegressor(n_estimators=100, max_depth=15, random_state=42, n_jobs=-1))
    ])

    # 6. Train the Model!
    print("Training Random Forest Regressor... (this might take 5-15 seconds)")
    model_pipeline.fit(X_train, y_train)

    # 7. Evaluate the Predictions
    print("\n--- Evaluation Results ---")
    metrics = {
        "test_standard": evaluate_model(model_pipeline, X_test, y_test, "Test (Standard)"),
        "test_stress": evaluate_model(model_pipeline, X_stress, y_stress, "Stress (Disruption)")
    }

    # 8. Save Artifacts for the FastAPI Backend
    model_path = artifacts_dir / "dwell_model_v1.joblib"
    joblib.dump(model_pipeline, model_path)
    print(f"\nSUCCESS! Model saved to: {model_path}")

    metrics_path = reports_dir / "metrics.json"
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=4)
    print(f"Metrics saved to: {metrics_path}")