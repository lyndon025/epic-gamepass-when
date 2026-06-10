"""Single source of truth for per-platform SERVING configuration (D-004).

app.py builds its predictors from PLATFORMS below. The confidence-tuning values
(avg_repeat_interval, repeat_confidence_mult, model_quality_mult,
max_confidence_cap) are the values documented in docs/CONFIDENCE.md.

Each platform loads ONE bundle (models/model_<key>.pkl) produced by
pipeline.train: the P10/P50/P90 quantile models plus the featurization maps
(Phase 5). "platform_check" is a key resolved to a function in app.py. "key" is
the value the frontend sends in the request "platform" field.
"""

PLATFORMS = [
    {
        "key": "epic",
        "platform_name": "Epic Games",
        "version": "v5 XGBoost Quantile + Two-Tier",
        "csv": "Epic.csv",
        "bundle": "model_epic.pkl",
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
        "version": "v5 XGBoost Quantile + Two-Tier + First-Party",
        "csv": "Xbox.csv",
        "bundle": "model_xbox.pkl",
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
        "version": "v5 XGBoost Quantile + Two-Tier",
        "csv": "PS.csv",
        "bundle": "model_psplus.pkl",
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
        "version": "v5 XGBoost Quantile + Two-Tier",
        "csv": "HB.csv",
        "bundle": "model_humblebundle.pkl",
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
