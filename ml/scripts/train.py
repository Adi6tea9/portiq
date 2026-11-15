"""
PortIQ dwell-time trainer (v1 and v2 data).

  python train.py                 # v2 data -> artifacts/dwell_model_v2.joblib, reports/metrics_v2.json
  python train.py --version v1    # v1 data -> artifacts/dwell_model_v1.joblib, reports/metrics_v1.json

What it does
  * Baselines: per-(port, direction) mean and median dwell, plus a global median fallback.
  * Candidates: RandomForest and HistGradientBoosting, with and without a log target.
    Hyperparameters are chosen on the VALIDATION set only. Test and stress are scored once.
  * Interval models: HistGradientBoosting quantile models (10th and 90th percentile).
  * Ablations: full features, no utilization signals, v1 features only.
  * The saved bundle says serve="model" only if the point model beats BOTH baselines on
    test AND stress. Otherwise serve="baseline" (the median baseline is stored in the bundle).

Results are on synthetic data. They show the method works, not real-world accuracy.
"""
import argparse
import itertools
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer, TransformedTargetRegressor
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

TARGET = "dwell_days"
NUMERIC_CANDIDATES = [
    "weight_kg",
    "forecast_capacity_utilization_pct",
    "container_size_ft",
    "exam_queue_len",
    "is_holiday",
]
V2_ONLY = ["customs_channel", "importer_type", "is_holiday", "exam_queue_len", "cargo_priority"]
UTIL_COLS = ["forecast_capacity_utilization_pct", "exam_queue_len"]
BASELINE_KEYS = ["port_code", "direction"]
UTIL_COL = "forecast_capacity_utilization_pct"

current_dir = Path(__file__).resolve().parent
data_root = current_dir.parent / "data" / "processed"
artifacts_dir = current_dir.parent / "artifacts"
reports_dir = current_dir.parent / "reports"


# ---------------------------------------------------------------- data helpers
def load_split(version: str) -> dict[str, pd.DataFrame]:
    d = data_root if version == "v1" else data_root / version
    out = {}
    for name in ["train", "val", "test", "stress"]:
        p = d / f"{name}.csv"
        if not p.exists():
            raise FileNotFoundError(f"Missing {p}. Run: python prepare_data.py --version {version}")
        out[name] = pd.read_csv(p, dtype={"hs_chapter": str})
    return out


def split_columns(columns: list[str]) -> tuple[list[str], list[str]]:
    num = [c for c in NUMERIC_CANDIDATES if c in columns]
    cat = [c for c in columns if c not in num]
    return num, cat


def make_X(df: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    X = df[columns].copy()
    _, cat = split_columns(columns)
    for c in cat:
        X[c] = X[c].astype(str)
    if "is_holiday" in X.columns:
        X["is_holiday"] = X["is_holiday"].astype(int)
    return X


def preprocessor(columns: list[str]) -> ColumnTransformer:
    num, cat = split_columns(columns)
    return ColumnTransformer(
        [
            ("num", "passthrough", num),
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), cat),
        ]
    )


# ---------------------------------------------------------------------- models
def build_point(cfg: dict, columns: list[str]):
    if cfg["kind"] == "rf":
        reg = RandomForestRegressor(n_estimators=300, n_jobs=-1, random_state=42, **cfg["params"])
    else:
        reg = HistGradientBoostingRegressor(random_state=42, early_stopping=False, **cfg["params"])
    if cfg["log"]:
        reg = TransformedTargetRegressor(regressor=reg, func=np.log1p, inverse_func=np.expm1)
    return Pipeline([("prep", preprocessor(columns)), ("reg", reg)])


def build_quantile(q: float, hgb_params: dict, columns: list[str]):
    reg = HistGradientBoostingRegressor(
        loss="quantile", quantile=q, random_state=42, early_stopping=False, **hgb_params
    )
    reg = TransformedTargetRegressor(regressor=reg, func=np.log1p, inverse_func=np.expm1)
    return Pipeline([("prep", preprocessor(columns)), ("reg", reg)])


def candidate_configs() -> list[dict]:
    cfgs = []
    for log in (False, True):
        for depth, leaf in itertools.product([12, None], [2, 5]):
            cfgs.append({"kind": "rf", "log": log, "params": {"max_depth": depth, "min_samples_leaf": leaf}})
        for lr, leaves in itertools.product([0.05, 0.1], [15, 31]):
            cfgs.append(
                {
                    "kind": "hgb",
                    "log": log,
                    "params": {"learning_rate": lr, "max_leaf_nodes": leaves, "max_iter": 300, "l2_regularization": 1.0},
                }
            )
    return cfgs


