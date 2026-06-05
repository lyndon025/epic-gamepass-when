"""Single source of truth for per-platform SERVING configuration (D-004).

app.py builds its predictors from PLATFORMS below. The confidence-tuning values
(avg_repeat_interval, repeat_confidence_mult, model_quality_mult,
max_confidence_cap) are the values documented in docs/CONFIDENCE.md.

Training (train_models.py) does NOT read this file - it only needs data paths and
model hyperparameters. These serving constants live here and ONLY here, so the
old duplicate-and-divergent copies (previously inline in app.py and dead in
train_models.py) cannot drift apart again.

Artifact filenames are relative to the models/ directory; csv is relative to the
backend root. "platform_check" is a key resolved to a function in app.py.
"key" is the value the frontend sends in the request "platform" field.
"""

PLATFORMS = [
    {
        "key": "epic",
        "platform_name": "Epic Games",
        "version": "v4.2 XGBoost + Two-Tier",
        "csv": "Epic.csv",
        "model": "xgb_epic_model.pkl",
        # FIX (D-005): use the *_epic artifacts produced by the same training run
        # as xgb_epic_model.pkl. The backend previously read the unsuffixed
        # publisher_statistics.csv / publisher_encoder.pkl, which were stale and
        # mismatched with the model.
        "stats": "publisher_statistics_epic.csv",
        "encoder": "publisher_encoder_epic.pkl",
        "avg_repeat_interval": 18.9,
        "repeat_confidence_mult": 1.0,
        "date_column": "Added to Service",
        "date_format": "%m/%d/%Y",
        "model_quality_mult": 1.0,
        "max_confidence_cap": 95,
        "disclaimer": "",
        "platform_check": "pc",
    },
    {
        "key": "gamepass",
        "platform_name": "Xbox Game Pass",
        "version": "v1.0 XGBoost + Two-Tier + First-Party",
        "csv": "Xbox.csv",
        "model": "xgb_xbox_model.pkl",
        "stats": "publisher_statistics_xbox.csv",
        "encoder": "publisher_encoder_xbox.pkl",
        "avg_repeat_interval": 24.0,
        "repeat_confidence_mult": 1.25,
        "date_column": "Added to Service",
        "date_format": "%m/%d/%Y",
        "model_quality_mult": 0.75,
        "max_confidence_cap": 90,
        "disclaimer": "Moderate uncertainty - Game Pass patterns vary",
        "platform_check": "xbox",
    },
    {
        "key": "psplus",
        "platform_name": "PS Plus Extra",
        "version": "v1.0 XGBoost + Two-Tier",
        "csv": "PS.csv",
        "model": "xgb_psplus_model.pkl",
        "stats": "publisher_statistics_psplus.csv",
        "encoder": "publisher_encoder_psplus.pkl",
        "avg_repeat_interval": 24.0,
        "repeat_confidence_mult": 1.25,
        "date_column": "Added to Service",
        "date_format": "%m/%d/%Y",
        "model_quality_mult": 0.6,
        "max_confidence_cap": 80,
        "disclaimer": "High uncertainty - PS Plus catalog patterns are unpredictable",
        "platform_check": "playstation",
    },
    {
        "key": "humble",
        "platform_name": "Humble Choice",
        "version": "v1.0 XGBoost + Two-Tier",
        "csv": "HB.csv",
        "model": "xgb_humblebundle_model.pkl",
        "stats": "publisher_statistics_humblebundle.csv",
        "encoder": "publisher_encoder_humblebundle.pkl",
        "avg_repeat_interval": 24.0,
        "repeat_confidence_mult": 1.0,
        "date_column": "Added to Service",
        "date_format": "%m/%d/%Y",
        "model_quality_mult": 0.7,
        "max_confidence_cap": 85,
        "disclaimer": "Prediction based on Humble Choice history",
        "platform_check": "pc",
    },
]
