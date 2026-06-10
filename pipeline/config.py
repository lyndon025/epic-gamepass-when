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

# RAWG keys are never hardcoded (D-006). rawg_keys() gathers them, in order, from
# the environment and then from gitignored local files (the frontend .env, a repo
# root .env, or "RAWG API key.txt"), so a local pipeline run "just works" and CI
# can inject keys via env. Multiple keys enable rotation in pipeline.enrich.
def _parse_env_file(path):
    vals = {}
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals


_KEY_NAMES = [
    "RAWG_API_KEY", "RAWG_API_KEY_1", "RAWG_API_KEY_2", "RAWG_API_KEY_3",
    "VITE_RAWG_API_KEY_1", "VITE_RAWG_API_KEY_2", "VITE_RAWG_API_KEY_3",
]


def rawg_keys():
    """Return a de-duplicated, ordered list of RAWG API keys from env, then files."""
    keys = []
    if os.environ.get("RAWG_API_KEYS"):  # optional comma-separated override
        keys += os.environ["RAWG_API_KEYS"].split(",")
    for name in _KEY_NAMES:
        if os.environ.get(name):
            keys.append(os.environ[name])
    if not keys:
        for envfile in (
            os.path.join(REPO_ROOT, "apps", "frontend", ".env"),
            os.path.join(REPO_ROOT, ".env"),
        ):
            vals = _parse_env_file(envfile)
            for name in _KEY_NAMES:
                if vals.get(name):
                    keys.append(vals[name])
            if keys:
                break
    if not keys:
        txt = os.path.join(REPO_ROOT, "RAWG API key.txt")
        if os.path.exists(txt):
            with open(txt, "r", encoding="utf-8") as f:
                keys += [ln.strip() for ln in f if ln.strip()]
    seen, out = set(), []
    for k in (k.strip() for k in keys):
        if k and k not in seen:
            seen.add(k)
            out.append(k)
    return out

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
