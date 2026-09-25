"""Stage 4 - sync canonical data + trained artifacts into apps/backend.

Ported from the original deploy_models.py. Sources are now data/canonical (CSVs)
and models/ (artifacts); the destination is apps/backend (CSVs in the backend
root, artifacts in apps/backend/models), which the backend reads per its
platform_config.py.
"""

import json
import os
import shutil
from datetime import date

import pandas as pd

from . import config, hazard


def _write_status():
    """When the data was collected, and when the next refresh is due.

    Shown on the site so a reader can judge staleness, and read by the backend
    so "on Game Pass" can be stated as of a real date rather than as "now".
    Written to both apps so the frontend can show it without a backend call.
    """
    collected = date.today().isoformat()
    if os.path.exists(config.COLLECTED_ON_FILE):
        with open(config.COLLECTED_ON_FILE, encoding="utf-8") as f:
            collected = f.read().strip() or collected
    as_of = pd.Timestamp(collected)
    due = as_of + pd.DateOffset(months=config.UPDATE_CADENCE_MONTHS)

    latest = {}
    for csv in config.CANONICAL.values():
        df = pd.read_csv(os.path.join(config.DATA_CANONICAL, csv))
        added = pd.to_datetime(df["Added to Service"], errors="coerce", format="mixed")
        latest[csv] = str(added[added <= as_of].max())[:10]

    status = {
        "collected_on": collected,
        "cadence_months": config.UPDATE_CADENCE_MONTHS,
        "cadence_label": "quarterly" if config.UPDATE_CADENCE_MONTHS == 3
                         else f"every {config.UPDATE_CADENCE_MONTHS} months",
        "next_update_by": due.strftime("%Y-%m-%d"),
        "latest_arrival": latest,
    }
    targets = [
        os.path.join(config.BACKEND_DIR, "data_status.json"),
        os.path.join(config.REPO_ROOT, "apps", "frontend", "public", "data_status.json"),
    ]
    for path in targets:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(status, f, indent=1)
    print(f"Data status: collected {collected}, next update by {status['next_update_by']}")
    return status


def _copy(src, dst, copied, missing):
    if os.path.exists(src):
        shutil.copy2(src, dst)
        copied.append(os.path.basename(src))
    else:
        missing.append(src)


def run():
    """Copy canonical CSVs and model artifacts into apps/backend. Returns a
    summary dict of what was copied / missing."""
    os.makedirs(config.BACKEND_MODELS, exist_ok=True)
    copied, missing = [], []

    # Canonical datasets -> backend root (Epic.csv, Xbox.csv, PS.csv, HB.csv).
    for csv in config.CANONICAL.values():
        _copy(os.path.join(config.DATA_CANONICAL, csv),
              os.path.join(config.BACKEND_DIR, csv), copied, missing)

    # Trained artifacts -> backend/models (one bundle per platform).
    for platform in config.TRAIN_PLATFORMS:
        bundle = config.artifacts(platform["name"])["bundle"]
        _copy(os.path.join(config.MODELS_DIR, bundle),
              os.path.join(config.BACKEND_MODELS, bundle), copied, missing)

    # Derived from the same canonical data just copied, so it can never describe
    # a different dataset from the one the backend is serving.
    hazard.run()
    copied.append("arrival_hazard.json")
    _write_status()
    copied.append("data_status.json")

    print(f"Deployed {len(copied)} files to {config.BACKEND_DIR}")
    if missing:
        print("WARNING: missing sources (not copied):")
        for m in missing:
            print(f"  - {m}")
    return {"copied": copied, "missing": missing}


if __name__ == "__main__":
    run()
