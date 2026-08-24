"""Censored survival regression - fixes the target, not the model.

THE PROBLEM THIS ADDRESSES
--------------------------
The canonical datasets contain only games that ARRIVED. A game that was never
given away is not a row anywhere. So the quantity being fitted is

    E[T | T was observed]

while the quantity being asked for at serve time is

    E[T]

Those differ, and the gap is not small: the scorecard measures the model
predicting 4 to 16 months too early on every platform, in the same direction,
which is the signature of a mis-specified target rather than noise. Calibration
cannot repair it - widening a band around a centre that is in the wrong place
just produces a wide wrong answer.

The spot check made the consequence concrete: on Xbox, every sampled prediction
routed to "overdue", because release plus a too-short predicted wait lands in the
past for any catalogue title.

WHAT CENSORING ADDS
-------------------
A censored row says "this game has waited N years and has NOT arrived". That
sentence appears nowhere in the current training data, so the model has no
evidence that long waits or never-arriving are possible. Adding those rows is
what teaches it patience.

Candidates are games present on ANOTHER service's list but not on this one. That
is a high-precision universe: a game on a subscription or giveaway list has been
vetted by a human curator as the kind of game that goes on such services, so it
is a credible candidate for the others.

No publisher exclusion. First-party looked like an eligibility rule at first, but
the data says otherwise - Sony-published games do reach Game Pass (7 of them),
Microsoft-published games do reach PS Plus (29), and Bethesda titles appear
everywhere. First-party is LESS LIKELY, not ineligible, and rarity is exactly
what a censored row is for. Excluding them would delete the evidence.

WHY AFT RATHER THAN MORE QUANTILE MODELS
----------------------------------------
Accelerated failure time regression handles right-censored observations natively,
and XGBoost implements it, so this is a change of objective rather than a new
dependency. It also fixes a structural wart: three independently fitted quantile
models can cross, and the serving path has to sort them. AFT derives every
quantile from one fitted distribution, so crossing is impossible by construction.

  log T = f(x) + sigma * Z

f(x) comes from the trees, sigma is the scale, Z is the error distribution. Any
quantile follows from the same fit: T_q = exp(f(x)) * exp(sigma * z_q).

THE LIMITATION THAT REMAINS
---------------------------
Publisher keywords cannot express platform availability. A game that only ever
shipped on PlayStation hardware is not a Game Pass candidate at all, and the
canonical CSVs carry no cross-platform availability field - the serving tier gets
that from RAWG at request time. Some genuinely ineligible games therefore enter
the censored set as noise, which biases LATE. The bias column is the instrument
for detecting it: if it overshoots past zero into positive territory, the universe
is too loose.
"""

import numpy as np
import pandas as pd
import xgboost as xgb
from scipy.stats import norm

from . import config
from .train import _build_featurizer, _prepare
from .holdout import CUTOFFS, TODAY

MONTH = 30.44
QUANTILES = [0.1, 0.5, 0.9]
AFT_SCALE = 1.0
NUM_ROUNDS = 300

# Matched to pipeline.train's quantile models so the comparison is about the
# objective and the censored rows, not about hyperparameter luck.
AFT_PARAMS = {
    "objective": "survival:aft",
    "eval_metric": "aft-nloglik",
    "aft_loss_distribution": "normal",
    "aft_loss_distribution_scale": AFT_SCALE,
    "tree_method": "hist",
    "learning_rate": 0.05,
    "max_depth": 5,
    "min_child_weight": 3,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "reg_alpha": 0.1,
    "reg_lambda": 0.1,
    "seed": 42,
}


def build_censored(name, pools, as_of):
    """Games on another service's list that had NOT arrived here by as_of.

    Censoring is evaluated at as_of rather than today on purpose. A game that
    arrived after the cutoff was still censored at the cutoff, and it is exactly
    those games that form the test set - so treating them as censored during
    training is correct, not a leak.
    """
    mine = pools[name]
    arrived_by = set(
        mine.loc[mine["added_to_service"] <= as_of, "game_name"].astype(str).str.lower()
    )

    others = pd.concat([d for n, d in pools.items() if n != name], ignore_index=True)
    cand = others[~others["game_name"].astype(str).str.lower().isin(arrived_by)].copy()
    cand = cand.drop_duplicates(subset=["game_name"])

    rel = pd.to_datetime(cand["release_date"], errors="coerce")
    cand = cand[rel.notna() & (rel < as_of)].copy()
    rel = pd.to_datetime(cand["release_date"], errors="coerce")

    # How long it had been waiting, with no arrival yet.
    cand["waited_days"] = (as_of - rel).dt.days
    cand = cand[cand["waited_days"] >= 1]
    return cand


