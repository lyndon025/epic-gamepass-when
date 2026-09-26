"""How likely a game that already appeared is to come back within a year.

One implementation, used by the predictor at start-up and by any pipeline
check, so the odds shown and the odds tested cannot drift apart.

THE TABLE
---------
For every run that has ended, each full year after it either sees the game
come back (an event) or not (still at risk). The clock starts at the giveaway
(Epic, Humble) or when the game left (Game Pass, PS Plus); years that run past
the data date are not counted. Thin later years are pooled into one tail and
the tail may not rise with age.

CALIBRATION
-----------
Measured over the whole history, the table runs high: returns were more common
in each service's early years. Tested out of time (build the table from data
before a date, see which waiting games came back in the following year), it
predicted about twice as many returns as happened. So the table is scaled by
the ratio of actual to predicted returns over the last CALIBRATION_YEARS
yearly test points, pooled because single years are lumpy (holiday repeat
sprees, a catalogue refresh). The ratio is re-measured whenever the data
changes and never raises the odds.

A publisher factor was tested the same way and made predictions worse on Game
Pass and PS Plus at every shrinkage strength, and was no better on Epic, so it
is not used.
"""

import re

import numpy as np
import pandas as pd

MAX_YEARS = 8
SMOOTHING = 30          # weight toward the service-wide rate
OWN_CELL = 150          # games at risk a year needs to stand alone
MERGE_DAYS = 45         # one event recorded twice
CALIBRATION_YEARS = 3


def _norm(name):
    return re.sub(r"[^a-z0-9]", "", str(name).lower())


def _runs(df):
    """Per game, its runs as (added, removed), duplicates merged."""
    out = {}
    for key, grp in df.groupby(df["game_name"].map(_norm)):
        runs = []
        for a, r in grp.sort_values("added_to_service")[["added_to_service", "removed_from_service"]].itertuples(index=False):
            if runs and (a - runs[-1][0]).days <= MERGE_DAYS:
                continue
            runs.append((a, r))
        out[key] = runs
    return out


def _years_at_risk(runs, catalogue, end):
    """(years_since, returned) for each full year that finished by `end`."""
    rows = []
    for i, (a, r) in enumerate(runs):
        ref = r if catalogue else a
        if pd.isna(ref) or ref > end:
            continue
        nxt = runs[i + 1][0] if i + 1 < len(runs) else None
        for k in range(MAX_YEARS + 1):
            lo = ref + pd.DateOffset(years=k)
            hi = ref + pd.DateOffset(years=k + 1)
            if hi > end or (nxt is not None and nxt < lo):
                break
            returned = nxt is not None and lo <= nxt < hi
            rows.append((k, returned))
            if returned:
                break
    return rows


def _table(rows):
    risk = np.zeros(MAX_YEARS + 1)
    events = np.zeros(MAX_YEARS + 1)
    for k, returned in rows:
        risk[k] += 1
        events[k] += returned
    overall = events.sum() / risk.sum() if risk.sum() else 0.0
    odds, k = {}, 0
    while k <= MAX_YEARS:
        if risk[k] >= OWN_CELL:
            odds[k] = float((events[k] + overall * SMOOTHING) / (risk[k] + SMOOTHING))
            k += 1
            continue
        ev, rk = events[k:].sum(), risk[k:].sum()
        tail = float((ev + overall * SMOOTHING) / (rk + SMOOTHING)) if rk else overall
        for j in range(k, MAX_YEARS + 1):
            odds[j] = tail
        break
    for j in range(3, MAX_YEARS + 1):
        odds[j] = min(odds[j], odds[j - 1])
    return odds


def _as_known_at(df, cut):
    known = df[df["added_to_service"] < cut].copy()
    known.loc[known["removed_from_service"] >= cut, "removed_from_service"] = pd.NaT
    return known


def calibration(df, catalogue, as_of):
    """Actual over predicted returns at the last CALIBRATION_YEARS yearly test
    points before as_of, pooled; 1.0 when there is too little to measure."""
    predicted = actual = 0.0
    for back in range(1, CALIBRATION_YEARS + 1):
        cut = as_of - pd.DateOffset(years=back)
        known = _as_known_at(df, cut)
        rows = []
        runs_then = _runs(known)
        for runs in runs_then.values():
            rows += _years_at_risk(runs, catalogue, cut)
        if not rows:
            continue
        odds = _table(rows)
        horizon = cut + pd.DateOffset(years=1)
        runs_after = _runs(df[df["added_to_service"] < horizon])
        for key, runs in runs_then.items():
            a, r = runs[-1]
            ref = r if catalogue else a
            if pd.isna(ref) or ref >= cut:
                continue
            k = min(MAX_YEARS, int((cut - ref).days // 365.25))
            predicted += odds[k]
            actual += any(cut <= x[0] < horizon for x in runs_after.get(key, []))
    if predicted < 10:
        return 1.0
    return float(min(1.0, actual / predicted))


def table(df, catalogue, as_of):
    """The uncalibrated table {years_since: chance}. Quick enough for start-up."""
    dated = df.dropna(subset=["added_to_service"])
    dated = dated[dated["added_to_service"] <= as_of]
    rows = []
    for runs in _runs(dated).values():
        rows += _years_at_risk(runs, catalogue, as_of)
    return _table(rows)


def measure(df, catalogue, as_of):
    """The calibrated table {years_since: chance} and the factor applied.

    Takes tens of seconds on the larger services, so it runs at deploy
    (pipeline.hazard.add_return_odds) and the backend reads the result.
    """
    dated = df.dropna(subset=["added_to_service"])
    dated = dated[dated["added_to_service"] <= as_of]
    odds = table(dated, catalogue, as_of)
    factor = calibration(dated, catalogue, as_of)
    return {k: v * factor for k, v in odds.items()}, factor
