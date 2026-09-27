"""When a Sony-published PS4 or PS5 game joins PS Plus Extra.

One implementation, used by the predictor at start-up and by the pipeline at
deploy (pipeline.hazard.add_sony_window), so the range shown and the range
measured cannot drift apart (D-035, D-037).

THE ANSWER
----------
Best guess: BEST_GUESS_MONTHS after release. A range measured from Sony's own
record would be the obvious improvement, but tested walk-forward its median
did not beat this fixed guess (mean error 8.1 vs 8.0 months), so the guess
stays and only the range is measured.

Range: the 10th to 90th percentile of months from release to joining, over
Sony games released from MIN_RELEASE that joined after PS Plus Extra launched.
Earlier arrivals are left out: the June 2022 launch added years of back
catalogue at once, which says nothing about how long a new Sony game waits.
Walk-forward, this range held for 78% of games; the old "12 to 24 months"
held for 36%.

Track record: how often the fixed guess landed within 1, 2 and 3 years on
those same games. The guess is not fitted to them, so this is out of sample.
"""

import re

import pandas as pd

BEST_GUESS_MONTHS = 18.0
EXTRA_LAUNCH = pd.Timestamp("2022-06-13")
MIN_RELEASE = pd.Timestamp("2019-01-01")
MIN_LAG_MONTHS = 2.0        # launch-day deals are a different question
MIN_GAMES = 8               # fewer and there is no range to speak of
DAYS_PER_MONTH = 30.44

# No bare "sie": it is a substring of Sierra Games and Sierra On-Line.
SONY_KEYWORDS = ("sony", "playstation studios", "playstation pc")

RECORD_SUBJECT = "Sony PS4 and PS5 games that joined PS Plus Extra since June 2022"


def is_sony(publisher) -> bool:
    text = str(publisher or "").lower()
    return any(k in text for k in SONY_KEYWORDS)


def _norm(name):
    return re.sub(r"[^a-z0-9]", "", str(name).lower())


def _arrivals(df, as_of=None):
    """The games the window is measured on: first arrival per Sony game, with
    its wait in months (column "lag"). Arrivals dated after as_of are announced,
    not waits that happened, and are left out."""
    need = {"game_name", "publisher", "release_date", "added_to_service"}
    if not need.issubset(df.columns):
        return df.iloc[0:0].assign(lag=pd.Series(dtype=float))
    d = df.dropna(subset=["release_date", "added_to_service"])
    if as_of is not None:
        d = d[d["added_to_service"] <= as_of]
    d = d[d["publisher"].map(is_sony)]
    d = d.assign(_k=d["game_name"].map(_norm)).sort_values("added_to_service")
    d = d.drop_duplicates("_k", keep="first")
    d = d.assign(lag=(d["added_to_service"] - d["release_date"]).dt.days / DAYS_PER_MONTH)
    keep = (d["added_to_service"] >= EXTRA_LAUNCH) & (d["release_date"] >= MIN_RELEASE) & (d["lag"] > MIN_LAG_MONTHS)
    return d[keep]


def _pool(df, as_of=None):
    """Months from release to first arrival, one value per Sony game."""
    return _arrivals(df, as_of)["lag"]


def recent(df, as_of=None, limit=3):
    """The newest Sony arrivals the window is measured on, as page evidence:
    [{game, months, joined}], newest first."""
    d = _arrivals(df, as_of)
    d = d.sort_values("added_to_service", ascending=False).head(limit)
    return [{"game": r.game_name, "months": int(round(r.lag)),
             "joined": r.added_to_service.strftime("%B %Y")} for r in d.itertuples()]


def measure(df, as_of=None):
    """The window, or None when too few Sony games have arrived to measure one.

    Returns {"low", "high", "best"} in months after release, "n", and a
    track record {"n", "y1", "y2", "y3", "subject"} in tenths.
    """
    lag = _pool(df, as_of)
    if len(lag) < MIN_GAMES:
        return None
    low, high = (float(v) for v in lag.quantile([0.1, 0.9]))
    best = min(max(BEST_GUESS_MONTHS, low), high)
    err = (lag - best).abs()
    tenths = lambda months: int(round(float((err <= months).mean()) * 10))
    return {
        "low": round(low, 1),
        "high": round(high, 1),
        "best": round(best, 1),
        "n": int(len(lag)),
        "record": {"n": int(len(lag)), "y1": tenths(12), "y2": tenths(24), "y3": tenths(36),
                   "subject": RECORD_SUBJECT},
    }
