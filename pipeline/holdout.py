"""Out-of-time holdout evaluation of the FROZEN pre-refresh models (D-016).

The walk-forward backtest (pipeline.backtest) simulates the past: it repeatedly
trains on a prefix of history and tests on the next slice. That is honest, but it
is still a simulation run by the same code that built the model.

This module does something stronger and only possible once. The bundles in
models/frozen/v5_2026-06-10/ were trained on data ending in December 2025 or
January 2026, before the August 2026 refresh existed. Scoring them against
arrivals from after that cutoff is a genuine out-of-time test: leakage is not
merely controlled for, it is impossible, because the data did not exist when the
weights were fitted.

Two things this reports that MAE alone cannot:

  COVERAGE - the quantile models claim 80% of arrivals fall between P10 and P90.
  That is a falsifiable claim. Counting how often it holds is the only direct
  check on whether the intervals are honest or merely decorative, and it stays
  meaningful at 50-90 rows where MAE swings wildly.

  BIAS - whether the model runs early or late, which matters because of the
  selection effect described below.

A LIMITATION, STATED PLAINLY
---------------------------
The canonical datasets only contain games that DID arrive. A game that was
never given away is not a row anywhere, so the test set is conditioned on
having arrived. That biases it toward faster arrivals and makes the measured
error flattering.

D-016 describes evaluating from a frozen decision point with still-pending games
treated as right-censored. That cannot be fully done here, because the pending
population is not enumerable from this data - there is no list of "games that
could have arrived and did not". Fixing it properly needs a candidate set (for
example, every title in any platform's catalogue, arrived or not).

What this module does instead is report the bias direction, so the effect is at
least visible - and the direction turns out to matter enormously.

The sample is enriched in FAST arrivals. If the model also predicts EARLIER than
those already-fast arrivals, the combination is damning rather than reassuring:
on the full population, which is slower than the sample, the under-prediction
gets worse, not better. That is exactly what the first run found (median signed
error -125 to -331 days across all four platforms). So read these numbers as an
upper bound on quality, never a point estimate.
"""

import os
import pickle

import numpy as np
import pandas as pd

from . import config
from .train import _prepare

FROZEN_DIR = os.path.join(config.MODELS_DIR, "frozen", "v5_2026-06-10")

# The last arrival each frozen model saw in training, from that snapshot's
# MANIFEST.txt. Anything strictly later is unseen and therefore usable as a
# holdout row. Per-platform rather than one global cutoff, so Humble's December
# 2025 arrivals are not needlessly discarded.
CUTOFFS = {
    "Xbox": "2026-01-01",
    "PSPlus": "2026-01-01",
    "Epic": "2025-12-31",
    "HumbleBundle": "2025-12-01",
}

# Rows dated after this are announcements ("Coming Soon"), not observed
# outcomes, and must never be scored as arrivals.
TODAY = pd.Timestamp("2026-08-24")


def _featurize(df, bundle):
    """Rebuild the feature matrix using the FROZEN bundle's maps.

    Mirrors pipeline.train's featurize exactly. This must use the frozen
    statistics rather than recomputing them from current data - recomputing
    would leak the refresh into a model that never saw it, which is the whole
    thing this evaluation exists to avoid.
    """
    rel = pd.to_datetime(df["release_date"], errors="coerce")
    out = pd.DataFrame(index=df.index)
    out["metacritic_score"] = pd.to_numeric(
        df["metacritic_score"], errors="coerce"
    ).fillna(bundle["median_meta"])
    out["pub_te"] = df["primary_publisher"].map(bundle["te_map"]).fillna(
        bundle["global_mean_days"]
    )
    out["pub_count"] = df["primary_publisher"].map(bundle["pub_count"]).fillna(0.0)
    out["pub_cv"] = df["primary_publisher"].map(bundle["pub_cv"]).fillna(0.5)
    out["rel_year"] = rel.dt.year.fillna(bundle["rel_year_med"])
    out["rel_month"] = rel.dt.month.fillna(6)
    out["rel_quarter"] = rel.dt.quarter.fillna(2)
    return out[bundle["features"]].astype(float)


