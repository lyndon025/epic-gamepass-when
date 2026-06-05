"""Stage 3 - train an XGBoost model per platform from the canonical datasets.

Ported from the original train_models.py; modelling logic unchanged. Inputs come
from data/canonical and all artifacts are written to models/ (one location).
Returns a per-platform metrics dict so the orchestrator notebook can display it.
"""

import os
import pickle
import warnings

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

from . import config

warnings.filterwarnings("ignore")

DATE_COLUMN = "Added to Service"
DATE_FORMATS = ["%m/%d/%Y", "%Y-%m-%d", "%d/%m/%Y", "%Y-%m-%d %H:%M:%S"]


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


def train_one(platform):
    name = platform["name"]
    input_path = platform["input"]
    print("=" * 60)
    print(f"PROCESSING: {name}")
    print(f"Input: {input_path}")

    if not os.path.exists(input_path):
        print(f"File not found: {input_path}")
        return {"platform": name, "status": "missing_input"}

    df = pd.read_csv(input_path)
    df_clean = df[df["game_name"].notna()].copy()

    df_clean["added_to_service"] = df_clean[DATE_COLUMN].apply(parse_date_robust)
    df_clean["release_date"] = df_clean["release_date"].apply(parse_date_robust)
    df_clean["days_to_service"] = (df_clean["added_to_service"] - df_clean["release_date"]).dt.days
    df_clean["primary_publisher"] = df_clean["publisher"].apply(
        lambda x: str(x).split(",")[0].strip() if pd.notna(x) else "Unknown"
    )

    training_data = df_clean[
        (df_clean["days_to_service"].notna())
        & (df_clean["days_to_service"] >= 1)
        & (df_clean["primary_publisher"] != "Unknown")
        & (df_clean["primary_publisher"] != "")
    ].copy()

    print(f"Total rows: {len(df_clean)} | Valid training samples: {len(training_data)}")
    if len(training_data) < 20:
        print("Not enough training data (<20). Skipping.")
        return {"platform": name, "status": "insufficient_data", "samples": len(training_data)}

    if "metacritic_score" not in training_data.columns:
        training_data["metacritic_score"] = np.nan
    training_data["metacritic_score"] = pd.to_numeric(training_data["metacritic_score"], errors="coerce")
    median_metacritic = training_data["metacritic_score"].median()
    if pd.isna(median_metacritic):
        median_metacritic = 75.0
    training_data["metacritic_score"] = training_data["metacritic_score"].fillna(median_metacritic)

    publisher_stats = training_data.groupby("primary_publisher").agg({
        "days_to_service": ["mean", "median", "std", "count"],
        "metacritic_score": "mean",
    }).reset_index()
    publisher_stats.columns = ["publisher", "pub_avg_days", "pub_median_days", "pub_std_days", "pub_count", "pub_avg_meta"]
    publisher_stats["pub_cv"] = publisher_stats["pub_std_days"] / publisher_stats["pub_avg_days"]
    publisher_stats["pub_cv"] = publisher_stats["pub_cv"].fillna(0.5)

    training_data = training_data.merge(publisher_stats, left_on="primary_publisher", right_on="publisher", how="left")

    le_publisher = LabelEncoder()
    training_data["publisher_encoded"] = le_publisher.fit_transform(training_data["primary_publisher"])

    feature_cols = ["metacritic_score", "publisher_encoded", "pub_avg_days", "pub_count", "pub_cv"]
    X = training_data[feature_cols].copy()
    y = np.log(training_data["days_to_service"].copy())
    X = X.fillna(X.median())

    X_train, X_test, y_train_log, y_test_log = train_test_split(X, y, test_size=0.2, random_state=42)
    xgb_model = xgb.XGBRegressor(
        n_estimators=300, learning_rate=0.05, max_depth=5, min_child_weight=3,
        subsample=0.8, colsample_bytree=0.8, reg_alpha=0.1, reg_lambda=0.1,
        random_state=42, n_jobs=-1,
    )
    xgb_model.fit(X_train, y_train_log)

    y_pred = np.exp(xgb_model.predict(X_test))
    y_test_orig = np.exp(y_test_log)
    mae = mean_absolute_error(y_test_orig, y_pred)
    r2 = r2_score(y_test_orig, y_pred)
    print(f"Test MAE: {mae:.1f} days | Test R2: {r2:.3f}")

    art = config.artifacts(name)
    os.makedirs(config.MODELS_DIR, exist_ok=True)
    with open(os.path.join(config.MODELS_DIR, art["model"]), "wb") as f:
        pickle.dump(xgb_model, f)
    with open(os.path.join(config.MODELS_DIR, art["encoder"]), "wb") as f:
        pickle.dump(le_publisher, f)
    publisher_stats.to_csv(os.path.join(config.MODELS_DIR, art["stats"]), index=False)
    print(f"Saved {art['model']}, {art['encoder']}, {art['stats']} to {config.MODELS_DIR}")

    return {
        "platform": name, "status": "ok", "samples": len(training_data),
        "publishers": len(publisher_stats), "mae_days": round(float(mae), 1), "r2": round(float(r2), 3),
    }


def run():
    """Train all platforms; returns a list of per-platform metrics."""
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
