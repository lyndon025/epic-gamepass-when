"""Stage 4 - sync canonical data + trained artifacts into apps/backend.

Ported from the original deploy_models.py. Sources are now data/canonical (CSVs)
and models/ (artifacts); the destination is apps/backend (CSVs in the backend
root, artifacts in apps/backend/models), which the backend reads per its
platform_config.py.
"""

import os
import shutil

from . import config


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

    print(f"Deployed {len(copied)} files to {config.BACKEND_DIR}")
    if missing:
        print("WARNING: missing sources (not copied):")
        for m in missing:
            print(f"  - {m}")
    return {"copied": copied, "missing": missing}


if __name__ == "__main__":
    run()
