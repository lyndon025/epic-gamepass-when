"""Stage 3 - train per-platform quantile models from the canonical datasets.

Phase 5: richer features (smoothed target-encoded publisher + release-date
seasonality + publisher stats + metacritic) and quantile regression (P10/P50/P90)
so the API can return honest intervals. Each platform is saved as ONE bundle
pickle (models/model_<key>.pkl) containing the three quantile models plus the
featurization maps the backend needs to score a query the same way.

Honest accuracy is measured by pipeline.backtest (walk-forward); the metrics
returned here are quick in-sample sanity numbers only.
"""

import os
import pickle
import warnings

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import mean_absolute_error

from . import config

warnings.filterwarnings("ignore")

DATE_COLUMN = "Added to Service"
DATE_FORMATS = ["%m/%d/%Y", "%Y-%m-%d", "%d/%m/%Y", "%Y-%m-%d %H:%M:%S"]
QUANTILES = [0.1, 0.5, 0.9]
# Feature order is part of the serving contract; the backend builds its row in
# exactly this order (see apps/backend/services/predictor.py).
FEATURES = ["metacritic_score", "pub_te", "pub_count", "pub_cv", "rel_year", "rel_month", "rel_quarter"]
TE_SMOOTHING = 10.0


def parse_date_robust(date_str):
    if pd.isna(date_str):
        return pd.NaT
    date_str = str(date_str).strip()
    for fmt in DATE_FORMATS:
        try:
            return pd.to_datetime(date_str, format=fmt)
        except Exception:
            continue
    return pd.to_datetime(date_str, errors="coerce")


def _prepare(df):
    df = df[df["game_name"].notna()].copy()
    df["added_to_service"] = df[DATE_COLUMN].apply(parse_date_robust)
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


def _build_featurizer(train_df):
    """Compute the v2 featurization maps from train_df. Returns (params, featurize).
    params is a JSON-able dict saved in the bundle so the backend can reproduce the
    exact same feature row at serve time."""
    median_meta = train_df["metacritic_score"].median()
    if pd.isna(median_meta):
        median_meta = 75.0
    global_mean_days = float(train_df["days_to_service"].mean())

    agg = train_df.groupby("primary_publisher")["days_to_service"].agg(["sum", "count", "mean", "std"])
    te = (agg["sum"] + global_mean_days * TE_SMOOTHING) / (agg["count"] + TE_SMOOTHING)
    cv = (agg["std"] / agg["mean"]).fillna(0.5)

    rel = pd.to_datetime(train_df["release_date"], errors="coerce")
    rel_year_med = float(rel.dt.year.median()) if rel.notna().any() else 2015.0

    params = {
        "features": FEATURES,
        "quantiles": QUANTILES,
        "te_map": te.to_dict(),
        "pub_count": agg["count"].astype(float).to_dict(),
        "pub_avg_days": agg["mean"].astype(float).to_dict(),
        "pub_cv": cv.to_dict(),
        "global_mean_days": global_mean_days,
        "median_meta": float(median_meta),
        "rel_year_med": rel_year_med,
    }

    def featurize(df):
        d = df.copy()
        rel = pd.to_datetime(d["release_date"], errors="coerce")
        out = pd.DataFrame()
        out["metacritic_score"] = pd.to_numeric(d["metacritic_score"], errors="coerce").fillna(median_meta)
        out["pub_te"] = d["primary_publisher"].map(params["te_map"]).fillna(global_mean_days)
        out["pub_count"] = d["primary_publisher"].map(params["pub_count"]).fillna(0.0)
        out["pub_cv"] = d["primary_publisher"].map(params["pub_cv"]).fillna(0.5)
        out["rel_year"] = rel.dt.year.fillna(rel_year_med)
        out["rel_month"] = rel.dt.month.fillna(6)
        out["rel_quarter"] = rel.dt.quarter.fillna(2)
        return out[FEATURES].astype(float)

    return params, featurize


def _make_quantile_model(alpha):
    return xgb.XGBRegressor(
        objective="reg:quantileerror", quantile_alpha=alpha,
        n_estimators=300, learning_rate=0.05, max_depth=5, min_child_weight=3,
        subsample=0.8, colsample_bytree=0.8, reg_alpha=0.1, reg_lambda=0.1,
        random_state=42, n_jobs=-1,
    )


def train_one(platform):
    name = platform["name"]
    input_path = platform["input"]
    print("=" * 60)
    print(f"PROCESSING: {name}  ({input_path})")
    if not os.path.exists(input_path):
        print(f"File not found: {input_path}")
        return {"platform": name, "status": "missing_input"}

    df = _prepare(pd.read_csv(input_path))
    print(f"Valid training samples: {len(df)}")
    if len(df) < 20:
        print("Not enough training data (<20). Skipping.")
        return {"platform": name, "status": "insufficient_data", "samples": len(df)}

    params, featurize = _build_featurizer(df)
    X = featurize(df)
    y = np.log(df["days_to_service"])

    models = {}
    for q in QUANTILES:
        models[str(q)] = _make_quantile_model(q).fit(X, y)

    # Quick in-sample sanity (honest accuracy comes from pipeline.backtest).
    p50_days = np.exp(models["0.5"].predict(X))
    mae = float(mean_absolute_error(df["days_to_service"], p50_days))

    bundle = {"models": models, **params}
    art = config.artifacts(name)
    os.makedirs(config.MODELS_DIR, exist_ok=True)
    with open(os.path.join(config.MODELS_DIR, art["bundle"]), "wb") as f:
        pickle.dump(bundle, f)
    print(f"Saved {art['bundle']} (in-sample P50 MAE {mae:.0f}d) to {config.MODELS_DIR}")

    return {
        "platform": name, "status": "ok", "samples": len(df),
        "publishers": len(params["te_map"]), "insample_p50_mae_days": round(mae, 1),
    }


def run():
    results = []
    for platform in config.TRAIN_PLATFORMS:
        try:
            results.append(train_one(platform))
        except Exception as e:
            print(f"Error processing {platform['name']}: {e}")
            results.append({"platform": platform["name"], "status": "error", "error": str(e)})
    return results


if __name__ == "__main__":
    import json
    print(json.dumps(run(), indent=2))
