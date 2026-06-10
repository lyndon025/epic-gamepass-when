"""Single source of truth for the training-pipeline paths and per-platform
metadata (D-006: no machine-absolute paths - everything derives from the repo
root). Serving/confidence constants are NOT here; they live in
apps/backend/platform_config.py (D-004).
"""

import os

# pipeline/config.py -> repo root is two levels up.
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DATA_RAW = os.path.join(REPO_ROOT, "data", "raw")            # NEW_* scrape dumps
DATA_PROCESSED = os.path.join(REPO_ROOT, "data", "processed")  # *_Processed.csv (intermediate)
DATA_CANONICAL = os.path.join(REPO_ROOT, "data", "canonical")  # Epic.csv, Xbox.csv, PS.csv, HB.csv
DATA_BACKUPS = os.path.join(REPO_ROOT, "data", "backups")     # timestamped backups (gitignored)
MODELS_DIR = os.path.join(REPO_ROOT, "models")               # trained artifacts

BACKEND_DIR = os.path.join(REPO_ROOT, "apps", "backend")     # deploy target (csv in root)
BACKEND_MODELS = os.path.join(BACKEND_DIR, "models")         # deploy target (artifacts)

# RAWG key from the environment only (D-006); the raw key sits in the gitignored
# "RAWG API key.txt" for local use.
RAWG_API_KEY = os.environ.get("RAWG_API_KEY", "")

# Canonical dataset filename per platform (lives in DATA_CANONICAL).
CANONICAL = {
    "Epic": "Epic.csv",
    "Xbox": "Xbox.csv",
    "PSPlus": "PS.csv",
    "HumbleBundle": "HB.csv",
}

# Trained-artifact filename per platform (lives in MODELS_DIR). As of Phase 5 each
# platform is ONE self-contained bundle pickle (quantile models + the
# featurization maps needed to score a query), named by the lowercased platform.
def artifacts(platform_name):
    key = platform_name.lower()
    return {"bundle": f"model_{key}.pkl"}

# Platforms to train, in order. Serving constants intentionally omitted (D-004).
TRAIN_PLATFORMS = [
    {"name": "Xbox", "input": os.path.join(DATA_CANONICAL, CANONICAL["Xbox"])},
    {"name": "PSPlus", "input": os.path.join(DATA_CANONICAL, CANONICAL["PSPlus"])},
    {"name": "Epic", "input": os.path.join(DATA_CANONICAL, CANONICAL["Epic"])},
    {"name": "HumbleBundle", "input": os.path.join(DATA_CANONICAL, CANONICAL["HumbleBundle"])},
]


def ensure_dirs():
    """Create the output directories if they do not exist."""
    for d in (DATA_RAW, DATA_PROCESSED, DATA_CANONICAL, DATA_BACKUPS, MODELS_DIR):
        os.makedirs(d, exist_ok=True)