def cfg_name(cfg: dict) -> str:
    return f"{cfg['kind']}{'+log' if cfg['log'] else ''} {cfg['params']}"


# --------------------------------------------------------------------- metrics
def metrics(y, pred) -> dict:
    y = np.asarray(y)
    pred = np.asarray(pred)
    return {
        "mae": float(mean_absolute_error(y, pred)),
        "rmse": float(mean_squared_error(y, pred) ** 0.5),
        "r2": float(r2_score(y, pred)),
    }


def baseline_predict(train: pd.DataFrame, df: pd.DataFrame, stat: str) -> np.ndarray:
    keys = [k for k in BASELINE_KEYS if k in train.columns]
    fallback = train[TARGET].agg(stat)
    if not keys:
        return np.full(len(df), fallback)
    table = train.groupby(keys)[TARGET].agg(stat).rename("p").reset_index()
    merged = df[keys].merge(table, on=keys, how="left")["p"]
    return merged.fillna(fallback).to_numpy()


# ------------------------------------------------------------------------ main
def main(version: str) -> None:
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    reports_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading {version} data...")
    data = load_split(version)
    train, val, test, stress = data["train"], data["val"], data["test"], data["stress"]
    features = [c for c in train.columns if c != TARGET]
    print(f"Rows: train {len(train)}, val {len(val)}, test {len(test)}, stress {len(stress)}")
    print(f"Features ({len(features)}): {features}")

    report: dict = {"version": version, "features": features, "note": "Synthetic data: not real-world accuracy."}

    # 1. Baselines
    print("\n--- Baselines ---")
    base = {}
    for stat in ("mean", "median"):
        base[stat] = {
            "val": metrics(val[TARGET], baseline_predict(train, val, stat)),
            "test": metrics(test[TARGET], baseline_predict(train, test, stat)),
            "stress": metrics(stress[TARGET], baseline_predict(train, stress, stat)),
        }
        print(f"per-port {stat:6s}: test MAE {base[stat]['test']['mae']:.3f} | stress MAE {base[stat]['stress']['mae']:.3f}")
    report["baselines"] = base
    best_base_test = min(base[s]["test"]["mae"] for s in base)
    best_base_stress = min(base[s]["stress"]["mae"] for s in base)

    # 2. Hyperparameter search on VALIDATION only
    print("\n--- Model search (validation set only) ---")
    Xtr, Xva = make_X(train, features), make_X(val, features)
    results = []
    for cfg in candidate_configs():
        m = build_point(cfg, features).fit(Xtr, train[TARGET])
        mae = mean_absolute_error(val[TARGET], m.predict(Xva))
        results.append((mae, cfg))
        print(f"  val MAE {mae:.3f}  {cfg_name(cfg)}")
    results.sort(key=lambda t: t[0])
    best_cfg = results[0][1]
    print(f"Chosen: {cfg_name(best_cfg)} (val MAE {results[0][0]:.3f})")
    report["search"] = [{"val_mae": float(m), "config": cfg_name(c)} for m, c in results]
    report["chosen_config"] = {"kind": best_cfg["kind"], "log": best_cfg["log"], "params": best_cfg["params"]}

    # 3. Final point model, scored ONCE on test and stress
    point = build_point(best_cfg, features).fit(Xtr, train[TARGET])
    Xte, Xst = make_X(test, features), make_X(stress, features)
    p_test, p_stress = point.predict(Xte), point.predict(Xst)
    report["model"] = {"test": metrics(test[TARGET], p_test), "stress": metrics(stress[TARGET], p_stress)}
    print("\n--- Final model ---")
    for k in ("test", "stress"):
        r = report["model"][k]
        print(f"{k:6s}: MAE {r['mae']:.3f} | RMSE {r['rmse']:.3f} | R2 {r['r2']:.3f}")

    # 4. Quantile models for the 10-90 range (HGB params from the best HGB config in the search)
    hgb_params = next(c for _, c in results if c["kind"] == "hgb")["params"]
    q10 = build_quantile(0.10, hgb_params, features).fit(Xtr, train[TARGET])
    q90 = build_quantile(0.90, hgb_params, features).fit(Xtr, train[TARGET])
    def bounds(X, margin=0.0):
        lo, hi = q10.predict(X), q90.predict(X)
        lo, hi = np.minimum(lo, hi), np.maximum(lo, hi)
        return np.maximum(lo - margin, 0.0), hi + margin

    # Conformalized quantile regression: widen both ends by the margin (in days) that makes the
    # range cover ~80% of VALIDATION rows. Validation was not used to fit the quantile models.
    lo_v, hi_v = bounds(Xva)
    yv = val[TARGET].to_numpy()
    scores = np.maximum(lo_v - yv, yv - hi_v)
    level = min(1.0, np.ceil((len(scores) + 1) * 0.80) / len(scores))
    margin = float(max(0.0, np.quantile(scores, level)))

    cov = {}
    print(f"\n--- 10th-90th percentile range (target coverage 0.80; calibration margin {margin:.2f} days) ---")
    for name, df, X in (("test", test, Xte), ("stress", stress, Xst)):
        cov[name] = {}
        for tag, m in (("raw", 0.0), ("calibrated", margin)):
            lo, hi = bounds(X, m)
            cov[name][tag] = {
                "coverage": float(((df[TARGET] >= lo) & (df[TARGET] <= hi)).mean()),
                "mean_width_days": float((hi - lo).mean()),
            }
            print(f"{name:6s} {tag:10s}: coverage {cov[name][tag]['coverage']:.2f} | "
                  f"mean width {cov[name][tag]['mean_width_days']:.2f} days")
    cov["margin_days"] = margin
    report["interval"] = cov

    # 5. Ablations (same config, fewer features)
    print("\n--- Ablations (test MAE / stress MAE) ---")
    variants = {
        "full": features,
        "no_utilization": [c for c in features if c not in UTIL_COLS],
        "v1_features_only": [c for c in features if c not in V2_ONLY],
    }
    report["ablations"] = {}
    for name, cols in variants.items():
        m = build_point(best_cfg, cols).fit(make_X(train, cols), train[TARGET])
        t = mean_absolute_error(test[TARGET], m.predict(make_X(test, cols)))
        s = mean_absolute_error(stress[TARGET], m.predict(make_X(stress, cols)))
        report["ablations"][name] = {"test_mae": float(t), "stress_mae": float(s), "n_features": len(cols)}
        print(f"{name:18s}: {t:.3f} / {s:.3f}  ({len(cols)} features)")

    # 6. Dwell-by-utilization curve (demo evidence)
    if UTIL_COL in test.columns:
        bins = [0, 50, 60, 70, 80, 90, 101]
        grp = pd.cut(test[UTIL_COL], bins=bins, right=False)
        curve = (
            pd.DataFrame({"bin": grp, "actual": test[TARGET].to_numpy(), "predicted": p_test})
            .groupby("bin", observed=True)
            .mean()
        )
        counts = grp.value_counts()
        print("\n--- Dwell by utilization (test set, mean days) ---")
        report["utilization_curve"] = {}
        for b, row in curve.iterrows():
            print(f"{str(b):12s} actual {row['actual']:.2f} | predicted {row['predicted']:.2f} | n={int(counts[b])}")
            report["utilization_curve"][str(b)] = {
                "actual": float(row["actual"]),
                "predicted": float(row["predicted"]),
                "n": int(counts[b]),
            }

    # 7. Serve decision: the model must beat BOTH baselines on test AND stress
    beats = report["model"]["test"]["mae"] < best_base_test and report["model"]["stress"]["mae"] < best_base_stress
    serve = "model" if beats else "baseline"
    report["serve"] = serve
    print(f"\nServe decision: {serve.upper()} "
          f"(model test {report['model']['test']['mae']:.3f} vs best baseline {best_base_test:.3f}; "
          f"stress {report['model']['stress']['mae']:.3f} vs {best_base_stress:.3f})")

    # 8. Save artifacts
    keys = [k for k in BASELINE_KEYS if k in train.columns]
    baseline_table = (
        train.groupby(keys)[TARGET].median().rename("median_days").reset_index().to_dict("records") if keys else []
    )
    bundle = {
        "version": version,
        "serve": serve,
        "feature_columns": features,
        "point_model": point,
        "q10_model": q10,
        "q90_model": q90,
        "interval_margin_days": margin,  # API: lo = max(0, q10 - margin), hi = q90 + margin
        "baseline": {"keys": keys, "stat": "median", "table": baseline_table, "global": float(train[TARGET].median())},
    }
    model_path = artifacts_dir / f"dwell_model_{version}.joblib"
    joblib.dump(bundle, model_path)
    meta = {
        "version": version,
        "serve": serve,
        "features": features,
        "chosen_config": report["chosen_config"],
        "interval_margin_days": margin,
        "train_rows": len(train),
        "note": "Trained on synthetic data calibrated to published Indian port dwell averages. Not real-world accuracy.",
    }
    (artifacts_dir / f"dwell_model_{version}.meta.json").write_text(json.dumps(meta, indent=2))
    metrics_path = reports_dir / f"metrics_{version}.json"
    metrics_path.write_text(json.dumps(report, indent=2))
    print(f"\nSaved model:   {model_path}")
    print(f"Saved metrics: {metrics_path}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", default="v2", choices=["v1", "v2"])
    main(ap.parse_args().version)