"""Phase 4 - honest, time-based backtesting + naive baselines.

The training script (train.py) reports a RANDOM-split MAE, which leaks the future
into the past for a time-to-event target and is optimistic. This module instead:
  - sorts each platform's history by when the game was added to the service,
  - runs expanding-window walk-forward CV (train on the past, test on the future),
  - computes all publisher features on the TRAIN fold only (no leakage),
  - compares the model against two naive baselines:
      * global-median days-to-service,
      * per-publisher-median (fallback to global for unseen publishers),
  - and also reports the old random-split MAE for contrast.

A model only "earns its keep" if its walk-forward MAE beats the best baseline.
"""

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split

from . import config
from .train import _build_featurizer, organic, parse_date_robust

# v2 features (match pipeline.train): smoothed target-encoded publisher + release
# seasonality + publisher stats + metacritic. This is what ships, so the gate
# measures the shipping model.
FEATURES = ["metacritic_score", "pub_te", "pub_count", "pub_cv", "rel_year", "rel_month", "rel_quarter"]
TE_SMOOTHING = 10.0


def _make_model():
    # Identical hyperparameters to pipeline.train, so the backtest measures the
    # same model that ships.
    return xgb.XGBRegressor(
        n_estimators=300, learning_rate=0.05, max_depth=5, min_child_weight=3,
        subsample=0.8, colsample_bytree=0.8, reg_alpha=0.1, reg_lambda=0.1,
        random_state=42, n_jobs=-1,
    )


def _prepare(df):
    """Clean + derive the modelling columns (mirrors train.py's filtering)."""
    df = df[df["game_name"].notna()].copy()
    df["added_to_service"] = df["Added to Service"].apply(parse_date_robust)
    df["release_date"] = df["release_date"].apply(parse_date_robust)
    df["days_to_service"] = (df["added_to_service"] - df["release_date"]).dt.days
    df["primary_publisher"] = df["publisher"].apply(
        lambda x: str(x).split(",")[0].strip() if pd.notna(x) else "Unknown"
    )
    df["metacritic_score"] = pd.to_numeric(df.get("metacritic_score"), errors="coerce")
    df = df[
        (df["days_to_service"].notna())
        & (df["days_to_service"] >= 1)
        & (df["primary_publisher"] != "Unknown")
        & (df["primary_publisher"] != "")
    ].copy()
    return df


def _fit_featurizer(train_df):
    """The SHIPPING featurizer, fitted on train_df only.

    Delegates to pipeline.train rather than keeping its own copy: a gate that
    rebuilds features its own way can drift from the model that actually ships
    and end up approving something it never tested. Statistics still come from
    the training fold alone, so test folds see no future information.
    """
    _params, featurize = _build_featurizer(train_df)
    return featurize


def _walk_forward_folds(df, n_folds):
    """Expanding-window folds over time. Fold k trains on the first k segments and
    tests on segment k+1."""
    df = df.sort_values("added_to_service").reset_index(drop=True)
    n = len(df)
    bounds = [round(n * k / (n_folds + 1)) for k in range(n_folds + 2)]
    folds = []
    for k in range(1, n_folds + 1):
        train_df = df.iloc[: bounds[k]]
        test_df = df.iloc[bounds[k]: bounds[k + 1]]
        if len(train_df) >= 30 and len(test_df) >= 5:
            folds.append((train_df, test_df))
    return folds


def _random_split_mae(df):
    """Reproduce train.py's optimistic random-split MAE for contrast."""
    featurize = _fit_featurizer(df)  # stats on full data, like train.py
    X = featurize(df)
    y = np.log(df["days_to_service"])
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=42)
    m = _make_model().fit(Xtr, ytr)
    return float(mean_absolute_error(np.exp(yte), np.exp(m.predict(Xte))))


def backtest_platform(name, input_path, n_folds=4):
    import os
    if not os.path.exists(input_path):
        return {"platform": name, "status": "missing_input"}
    # Scored on the question the forecast is asked: organic arrivals. Launch
    # deals are answered from the catalogue, so testing the forecast on them
    # would grade it on something it never has to predict.
    df = organic(_prepare(pd.read_csv(input_path)))
    if len(df) < 60:
        return {"platform": name, "status": "insufficient_data", "samples": len(df)}

    folds = _walk_forward_folds(df, n_folds)
    model_maes, base_global_maes, base_pub_maes = [], [], []
    for train_df, test_df in folds:
        featurize = _fit_featurizer(train_df)
        Xtr, Xte = featurize(train_df), featurize(test_df)
        model = _make_model().fit(Xtr, np.log(train_df["days_to_service"]))
        pred = np.exp(model.predict(Xte))
        actual = test_df["days_to_service"].values
        model_maes.append(mean_absolute_error(actual, pred))

        gmed = train_df["days_to_service"].median()
        base_global_maes.append(mean_absolute_error(actual, np.full(len(actual), gmed)))

        pub_med = train_df.groupby("primary_publisher")["days_to_service"].median()
        pub_pred = test_df["primary_publisher"].map(pub_med).fillna(gmed).values
        base_pub_maes.append(mean_absolute_error(actual, pub_pred))

    if not model_maes:
        return {"platform": name, "status": "no_valid_folds", "samples": len(df)}

    model_mae = float(np.mean(model_maes))
    base_global = float(np.mean(base_global_maes))
    base_pub = float(np.mean(base_pub_maes))
    best_baseline = min(base_global, base_pub)
    return {
        "platform": name,
        "status": "ok",
        "samples": len(df),
        "folds": len(folds),
        "model_mae_walkforward": round(model_mae, 1),
        "baseline_global_median": round(base_global, 1),
        "baseline_publisher_median": round(base_pub, 1),
        "model_mae_randomsplit": round(_random_split_mae(df), 1),
        "beats_baseline": bool(model_mae < best_baseline),
        "improvement_vs_best_baseline_days": round(best_baseline - model_mae, 1),
    }


def run(n_folds=4):
    """Backtest every platform; returns a list of per-platform reports."""
    results = []
    for platform in config.TRAIN_PLATFORMS:
        results.append(backtest_platform(platform["name"], platform["input"], n_folds=n_folds))
    return results


if __name__ == "__main__":
    import json
    print(json.dumps(run(), indent=2))
