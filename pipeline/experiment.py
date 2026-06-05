"""Phase 5 experimentation - measure improved feature sets against the baseline
using the SAME walk-forward harness as pipeline.backtest, so results are
comparable. This module is for measurement only; nothing here ships until a
variant clears the publisher-median baseline in backtest (D-013).

v1   = current shipping features (metacritic, raw publisher_encoded, pub stats).
v2   = richer features, no new data: smoothed target-encoded publisher +
       release-date seasonality (year/month/quarter) + pub stats + metacritic.
"""

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error

from . import config
from .backtest import _prepare, _walk_forward_folds, _make_model


def _featurize_v2(train_df, alpha=10.0):
    """Build a v2 featurizer using only train_df-derived statistics (no leakage).
    Returns a function df -> feature DataFrame."""
    med_meta = train_df["metacritic_score"].median()
    if pd.isna(med_meta):
        med_meta = 75.0
    global_mean_days = train_df["days_to_service"].mean()

    # Smoothed target encoding of publisher (mean days, shrunk toward global).
    agg = train_df.groupby("primary_publisher")["days_to_service"].agg(["sum", "count"])
    te = (agg["sum"] + global_mean_days * alpha) / (agg["count"] + alpha)
    te_map = te.to_dict()

    stats = train_df.groupby("primary_publisher").agg(
        pub_avg_days=("days_to_service", "mean"),
        pub_count=("days_to_service", "count"),
        pub_std=("days_to_service", "std"),
    )
    stats["pub_cv"] = (stats["pub_std"] / stats["pub_avg_days"]).fillna(0.5)
    cv_map = stats["pub_cv"].to_dict()
    cnt_map = stats["pub_count"].to_dict()

    def featurize(df):
        d = df.copy()
        rel = pd.to_datetime(d["release_date"], errors="coerce")
        d["metacritic_score"] = d["metacritic_score"].fillna(med_meta)
        d["pub_te"] = d["primary_publisher"].map(te_map).fillna(global_mean_days)
        d["pub_count"] = d["primary_publisher"].map(cnt_map).fillna(0)
        d["pub_cv"] = d["primary_publisher"].map(cv_map).fillna(0.5)
        d["rel_year"] = rel.dt.year.fillna(rel.dt.year.median() if rel.notna().any() else 2015)
        d["rel_month"] = rel.dt.month.fillna(6)
        d["rel_quarter"] = rel.dt.quarter.fillna(2)
        cols = ["metacritic_score", "pub_te", "pub_count", "pub_cv", "rel_year", "rel_month", "rel_quarter"]
        return d[cols].astype(float).fillna(0.0)

    return featurize


def backtest_v2(name, input_path, n_folds=4):
    import os
    if not os.path.exists(input_path):
        return {"platform": name, "status": "missing_input"}
    df = _prepare(pd.read_csv(input_path))
    if len(df) < 60:
        return {"platform": name, "status": "insufficient_data", "samples": len(df)}

    folds = _walk_forward_folds(df, n_folds)
    v2_maes, base_pub_maes, base_global_maes = [], [], []
    for train_df, test_df in folds:
        featurize = _featurize_v2(train_df)
        Xtr, Xte = featurize(train_df), featurize(test_df)
        model = _make_model().fit(Xtr, np.log(train_df["days_to_service"]))
        pred = np.exp(model.predict(Xte))
        actual = test_df["days_to_service"].values
        v2_maes.append(mean_absolute_error(actual, pred))

        gmed = train_df["days_to_service"].median()
        base_global_maes.append(mean_absolute_error(actual, np.full(len(actual), gmed)))
        pub_med = train_df.groupby("primary_publisher")["days_to_service"].median()
        pub_pred = test_df["primary_publisher"].map(pub_med).fillna(gmed).values
        base_pub_maes.append(mean_absolute_error(actual, pub_pred))

    v2 = float(np.mean(v2_maes))
    base_pub = float(np.mean(base_pub_maes))
    base_global = float(np.mean(base_global_maes))
    best_baseline = min(base_pub, base_global)
    return {
        "platform": name,
        "v2_mae_walkforward": round(v2, 1),
        "baseline_publisher_median": round(base_pub, 1),
        "baseline_global_median": round(base_global, 1),
        "v2_beats_baseline": bool(v2 < best_baseline),
        "v2_improvement_vs_best_baseline_days": round(best_baseline - v2, 1),
    }


def run(n_folds=4):
    return [backtest_v2(p["name"], p["input"], n_folds=n_folds) for p in config.TRAIN_PLATFORMS]


if __name__ == "__main__":
    import json
    print(json.dumps(run(), indent=2))
