from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
import os
import sys

# Add the current directory to the path so we can import services
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.predictor import GameServicePredictor
from services.platform_checks import (
    check_pc_platform,
    check_xbox_platform,
    check_playstation_platform,
)
from platform_config import PLATFORMS

app = Flask(__name__)

# CORS Configuration - Allow specific origins
allowed_origins = [
    "https://epic-gamepass-when.vercel.app",  # Production frontend
    "https://epic-gamepass-when-git-main-lyndon025s-projects.vercel.app",
    "https://epic-gamepass-when-git-dev-lyndon025s-projects.vercel.app",
    "https://epic-gamepass-when.onrender.com",
    "http://localhost:5173",  # Local Vite dev server
    "http://localhost:5174",  # Alternate local port
    "http://localhost:3000",  # Local fallback
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:3000",
]

CORS(
    app,
    origins=allowed_origins,
    supports_credentials=True,
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "OPTIONS"],
)

port = int(os.environ.get("PORT", 5000))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "models")


# ============================================================================
# INITIALIZE PREDICTORS (from the single source of truth: platform_config.py)
# ============================================================================

PLATFORM_CHECKS = {
    "pc": check_pc_platform,
    "xbox": check_xbox_platform,
    "playstation": check_playstation_platform,
}

predictors = {}
for cfg in PLATFORMS:
    predictors[cfg["key"]] = GameServicePredictor(
        csv_path=os.path.join(BASE_DIR, cfg["csv"]),
        bundle_path=os.path.join(MODEL_DIR, cfg["bundle"]),
        platform_name=cfg["platform_name"],
        avg_repeat_interval=cfg["avg_repeat_interval"],
        repeat_confidence_mult=cfg["repeat_confidence_mult"],
        date_column=cfg["date_column"],
        date_format=cfg["date_format"],
        model_quality_mult=cfg["model_quality_mult"],
        max_confidence_cap=cfg["max_confidence_cap"],
        disclaimer=cfg["disclaimer"],
        platform_check=PLATFORM_CHECKS[cfg["platform_check"]],
    )


# ============================================================================
# API ROUTES
# ============================================================================


@app.route("/api/predict", methods=["POST"])
def predict():
    data = request.json

    # DEBUG: Print all data received
    print(f"\n{'='*70}")
    print("RECEIVED DATA:")
    print(f"  game_name: {data.get('game_name')}")
    print(f"  release_date: {data.get('release_date')}")
    print(f"  metacritic_score: {data.get('metacritic_score')}")
    print(f"{'='*70}\n")

    platform = data.get("platform", "epic")
    game_name = data.get("game_name", "Unknown")
    publisher = data.get("publisher")
    metacritic_score = data.get("metacritic_score")
    platforms = data.get("platforms")

    predictor = predictors.get(platform)
    if predictor is None:
        return jsonify({"error": f"Unknown platform: {platform}"}), 400

    try:
        if platforms and not isinstance(platforms, list):
            platforms = None

        if metacritic_score:
            try:
                metacritic_score = float(metacritic_score)
                if metacritic_score < 0 or metacritic_score > 100:
                    metacritic_score = None
            except (ValueError, TypeError):
                metacritic_score = None

        result = predictor.predict(
            game_name=game_name,
            publisher=publisher,
            metacritic_score=metacritic_score,
            platforms=platforms,
            release_date=data.get("release_date"),
        )

        def serialize_value(value):
            if value is None:
                return None
            elif isinstance(value, bool):
                return bool(value)
            elif isinstance(value, (list, tuple)):
                return [serialize_value(v) for v in value]
            elif isinstance(value, dict):
                return {k: serialize_value(v) for k, v in value.items()}
            elif isinstance(value, (np.integer, np.floating)):
                try:
                    if np.isnan(value):
                        return None
                except (TypeError, ValueError):
                    pass
                return float(value)
            elif isinstance(value, (int, float)):
                try:
                    if pd.isna(value) or (isinstance(value, float) and np.isnan(value)):
                        return None
                except (TypeError, ValueError):
                    pass
                return float(value) if isinstance(value, float) else int(value)
            else:
                return str(value)

        serializable = {}
        for key, value in result.items():
            try:
                serializable[key] = serialize_value(value)
            except Exception as e:
                print(f"Error serializing '{key}': {e}")
                serializable[key] = None

        return jsonify(serializable)

    except Exception as e:
        print(f"Error in predict(): {type(e).__name__}: {str(e)}")
        import traceback

        traceback.print_exc()

        return (
            jsonify(
                {
                    "game_name": game_name,
                    "error": f"{type(e).__name__}: {str(e)}",
                    "category": "error",
                    "confidence": 0,
                    "tier": "Error",
                    "reasoning": "Backend error occurred",
                }
            ),
            500,
        )


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify(
        {
            "status": "healthy",
            "models": {cfg["key"]: cfg["version"] for cfg in PLATFORMS},
        }
    )


@app.route("/api/leaderboard", methods=["GET"])
def leaderboard():
    # Mock Leaderboard for Local Dev (since Redis is cloud-only)
    # This prevents 404s when running locally without 'vercel dev'
    platform = request.args.get("platform", "Global")
    return jsonify({
        "platform": platform,
        "leaderboard": [
            {"rank": 1, "game": "Local Dev Mock Game 1", "score": 100},
            {"rank": 2, "game": "Local Dev Mock Game 2", "score": 90},
            {"rank": 3, "game": "Use 'vercel dev' for Real Data", "score": 80}
        ]
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=port, debug=False)