def _evaluate_platform(name, csv_path):
    bundle_path = os.path.join(FROZEN_DIR, config.artifacts(name)["bundle"])
    if not os.path.exists(bundle_path):
        print(f"  {name}: no frozen bundle at {bundle_path}, skipping")
        return None

    with open(bundle_path, "rb") as f:
        bundle = pickle.load(f)

    df = _prepare(pd.read_csv(csv_path))
    cutoff = pd.Timestamp(CUTOFFS[name])

    unseen = df[df["added_to_service"] > cutoff].copy()
    announced = int((unseen["added_to_service"] > TODAY).sum())
    test = unseen[unseen["added_to_service"] <= TODAY].copy()

    if test.empty:
        print(f"  {name}: no holdout rows after {cutoff.date()}")
        return None

    X = _featurize(test, bundle)
    actual = test["days_to_service"].astype(float).to_numpy()

    p10 = np.exp(bundle["models"]["0.1"].predict(X))
    p50 = np.exp(bundle["models"]["0.5"].predict(X))
    p90 = np.exp(bundle["models"]["0.9"].predict(X))

    # Baselines from the frozen training statistics, so they are held to the
    # same "knew nothing after the cutoff" standard as the model.
    global_pred = np.full_like(actual, float(bundle["global_mean_days"]))
    pub_pred = (
        test["primary_publisher"]
        .map(bundle["pub_avg_days"])
        .fillna(bundle["global_mean_days"])
        .astype(float)
        .to_numpy()
    )

    def mae(pred):
        return float(np.mean(np.abs(pred - actual)))

    # Error in log space too: the models are fitted on log(days), so a six-month
    # miss on a three-year wait is not the same mistake as on a two-month wait.
    def log_mae(pred):
        return float(
            np.mean(np.abs(np.log(np.clip(pred, 1, None)) - np.log(np.clip(actual, 1, None))))
        )

    covered = int(np.sum((actual >= p10) & (actual <= p90)))
    unseen_pub = int(
        (~test["primary_publisher"].isin(bundle["te_map"].keys())).sum()
    )

    return {
        "platform": name,
        "cutoff": str(cutoff.date()),
        "n": len(test),
        "announced_excluded": announced,
        "unseen_publishers": unseen_pub,
        "model_mae": mae(p50),
        "pub_baseline_mae": mae(pub_pred),
        "global_baseline_mae": mae(global_pred),
        "model_log_mae": log_mae(p50),
        "pub_baseline_log_mae": log_mae(pub_pred),
        "median_abs_err": float(np.median(np.abs(p50 - actual))),
        "coverage": covered / len(test),
        "covered": covered,
        "median_signed_err": float(np.median(p50 - actual)),
        "frac_predicted_late": float(np.mean(p50 > actual)),
        "mean_interval_width": float(np.mean(p90 - p10)),
    }


def run():
    """Evaluate every platform's frozen bundle against its unseen arrivals."""
    print("=" * 78)
    print("OUT-OF-TIME HOLDOUT - frozen v5 bundles vs arrivals they never saw")
    print("=" * 78)

    results = []
    for item in config.TRAIN_PLATFORMS:
        r = _evaluate_platform(item["name"], item["input"])
        if r:
            results.append(r)

    if not results:
        print("No holdout rows on any platform.")
        return []

    print()
    print(f"{'platform':14s} {'n':>4s} {'cutoff':>11s} {'model':>7s} {'pub-base':>9s} "
          f"{'global':>7s} {'coverage':>9s} {'width':>7s}")
    print("-" * 78)
    for r in results:
        beat = "beats" if r["model_mae"] < min(r["pub_baseline_mae"], r["global_baseline_mae"]) else "LOSES"
        print(f"{r['platform']:14s} {r['n']:4d} {r['cutoff']:>11s} "
              f"{r['model_mae']:7.0f} {r['pub_baseline_mae']:9.0f} "
              f"{r['global_baseline_mae']:7.0f} "
              f"{r['coverage'] * 100:8.0f}% {r['mean_interval_width']:7.0f}  {beat}")

    print()
    print("MAE and interval width in days. Coverage target is 80% by construction.")
    print()
    print("DETAIL")
    print("-" * 78)
    for r in results:
        print(f"{r['platform']}:")
        print(f"  holdout rows                {r['n']} "
              f"(excluded {r['announced_excluded']} future-dated announcements)")
        print(f"  publishers unseen in training {r['unseen_publishers']} "
              f"-> scored on the global prior")
        print(f"  P50 MAE                     {r['model_mae']:.0f} d   "
              f"(median abs err {r['median_abs_err']:.0f} d)")
        print(f"  log-space MAE               {r['model_log_mae']:.3f}  "
              f"vs publisher baseline {r['pub_baseline_log_mae']:.3f}")
        print(f"  interval coverage           {r['covered']}/{r['n']} "
              f"= {r['coverage'] * 100:.0f}%  (target 80%)")
        print(f"  bias                        median signed error "
              f"{r['median_signed_err']:+.0f} d, "
              f"{r['frac_predicted_late'] * 100:.0f}% predicted late")
        print()

    n_tot = sum(r["n"] for r in results)
    cov_tot = sum(r["covered"] for r in results)
    print(f"OVERALL: {n_tot} holdout rows, "
          f"interval coverage {cov_tot}/{n_tot} = {cov_tot / n_tot * 100:.0f}% "
          f"against a claimed 80%.")
    print()
    print("These are arrived-only rows, so the sample leans fast. Where the median")
    print("signed error above is NEGATIVE, the model predicts sooner than even this")
    print("fast sample - so true error on the full population is worse, not better.")
    return results


if __name__ == "__main__":
    run()