def fit_aft(observed, censored):
    """Fit one AFT model on arrivals plus censored waits.

    The featuriser is built on OBSERVED rows only. Publisher target encoding is
    an average of realised waits, and feeding it censored lower bounds would drag
    it upward with values that are not arrival times at all.
    """
    params, featurize = _build_featurizer(observed)

    x_obs = featurize(observed)
    y_obs = observed["days_to_service"].astype(float).to_numpy()

    x_cen = featurize(censored)
    y_cen = censored["waited_days"].astype(float).to_numpy()

    X = pd.concat([x_obs, x_cen], ignore_index=True)
    lower = np.concatenate([y_obs, y_cen])
    # An exact observation has upper == lower. A right-censored one is unbounded
    # above: all we know is that it has not happened yet.
    upper = np.concatenate([y_obs, np.full(len(y_cen), np.inf)])

    dmat = xgb.DMatrix(X)
    dmat.set_float_info("label_lower_bound", lower)
    dmat.set_float_info("label_upper_bound", upper)

    booster = xgb.train(AFT_PARAMS, dmat, num_boost_round=NUM_ROUNDS)
    return booster, params, featurize


def predict_quantiles(booster, featurize, df, scale=AFT_SCALE):
    """Every quantile from the one fitted distribution, so they cannot cross."""
    pred = booster.predict(xgb.DMatrix(featurize(df)))
    out = {}
    for q in QUANTILES:
        out[q] = pred * np.exp(scale * norm.ppf(q))
    return out


def experiment():
    """Does the censored reframe actually remove the early bias?

    Protocol mirrors pipeline.calibrate's: everything is fitted on pre-cutoff
    information only, and scored on arrivals from after the cutoff. The censored
    rows are built as of the cutoff too, so nothing about the future leaks in.
    """
    pools = {p["name"]: _prepare(pd.read_csv(p["input"])) for p in config.TRAIN_PLATFORMS}

    print("=" * 80)
    print("CENSORED SURVIVAL (AFT) vs the quantile models it would replace")
    print("=" * 80)
    print()
    print(f"{'platform':13s} {'obs':>5s} {'cens':>5s} {'test':>5s} | "
          f"{'AFT mae':>8s} {'bias':>7s} {'cover':>6s} | {'qr mae':>7s} {'bias':>7s} {'cover':>6s}")
    print("-" * 80)

    rows = []
    for item in config.TRAIN_PLATFORMS:
        name = item["name"]
        cut = pd.Timestamp(CUTOFFS[name])
        df = pools[name]

        observed = df[df["added_to_service"] <= cut]
        test = df[(df["added_to_service"] > cut) & (df["added_to_service"] <= TODAY)]
        if len(test) < 10:
            print(f"{name:13s} too little test data")
            continue

        censored = build_censored(name, pools, cut)

        booster, params, featurize = fit_aft(observed, censored)
        q = predict_quantiles(booster, featurize, test)
        actual = test["days_to_service"].astype(float).to_numpy()

        aft_mae = float(np.mean(np.abs(q[0.5] - actual)))
        aft_bias = float(np.median(q[0.5] - actual))
        aft_cov = float(np.mean((actual >= q[0.1]) & (actual <= q[0.9])))

        # the incumbent, fitted on the same observed rows and nothing else
        from .calibrate import fit_with_conformal
        fit = fit_with_conformal(observed)
        xt = fit["featurize"](test)
        s = np.sort(np.vstack([fit["models"]["0.1"].predict(xt),
                               fit["models"]["0.5"].predict(xt),
                               fit["models"]["0.9"].predict(xt)]), axis=0)
        off = fit["offset_sym"]
        qr_p50 = np.exp(s[1])
        qr_mae = float(np.mean(np.abs(qr_p50 - actual)))
        qr_bias = float(np.median(qr_p50 - actual))
        qr_cov = float(np.mean((actual >= np.exp(s[0] - off)) & (actual <= np.exp(s[2] + off))))

        print(f"{name:13s} {len(observed):5d} {len(censored):5d} {len(test):5d} | "
              f"{aft_mae:8.0f} {aft_bias:+7.0f} {aft_cov * 100:5.0f}% | "
              f"{qr_mae:7.0f} {qr_bias:+7.0f} {qr_cov * 100:5.0f}%")

        rows.append({
            "platform": name, "n_obs": len(observed), "n_cens": len(censored),
            "n_test": len(test),
            "aft_mae": aft_mae, "aft_bias": aft_bias, "aft_coverage": aft_cov,
            "qr_mae": qr_mae, "qr_bias": qr_bias, "qr_coverage": qr_cov,
        })

    if rows:
        n = sum(r["n_test"] for r in rows)
        print()
        print("bias is median(predicted - actual) in days. NEGATIVE means predicting")
        print("too early, which is the flaw the censored rows exist to fix. Closer to")
        print("zero is better; overshooting positive means the candidate universe is")
        print("too loose and is teaching the model that games arrive later than they do.")
        print()
        print(f"{'':13s} {'AFT':>10s} {'quantile':>10s}")
        for key, label in (("mae", "MAE (d)"), ("bias", "bias (d)"), ("coverage", "coverage")):
            a = sum(r[f"aft_{key}"] * r["n_test"] for r in rows) / n
            b = sum(r[f"qr_{key}"] * r["n_test"] for r in rows) / n
            if key == "coverage":
                print(f"{label:13s} {a * 100:9.0f}% {b * 100:9.0f}%")
            else:
                print(f"{label:13s} {a:10.0f} {b:10.0f}")
    return rows


if __name__ == "__main__":
    experiment()
