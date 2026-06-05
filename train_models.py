
# train_models.py
# Automated training script based on game-prediction-v8.ipynb

import pandas as pd
import numpy as np
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')
import os
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import pickle

print("✓ Libraries imported successfully!")

BASE_DIR = r"i:\Lyndon\AI ML\Project\Epic and Gamepass Predictor"

# Serving/confidence constants (avg_repeat_interval, model_quality_mult,
# max_confidence_cap) are NOT defined here. They live in
# apps/backend/platform_config.py, the single source of truth used at inference
# time (D-004). Training only needs the per-platform input data path; the values
# that used to be here were unused and had drifted from the serving values.
PLATFORMS = [
    {
        "name": "Xbox",
        "display": "Xbox Game Pass Ultimate",
        "input": os.path.join(BASE_DIR, "Xbox", "Xbox.csv"),
    },
    {
        "name": "PSPlus",
        "display": "PlayStation Plus Extra",
        "input": os.path.join(BASE_DIR, "Xbox", "PS.csv"),
    },
    {
        "name": "Epic",
        "display": "Epic Games Store",
        "input": os.path.join(BASE_DIR, "Epic", "Epic.csv"),
    },
    {
        "name": "HumbleBundle",
        "display": "Humble Choice",
        "input": os.path.join(BASE_DIR, "HB", "HB.csv"),
    }
]

DATE_COLUMN = "Added to Service"
DATE_FORMATS = ["%m/%d/%Y", "%Y-%m-%d", "%d/%m/%Y", "%Y-%m-%d %H:%M:%S"]

def parse_date_robust(date_str):
    if pd.isna(date_str):
        return pd.NaT
    date_str = str(date_str).strip()
    for fmt in DATE_FORMATS:
        try:
            return pd.to_datetime(date_str, format=fmt)
        except:
            continue
    return pd.to_datetime(date_str, errors='coerce')

print("✓ Configurations defined.")

for config in PLATFORMS:
    print("="*60)
    print(f"PROCESSING: {config['display']}")
    print(f"Input: {config['input']}")
    
    if not os.path.exists(config['input']):
        print(f"❌ File not found: {config['input']}")
        continue
        
    try:
        # Load Data
        df = pd.read_csv(config['input'])
        df_clean = df[df['game_name'].notna()].copy()
        
        # Parse dates
        df_clean['added_to_service'] = df_clean[DATE_COLUMN].apply(parse_date_robust)
        df_clean['release_date'] = df_clean['release_date'].apply(parse_date_robust)
        
        # Calculate days to service
        df_clean['days_to_service'] = (df_clean['added_to_service'] - df_clean['release_date']).dt.days
        
        # Extract primary publisher
        df_clean['primary_publisher'] = df_clean['publisher'].apply(
            lambda x: str(x).split(',')[0].strip() if pd.notna(x) else 'Unknown'
        )
        
        # Filter valid training data
        training_data = df_clean[
            (df_clean['days_to_service'].notna()) & 
            (df_clean['days_to_service'] >= 1) & 
            (df_clean['primary_publisher'] != 'Unknown') & 
            (df_clean['primary_publisher'] != '')
        ].copy()
        
        print(f"Total rows: {len(df_clean)}")
        print(f"Valid training samples: {len(training_data)}")
        
        if len(training_data) < 20:
            print("⚠️ Not enough training data (<20). Skipping.")
            continue

        # Check for Metacritic
        if 'metacritic_score' not in training_data.columns:
            training_data['metacritic_score'] = np.nan
        
        training_data['metacritic_score'] = pd.to_numeric(training_data['metacritic_score'], errors='coerce')
        median_metacritic = training_data['metacritic_score'].median()
        if pd.isna(median_metacritic):
            median_metacritic = 75.0
        training_data['metacritic_score'] = training_data['metacritic_score'].fillna(median_metacritic)
        
        # --- Feature Engineering ---
        publisher_stats = training_data.groupby('primary_publisher').agg({
            'days_to_service': ['mean', 'median', 'std', 'count'],
            'metacritic_score': 'mean'
        }).reset_index()
        
        publisher_stats.columns = ['publisher', 'pub_avg_days', 'pub_median_days', 'pub_std_days', 'pub_count', 'pub_avg_meta']
        publisher_stats['pub_cv'] = publisher_stats['pub_std_days'] / publisher_stats['pub_avg_days']
        publisher_stats['pub_cv'] = publisher_stats['pub_cv'].fillna(0.5)
        
        # Merge back
        training_data = training_data.merge(publisher_stats, left_on='primary_publisher', right_on='publisher', how='left')
        
        # Encode Publisher
        le_publisher = LabelEncoder()
        training_data['publisher_encoded'] = le_publisher.fit_transform(training_data['primary_publisher'])
        
        # --- Prepare XGBoost ---
        feature_cols = ['metacritic_score', 'publisher_encoded', 'pub_avg_days', 'pub_count', 'pub_cv']
        X = training_data[feature_cols].copy()
        y = np.log(training_data['days_to_service'].copy())
        
        X = X.fillna(X.median()) # Handle remaining NaNs
        
        # Train on Full Data (or Split? Typically split for eval, but we want best model efficiently)
        # We will split to print metrics but fit on full? usage in v7 seemed to be: fit on train, predict on test.
        # But we want to SAVE the best model.
        # Ideally we Retrain on FULL dataset after validation.
        # But v7 just saved the one trained on X_train.
        # I'll stick to Split for metrics validation.
        
        X_train, X_test, y_train_log, y_test_log = train_test_split(X, y, test_size=0.2, random_state=42)
        
        xgb_model = xgb.XGBRegressor(
            n_estimators=300,
            learning_rate=0.05,
            max_depth=5,
            min_child_weight=3,
            subsample=0.8,
            colsample_bytree=0.8,
            reg_alpha=0.1,
            reg_lambda=0.1,
            random_state=42,
            n_jobs=-1
        )
        
        xgb_model.fit(X_train, y_train_log)
        
        # Evaluate
        y_pred = np.exp(xgb_model.predict(X_test))
        y_test_orig = np.exp(y_test_log)
        mae = mean_absolute_error(y_test_orig, y_pred)
        r2 = r2_score(y_test_orig, y_pred)
        
        print(f"Test MAE: {mae:.1f} days")
        print(f"Test R²: {r2:.3f}")
        
        # Save Artifacts
        output_model = f"xgb_{config['name'].lower()}_model.pkl"
        output_encoder = f"publisher_encoder_{config['name'].lower()}.pkl"
        output_stats = f"publisher_statistics_{config['name'].lower()}.csv"
        
        output_dir = os.path.dirname(config['input'])
        
        with open(os.path.join(output_dir, output_model), 'wb') as f:
            pickle.dump(xgb_model, f)
            
        with open(os.path.join(output_dir, output_encoder), 'wb') as f:
            pickle.dump(le_publisher, f)
            
        publisher_stats.to_csv(os.path.join(output_dir, output_stats), index=False)
        
        print(f"✓ Saved artifacts to {output_dir}")

    except Exception as e:
        print(f"Error processing {config['name']}: {e}")
