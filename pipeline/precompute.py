"""Stage 6 - precompute predictions so the backend stops being load-bearing.

WHY
---
Every prediction currently costs a call into the Flask service, which sleeps when
idle on free hosting. Precomputing the answers turns that service from a
dependency into a fallback: known games resolve instantly from a lookup, and only
genuinely unknown titles reach the model at request time.

WHAT IS STORED, AND WHY IT IS DATES
-----------------------------------
Absolute arrival dates, never "in 18 months" (D-017). A relative figure decays
every day it sits in storage, which is the actual reason the live cache needs a
24-hour TTL. An absolute date does not rot, so an entry stays valid until the
model itself changes.

Each row also carries its provenance, and the two dates are deliberately
separate:

  computed_at   when this prediction was generated
  data_through  the newest arrival the model was trained on

The second is what bounds the model's knowledge. A prediction generated today by
a model trained on data ending eight months ago looks fresh and is not, and only
data_through exposes that.

GRAIN IS RESOLVED HERE, NOT IN THE UI
-------------------------------------
The answer grain - month, year, floor, or suppressed - follows from how wide the
calibrated range came out. Deciding it here keeps the thresholds in one place and
means the frontend renders what it is given rather than re-deriving policy.

THE FULL CASCADE RUNS
---------------------
This calls the real serving predictor, so first-party rules, the Call of Duty
policy and the repeat-history lookup all apply exactly as they would live. A
precomputed answer must be the same answer, or the cache is a second
implementation waiting to disagree with the first.
"""

import json
import os
import sys
from datetime import datetime

import pandas as pd

from . import config

BACKEND = config.BACKEND_DIR
MONTH = 30.44

# Width thresholds, in months, that pick the answer grain. Measured against real
# predictions rather than chosen by taste; see docs/PROTOTYPE_results.html.
GRAIN_MONTH = 24
GRAIN_YEAR = 48
GRAIN_FLOOR = 96


def _predictors():
    """Build the real serving predictors from the deployed backend copy."""
    if BACKEND not in sys.path:
        sys.path.insert(0, BACKEND)
    from platform_config import PLATFORMS
    from services.predictor import GameServicePredictor

    built = {}
    for cfg in PLATFORMS:
        built[cfg["key"]] = (cfg, GameServicePredictor(
            csv_path=os.path.join(BACKEND, cfg["csv"]),
            bundle_path=os.path.join(BACKEND, "models", cfg["bundle"]),
            platform_name=cfg["platform_name"],
            avg_repeat_interval=cfg["avg_repeat_interval"],
            repeat_confidence_mult=cfg["repeat_confidence_mult"],
            date_column=cfg["date_column"],
            date_format=cfg["date_format"],
            model_quality_mult=cfg["model_quality_mult"],
            max_confidence_cap=cfg["max_confidence_cap"],
            disclaimer=cfg["disclaimer"],
        ))
    return built


def _grain(out, now):
    """Which answer shape this prediction supports.

    Rule-based verdicts get no range at all: their risk is a policy changing, not
    statistical spread, so a band would misrepresent it.
    """
    if out.get("prediction_basis") == "policy" or out.get("first_party"):
        return "rule"

    tier = str(out.get("tier") or "").lower()
    if "repeat" in tier or "historical" in tier:
        return "repeat"
    if "not on" in tier or "exclusive" in tier or "compat" in tier:
        return "ineligible"

    lo = out.get("predicted_months_low")
    hi = out.get("predicted_months_high")
    mid = out.get("predicted_months")
    # No band means this did not come from the quantile model at all; label it
    # rather than silently folding it in with the genuine rule answers.
    if lo is None or hi is None or mid is None:
        return "no-interval"

    if mid <= 0:
        return "overdue"
    width = float(hi) - float(lo)
    if width < GRAIN_MONTH:
        return "month"
    if width < GRAIN_YEAR:
        return "year"
    if width < GRAIN_FLOOR:
        return "floor"
    return "suppressed"


def _iso_month(now, months):
    if months is None:
        return None
    days = max(0.0, float(months) * MONTH)
    return (now + pd.Timedelta(days=days)).strftime("%Y-%m")


