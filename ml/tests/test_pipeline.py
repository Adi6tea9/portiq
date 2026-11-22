"""B06 tests: reproducibility, schema and range validation, time split, no test-row fitting,
calibration, and the saved artifact + metadata.

Run from the repo root (the generator imports the API's capacity simulator):
    python -m pytest ml/tests -q
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import pytest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
ARTIFACTS = SCRIPTS.parent / "artifacts"
sys.path.insert(0, str(SCRIPTS))

import generate_synthetic_v2 as gen  # noqa: E402
import prepare_data  # noqa: E402
import train  # noqa: E402

ROWS = 1500


def frame_hash(df: pd.DataFrame) -> str:
    return hashlib.sha256(df.to_csv(index=False).encode()).hexdigest()


@pytest.fixture(scope="module")
def main_set() -> pd.DataFrame:
    df, _ = gen.generate_dataset(ROWS, is_stress=False, seed_offset=0)
    return df


# ------------------------------------------------------------------ generator


def test_same_seed_gives_identical_data(main_set: pd.DataFrame) -> None:
    again, _ = gen.generate_dataset(ROWS, is_stress=False, seed_offset=0)
    other, _ = gen.generate_dataset(ROWS, is_stress=False, seed_offset=7)

    assert frame_hash(again) == frame_hash(main_set)
    assert frame_hash(other) != frame_hash(main_set)


def test_generated_data_passes_validation_and_keeps_hs_chapter_as_text(
    main_set: pd.DataFrame,
) -> None:
    prepare_data.validate(main_set, "generated")
    assert main_set["hs_chapter"].map(type).eq(str).all()
    assert {"02", "08"} <= set(main_set["hs_chapter"])  # zero padding survives


def test_calibration_matches_the_reference_means(main_set: pd.DataFrame) -> None:
    """Spec 10: simulated per port/direction means within 15% of the reference means.

    This checks the data, not the model. Clipping to [0.1, 30] after rescaling moves the means
    slightly, so they are close but not exact.
    """
    for (port, direction), target in gen.BASE_MEANS.items():
        rows = main_set[(main_set.port_code == port) & (main_set.direction == direction)]
        assert abs(rows["dwell_days"].mean() - target) / target < 0.15, (port, direction)


def test_stress_set_reuses_the_main_calibration_and_is_harder(main_set: pd.DataFrame) -> None:
    _, scale = gen.generate_dataset(ROWS, is_stress=False, seed_offset=0)
    stress, stress_scale = gen.generate_dataset(500, is_stress=True, seed_offset=1, scale=scale)

    assert stress_scale == scale
    assert stress["dwell_days"].mean() > main_set["dwell_days"].mean()


# ------------------------------------------------------------- prepare_data


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda df: df.drop(columns=["weight_kg"]), "missing columns"),
        (lambda df: df.assign(weight_kg=df["weight_kg"].where(df.index != 0)), "null values"),
        (lambda df: df.assign(port_code="XXNOP"), "unexpected port_code"),
        (lambda df: df.assign(weight_kg=0.0), "weight_kg outside"),
        (lambda df: df.assign(dwell_days=45.0), "dwell_days outside"),
        (lambda df: df.assign(hs_chapter="8"), "two-digit string"),
    ],
)
def test_validation_rejects_bad_data(main_set: pd.DataFrame, mutate, message: str) -> None:
    with pytest.raises(ValueError, match=message):
        prepare_data.validate(mutate(main_set.copy()), "bad")


def test_split_is_time_ordered_70_15_15(main_set: pd.DataFrame, tmp_path, monkeypatch) -> None:
    shuffled = main_set.sample(frac=1.0, random_state=3)
    # A marker of each row's true date order survives the split (the date itself is dropped).
    shuffled["date_rank"] = shuffled["expected_arrival_at"].rank(method="first").astype(int)
    shuffled.to_csv(tmp_path / "data.csv", index=False)
    monkeypatch.setattr(prepare_data, "raw_dir", tmp_path)

    train_df, val_df, test_df = prepare_data.load_and_prepare("data.csv")

    assert (len(train_df), len(val_df), len(test_df)) == (1050, 225, 225)
    assert train_df["date_rank"].max() < val_df["date_rank"].min()
    assert val_df["date_rank"].max() < test_df["date_rank"].min()
    assert train_df["hs_chapter"].map(type).eq(str).all()
    assert {"arrival_day_of_week", "arrival_month"} <= set(train_df.columns)


# ------------------------------------------------------------------ training


def test_preprocessing_is_fitted_on_training_rows_only(main_set: pd.DataFrame) -> None:
    features = [c for c in main_set.columns if c not in ("dwell_days", "expected_arrival_at")]
    train_rows = main_set.iloc[:1000].copy()
    test_rows = main_set.iloc[1000:].copy()
    test_rows.loc[test_rows.index[0], "shipping_line"] = "only-in-test"

    cfg = {"kind": "hgb", "log": True,
           "params": {"learning_rate": 0.1, "max_leaf_nodes": 15, "max_iter": 50}}
    model = train.build_point(cfg, features).fit(train.make_X(train_rows, features),
                                                 train_rows["dwell_days"])
    encoder = model.named_steps["prep"].named_transformers_["cat"]
    _, cat_cols = train.split_columns(features)

    for col, categories in zip(cat_cols, encoder.categories_, strict=True):
        assert set(categories) == set(train_rows[col].astype(str)), col
    # An unseen test category is ignored, not an error, and still gives a finite prediction.
    pred = model.predict(train.make_X(test_rows.head(1), features))
    assert np.isfinite(pred).all()


def test_baselines_and_metrics() -> None:
    train_rows = pd.DataFrame(
        {"port_code": ["A", "A", "B", "B"], "direction": ["import"] * 4,
         "dwell_days": [1.0, 3.0, 10.0, 12.0]}
    )
    query = pd.DataFrame({"port_code": ["A", "B", "C"], "direction": ["import"] * 3})

    assert train.baseline_predict(train_rows, query, "median").tolist() == [2.0, 11.0, 6.5]
    assert train.metrics([1, 2], [1, 4])["mae"] == pytest.approx(1.0)


# --------------------------------------------------------- artifact + metadata

needs_artifact = pytest.mark.skipif(
    not (ARTIFACTS / "dwell_model_v2.joblib").exists(),
    reason="train the model first: python train.py --version v2",
)


@needs_artifact
def test_artifact_loads_and_predicts_finite_non_negative_days() -> None:
    bundle = joblib.load(ARTIFACTS / "dwell_model_v2.joblib")
    meta = json.loads((ARTIFACTS / "model_metadata_v2.json").read_text(encoding="utf-8"))
    row = {
        name: (spec["categories"][0] if spec["type"] == "categorical"
               else meta["numeric_training_ranges"][name]["min"])
        for name, spec in meta["feature_schema"].items()
    }
    frame = train.make_X(pd.DataFrame([row]), bundle["feature_columns"])

    for key in ("point_model", "q10_model", "q90_model"):
        pred = bundle[key].predict(frame)
        assert np.isfinite(pred).all() and (pred >= 0).all(), key


@needs_artifact
def test_metadata_has_every_spec_field() -> None:
    meta = json.loads((ARTIFACTS / "model_metadata_v2.json").read_text(encoding="utf-8"))
    required = {
        "model_version", "dataset_version", "created_at", "target_name", "target_units",
        "feature_schema", "preprocessing", "numeric_training_ranges", "evaluation_metrics",
        "baseline_metrics", "training_source_type", "limitations", "intended_use", "serve",
    }
    assert required <= set(meta)
    assert meta["training_source_type"] == "synthetic"
    assert meta["target_units"] == "days"
    for name in ("weight_kg", "forecast_capacity_utilization_pct"):
        low, high = meta["numeric_training_ranges"][name].values()
        assert low < high
    # Selection rule: "model" only if it beats the best baseline on both test and stress.
    best = {split: min(b[split]["mae"] for b in meta["baseline_metrics"].values())
            for split in ("test", "stress")}
    beats = all(meta["evaluation_metrics"][s]["mae"] < best[s] for s in best)
    assert meta["serve"] == ("model" if beats else "baseline")


# ------------------------------------------------------------- reference data

import evaluate  # noqa: E402

needs_reference = pytest.mark.skipif(
    not list(evaluate.REFERENCE_DIR.glob("port_dwell_*.csv")),
    reason="reference files missing from ml/data/reference",
)


@needs_reference
def test_reference_files_reproduce_the_generator_base_means() -> None:
    ref = evaluate.load_reference()
    pooled = evaluate.reference_means(ref, evaluate.BASE_YEARS)

    assert set(pooled) == set(gen.BASE_MEANS)
    for key, (days, months) in pooled.items():
        assert days == pytest.approx(gen.BASE_MEANS[key], abs=0.005), key
        assert months == 21  # 24 months minus the Apr-Jun 2020 lockdown


@needs_reference
def test_simulated_means_are_within_15_percent_of_every_reference_year(
    main_set: pd.DataFrame,
) -> None:
    ref = evaluate.load_reference()
    for year in sorted(ref["year"].unique()):
        rows = evaluate.compare(main_set, evaluate.reference_means(ref, (int(year),)))
        assert rows and all(row["within_tolerance"] for row in rows.values()), (year, rows)


@needs_reference
def test_lockdown_multiplier_supports_the_stress_disruption_range() -> None:
    lock = evaluate.lockdown_multiplier(evaluate.load_reference())
    low, high = lock["generator_disruption_range"]
    # The generator's x2-x3 disruption sits inside the real lockdown range.
    assert lock["ratio_min"] <= low and high <= lock["ratio_max"]


def test_reference_loader_handles_bom_and_rejects_bad_files(tmp_path) -> None:
    good = "port,month,year,category,dwell_hours\nJNPT,JANUARY,2020,Import,24\n"
    (tmp_path / "port_dwell_2020.csv").write_text("﻿" + good, encoding="utf-8")
    ref = evaluate.load_reference(tmp_path)
    assert ref.loc[0, "dwell_days"] == pytest.approx(1.0)
    assert not ref.loc[0, "lockdown"]

    (tmp_path / "port_dwell_2021.csv").write_text(good.replace("2020", "2021"), encoding="utf-8")
    (tmp_path / "port_dwell_2022.csv").write_text("port,hours\nJNPT,1\n", encoding="utf-8")
    with pytest.raises(ValueError, match="reference columns"):
        evaluate.load_reference(tmp_path)
