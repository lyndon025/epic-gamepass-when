"""Conformalized quantile regression - makes the prediction intervals honest.

WHY THIS EXISTS
---------------
The out-of-time holdout (pipeline.holdout, 2026-08-24) found the P10-P90 bands
covering 33% of real arrivals against a claimed 80%. Mean band width was roughly
equal to MAE where it needs to be around three times MAE, so the intervals were
about 3x too narrow on every platform. Gradient-boosted quantile regression
under-disperses on limited data: the outer quantiles shrink toward the median.

Conformal prediction fixes that without touching the learner. Fit the quantile
models as before, then measure on held-out data how far reality actually falls
outside the predicted band, and widen the band by that measured amount. The
result carries a finite-sample coverage guarantee rather than a hope that the
learner was calibrated - the guarantee comes from the calibration data, not from
the model being right.

Method is Romano, Patterson & Candes (2019), "Conformalized Quantile Regression".

WHY THE OFFSET IS COMPUTED IN LOG SPACE
---------------------------------------
The models are fitted on log(days), and error here is multiplicative - being six
months out on a three-year wait is not the same mistake as on a two-month wait.
A single additive offset in log space becomes a MULTIPLICATIVE widening in days,
so long predictions get proportionally wider bands and short ones stay tight.
An additive offset in day space would over-widen the short predictions and
under-widen the long ones, which is exactly backwards.

WHY THE CALIBRATION SPLIT IS BY TIME
------------------------------------
A random calibration split would leak the future into the offset, the same
mistake the original random train/test split made (P3). The calibration slice is
the most RECENT pre-cutoff data, because that is what future arrivals most
resemble.

THE HONEST CAVEAT
-----------------
Conformal coverage assumes calibration and test data are exchangeable. This data
drifts - PS Plus publicly deprioritised PS4 titles for 2026, Game Pass
restructured its tiers, Call of Duty stopped arriving day one. Under drift the
guarantee weakens, so treat 80% as a target achieved on average rather than a
promise on any given month. It is still vastly better than 33%.
"""

import numpy as np
import pandas as pd

from .train import (QUANTILES, _build_featurizer, _make_quantile_model,
                    _prepare, conformal_offset)

ALPHA = 0.20  # 1 - ALPHA = 0.80 nominal coverage, matching P10-P90
MIN_CALIB_ROWS = 40


def conformal_offsets_asymmetric(y_log, lo_log, hi_log, alpha=ALPHA):
    """Separate widening per side, in log space. Returns (offset_lo, offset_hi).

    The symmetric variant assumes the band is centred and merely too narrow. On
    this data it is not: measured on the holdout, 100 of 103 misses fell ABOVE
    the upper bound and only 3 below, because the model predicts arrivals earlier
    than they happen. A symmetric offset therefore spends most of its width
    pushing a lower bound that was already over-covering, which buys nothing and
    makes every interval needlessly vague.

    Splitting alpha between the sides lets each bound move only as far as its own
    errors demand. Each side is allowed at most alpha/2 misses, so total coverage
    is still at least 1-alpha, but the width goes where the errors actually are.

    This also handles drift better here, because the drift is directional: 2026
    arrivals wait longer than the 2025 data the offset is measured on, and that
    shows up almost entirely as upper-bound misses.
    """
    y_log = np.asarray(y_log, dtype=float)
    per_side = alpha / 2.0

    def one_side(scores):
        n = len(scores)
        if n == 0:
            return 0.0
        k = min(int(np.ceil((n + 1) * (1 - per_side))), n)
        return float(max(0.0, np.sort(scores)[k - 1]))

    return one_side(lo_log - y_log), one_side(y_log - hi_log)


def fit_with_conformal(df, alpha=ALPHA, calib_frac=0.2):
    """Fit quantile models plus a conformal offset, splitting by time.

    Returns (models, featurize, params, offset, n_calib). The featurizer is
    built on the training portion only, so the calibration slice stays genuinely
    unseen - otherwise the offset is measured against data the model already
    fits well and comes out far too small.
    """
    df = df.sort_values("added_to_service").reset_index(drop=True)
    n_calib = max(MIN_CALIB_ROWS, int(len(df) * calib_frac))
    if n_calib >= len(df):
        raise ValueError(f"not enough rows to calibrate: {len(df)}")

    train_df = df.iloc[:-n_calib]
    calib_df = df.iloc[-n_calib:]

    params, featurize = _build_featurizer(train_df)
    x_train = featurize(train_df)
    y_train = np.log(train_df["days_to_service"].astype(float))

    models = {}
    for q in QUANTILES:
        models[str(q)] = _make_quantile_model(q).fit(x_train, y_train)

    x_calib = featurize(calib_df)
    y_calib = np.log(calib_df["days_to_service"].astype(float))
    lo_calib = models["0.1"].predict(x_calib)
    hi_calib = models["0.9"].predict(x_calib)

    offset_sym = conformal_offset(y_calib, lo_calib, hi_calib, alpha=alpha)
    offset_lo, offset_hi = conformal_offsets_asymmetric(
        y_calib, lo_calib, hi_calib, alpha=alpha
    )

    # Now refit on EVERYTHING, offsets in hand.
    #
    # The calibration slice is the most recent 20% by date, so a model trained
    # only on the remaining 80% has its knowledge ending about a year early -
    # and on this data that roughly doubled the measured error. Throwing away
    # the freshest fifth of the evidence to buy an offset is a bad trade, and it
    # also re-breaks P4 (shipping a model fitted on a subset).
    #
    # The offset was measured against the weaker model and is applied to the
    # stronger one, which is a mild theoretical impurity. It errs the safe way:
    # the full model should be at least as good, so the offset is slightly
    # generous and coverage lands slightly ABOVE nominal rather than below.
    full_params, full_featurize = _build_featurizer(df)
    x_full = full_featurize(df)
    y_full = np.log(df["days_to_service"].astype(float))
    full_models = {}
    for q in QUANTILES:
        full_models[str(q)] = _make_quantile_model(q).fit(x_full, y_full)

    return {
        "models": full_models,
        "featurize": full_featurize,
        "params": full_params,
        "offset_sym": offset_sym,
        "offset_lo": offset_lo,
        "offset_hi": offset_hi,
        "n_calib": n_calib,
        "n_train": len(df),
        "n_train_for_offset": len(train_df),
    }