def _catalogue():
    """Every game we know of, with the metadata a prediction needs.

    The union across all four services, not just each platform's own list: a user
    can ask about any game on any service, and a title on one list is exactly the
    kind of game that might reach another.
    """
    frames = []
    for platform in config.TRAIN_PLATFORMS:
        path = platform["input"]
        if not os.path.exists(path):
            continue
        df = pd.read_csv(path)
        keep = [c for c in ("game_name", "publisher", "release_date",
                            "metacritic_score") if c in df.columns]
        frames.append(df[keep])
    if not frames:
        return pd.DataFrame()

    cat = pd.concat(frames, ignore_index=True)
    cat = cat[cat["game_name"].notna()].copy()
    cat["__key"] = cat["game_name"].astype(str).str.strip().str.lower()
    # Prefer the row that actually has a publisher, since that drives the model.
    cat["__has_pub"] = cat["publisher"].notna() & (cat["publisher"].astype(str) != "")
    cat = cat.sort_values("__has_pub", ascending=False)
    cat = cat.drop_duplicates(subset=["__key"], keep="first")
    return cat.drop(columns=["__key", "__has_pub"])


def run(out_path=None, limit=None):
    now = pd.Timestamp(datetime.now())
    preds = _predictors()
    catalogue = _catalogue()
    if limit:
        catalogue = catalogue.head(limit)

    data_through = {}
    for platform in config.TRAIN_PLATFORMS:
        df = pd.read_csv(platform["input"])
        d = pd.to_datetime(df["Added to Service"], errors="coerce", format="mixed")
        data_through[platform["name"]] = str(d.max())[:10]

    print(f"Precomputing {len(catalogue)} games x {len(preds)} services "
          f"= {len(catalogue) * len(preds)} predictions")

    entries = {}
    counts = {}
    failures = 0
    for key, (cfg, predictor) in preds.items():
        n = 0
        for _, row in catalogue.iterrows():
            name = str(row["game_name"]).strip()
            pub = row.get("publisher")
            pub = None if pd.isna(pub) else str(pub)
            rel = row.get("release_date")
            rel = None if pd.isna(rel) else str(rel)
            meta = row.get("metacritic_score")
            meta = None if pd.isna(meta) else float(meta)

            try:
                out = predictor.predict(
                    game_name=name, publisher=pub,
                    metacritic_score=meta, release_date=rel,
                )
            except Exception:
                failures += 1
                continue
            if not out:
                continue

            grain = _grain(out, now)
            # Deliberately no reasoning prose: it is the bulk of the payload and
            # the UI composes its own copy from grain plus these fields.
            entry = {
                "g": grain,
                "c": out.get("category"),
                "t": out.get("tier"),
                "n": out.get("publisher_game_count"),
            }
            # Absolute dates only. The UI derives "months from now" at render.
            if grain in ("month", "year", "floor", "suppressed", "overdue"):
                entry["p50"] = _iso_month(now, out.get("predicted_months"))
                entry["p10"] = _iso_month(now, out.get("predicted_months_low"))
                entry["p90"] = _iso_month(now, out.get("predicted_months_high"))
            entries[f"{name.lower()}|{key}"] = entry
            counts[grain] = counts.get(grain, 0) + 1
            n += 1
        print(f"  {key:9s} {n} predictions")

    payload = {
        "computed_at": now.strftime("%Y-%m-%d"),
        "data_through": data_through,
        "grain_thresholds_months": {
            "month": GRAIN_MONTH, "year": GRAIN_YEAR, "floor": GRAIN_FLOOR,
        },
        "count": len(entries),
        "predictions": entries,
    }

    out_path = out_path or os.path.join(
        config.REPO_ROOT, "apps", "frontend", "public", "precomputed.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))

    size = os.path.getsize(out_path)
    print()
    print(f"Wrote {len(entries)} predictions to {out_path}")
    print(f"Size: {size / 1024 / 1024:.2f} MB ({size / max(1, len(entries)):.0f} bytes/entry)")
    if failures:
        print(f"Skipped {failures} predictions that raised")
    print()
    print("grain distribution:")
    for g, c in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {g:12s} {c:6d}  {c / max(1, len(entries)) * 100:4.0f}%")
    return payload


if __name__ == "__main__":
    run()