# ---------------------------------------------------------------------------
# Verification experiment
# ---------------------------------------------------------------------------

def experiment():
    """Does conformal calibration fix the coverage failure, and which variant?

    Deliberately does NOT calibrate on the holdout. The 261 post-cutoff rows are
    the only genuinely unseen data available, and using any of them to tune the
    offset would spend the one clean test set that exists.

    Instead this trains a replica on PRE-cutoff data with a proper time-based
    train/calibration split, then evaluates on the untouched post-cutoff rows.
    Fully honest, and it doubles as the exact recipe train.py should adopt.
    """
    from . import config
    from .holdout import CUTOFFS, TODAY

    print("=" * 78)
    print("CONFORMAL CALIBRATION - replica trained pre-cutoff, tested on holdout")
    print("=" * 78)
    print()
    print("Coverage against a nominal 80%, and mean band width in days.")
    print()
    print(f"{'platform':14s} {'test':>5s} | {'raw':>10s} | {'symmetric':>14s} "
          f"| {'asymmetric':>14s}")
    print(f"{'':14s} {'':5s} | {'cov':>4s} {'width':>5s} | {'cov':>4s} {'width':>5s} "
          f"{'off':>3s} | {'cov':>4s} {'width':>5s} {'lo/hi':>3s}")
    print("-" * 78)

    rows = []
    for item in config.TRAIN_PLATFORMS:
        name = item["name"]
        df = _prepare(pd.read_csv(item["input"]))
        cutoff = pd.Timestamp(CUTOFFS[name])

        pre = df[df["added_to_service"] <= cutoff]
        post = df[
            (df["added_to_service"] > cutoff) & (df["added_to_service"] <= TODAY)
        ]
        if len(post) == 0 or len(pre) < MIN_CALIB_ROWS * 2:
            print(f"{name:14s} insufficient data")
            continue

        fit = fit_with_conformal(pre)
        x_test = fit["featurize"](post)
        actual = post["days_to_service"].astype(float).to_numpy()
        lo_log = fit["models"]["0.1"].predict(x_test)
        hi_log = fit["models"]["0.9"].predict(x_test)

        def score(off_lo, off_hi):
            lo, hi = np.exp(lo_log - off_lo), np.exp(hi_log + off_hi)
            return (
                float(np.mean((actual >= lo) & (actual <= hi))),
                float(np.mean(hi - lo)),
            )

        raw_cov, raw_w = score(0.0, 0.0)
        sym_cov, sym_w = score(fit["offset_sym"], fit["offset_sym"])
        asym_cov, asym_w = score(fit["offset_lo"], fit["offset_hi"])

        print(f"{name:14s} {len(post):5d} | {raw_cov * 100:3.0f}% {raw_w:5.0f} "
              f"| {sym_cov * 100:3.0f}% {sym_w:5.0f} {fit['offset_sym']:3.1f} "
              f"| {asym_cov * 100:3.0f}% {asym_w:5.0f} "
              f"{fit['offset_lo']:.1f}/{fit['offset_hi']:.1f}")

        rows.append({
            "platform": name, "n_test": len(post),
            "raw_coverage": raw_cov, "raw_width": raw_w,
            "sym_coverage": sym_cov, "sym_width": sym_w,
            "asym_coverage": asym_cov, "asym_width": asym_w,
            "offset_sym": fit["offset_sym"],
            "offset_lo": fit["offset_lo"], "offset_hi": fit["offset_hi"],
        })

    if rows:
        n = sum(r["n_test"] for r in rows)

        def wavg(key):
            return sum(r[key] * r["n_test"] for r in rows) / n

        print()
        print(f"OVERALL on {n} unseen rows, nominal 80%:")
        print(f"  raw          coverage {wavg('raw_coverage') * 100:3.0f}%   "
              f"mean width {wavg('raw_width'):5.0f} d")
        print(f"  symmetric    coverage {wavg('sym_coverage') * 100:3.0f}%   "
              f"mean width {wavg('sym_width'):5.0f} d")
        print(f"  asymmetric   coverage {wavg('asym_coverage') * 100:3.0f}%   "
              f"mean width {wavg('asym_width'):5.0f} d")
        print()
        print("Offsets are log space, so they widen multiplicatively: 0.7 moves a")
        print("bound by roughly exp(0.7) = 2.0x. lo/hi shows how lopsided the")
        print("correction is - a small lo with a large hi means the model runs early.")
    return rows


if __name__ == "__main__":
    experiment()
