"""How likely a game that has not joined a service is to join it (D-041).

Two views of the same question, averaged:

  by age     the service's yearly join rate as a smooth curve of game age,
             times a factor for the game's Metacritic band and one for its
             publisher's record on that service.
  by window  a mixture cure model: the chance a game like it ever joins (one
             figure per service, times the same kinds of factors), spread over
             this game's own window - the timing model's P10/P50/P90 wait,
             read as a lognormal. A game inside its window keeps a high chance;
             one past it fades.

The parameters are measured at deploy by pipeline/odds.py and stored in
arrival_hazard.json under "odds". The pipeline's backtest imports these same
functions, so the figure that is tested is the figure that is served.
"""

import math

import numpy as np

YEAR_DAYS = 365.25
EVER_YEARS = 13.0     # "ever": far enough that the curve has flattened
PI_CAP = 0.95


def meta_band(score):
    """Metacritic score -> band label. No score is its own band: games without
    one are mostly small releases and join far less often."""
    try:
        s = float(score)
    except (TypeError, ValueError):
        return "none"
    if not s or s != s:
        return "none"
    if s >= 90:
        return "90+"
    if s >= 80:
        return "80s"
    if s >= 70:
        return "70s"
    return "<70"


def curve_rate(curve, ages):
    """Yearly join rate at each (continuous) age: exp(a + b*age) from the first
    birthday on, with its own level in the first year."""
    ages = np.asarray(ages, dtype=float)
    first = ages < 1
    x0, x1, x2 = curve
    return np.exp(x0 + x1 * ages * (~first) + x2 * first)


def age_cum(curve, ages, years, mult):
    """Chance of joining within `years` from each age, by the age view."""
    ages = np.asarray(ages, dtype=float)
    years = float(years)
    if years <= 0:
        return np.zeros_like(ages)
    steps = max(2, int(math.ceil(years * 24)) + 1)
    grid = np.linspace(0.0, years, steps)
    lam = np.trapz(np.stack([curve_rate(curve, ages + g) for g in grid]), grid, axis=0)
    return 1.0 - np.exp(-np.asarray(mult, dtype=float) * lam)


def _norm_cdf(z):
    return 0.5 * (1.0 + np.vectorize(math.erf)(np.asarray(z, dtype=float) / math.sqrt(2.0)))


def timing(p10_days, p50_days, p90_days):
    """Lognormal (mu, sigma) of the wait from release, from the timing model's
    three quantiles."""
    lo = np.log(np.maximum(np.asarray(p10_days, dtype=float), 1.0))
    mid = np.log(np.maximum(np.asarray(p50_days, dtype=float), 1.0))
    hi = np.log(np.maximum(np.asarray(p90_days, dtype=float), 1.0))
    sigma = np.maximum((hi - lo) / (2 * 1.2816), 0.05)
    return mid, sigma


def lognorm_cdf(days, mu, sigma):
    days = np.asarray(days, dtype=float)
    out = np.zeros(np.broadcast(days, mu).shape)
    pos = np.broadcast_to(days > 0, out.shape)
    z = (np.log(np.maximum(days, 1e-9)) - mu) / sigma
    out = np.where(pos, _norm_cdf(z), 0.0)
    return out


def window_between(pi, mu, sigma, age_from, age_to):
    """Chance of joining between two ages, given it has not joined by the first,
    by the window view."""
    f0 = lognorm_cdf(np.asarray(age_from, dtype=float) * YEAR_DAYS, mu, sigma)
    f1 = lognorm_cdf(np.asarray(age_to, dtype=float) * YEAR_DAYS, mu, sigma)
    return np.clip(pi * (f1 - f0) / np.maximum(1.0 - pi * f0, 1e-9), 0.0, 1.0)


def multipliers(params, bands, pubs):
    """Per-game factors for both views from the stored parameters."""
    ba, pa = params["band_age"], params["pub_age"]
    bw, pw = params["band_window"], params["pub_window"]
    mult_age = np.array([ba.get(b, 1.0) * (pa.get(p, 1.0) if p else 1.0) for b, p in zip(bands, pubs)])
    pi_g = np.minimum(PI_CAP, params["pi"] * np.array(
        [bw.get(b, 1.0) * (pw.get(p, 1.0) if p else 1.0) for b, p in zip(bands, pubs)]))
    return mult_age, pi_g


def within(params, ages, years, mult_age, pi_g, mu=None, sigma=None):
    """(average, by age, by window) chance of joining within `years` from each
    age. Without timing the answer is the age view alone."""
    a = age_cum(params["curve"], ages, years, mult_age)
    if mu is None:
        return a, a, None
    w = window_between(pi_g, mu, sigma, ages, np.asarray(ages, dtype=float) + float(years))
    return (a + w) / 2.0, a, w


def for_game(params, age, band, pub, p10_days=None, p50_days=None, p90_days=None,
             window_end_years=None, buckets=None, neutral_band=False):
    """Everything one answer needs, for a single game.

    window_end_years: years from now to the end of its window, if still ahead.
    buckets: list of (label, from_years, to_years) stretches from now.
    neutral_band: count the Metacritic band as x1 (a game whose missing score
    says nothing about it, such as a platform holder's own new release).
    """
    ages = np.array([float(age)])
    factor_band = None if neutral_band else band
    mult_age, pi_g = multipliers(params, [factor_band], [pub])
    mu = sigma = None
    if p10_days is not None and p50_days is not None and p90_days is not None:
        mu, sigma = timing([p10_days], [p50_days], [p90_days])

    def cum(years):
        avg, a, w = within(params, ages, years, mult_age, pi_g, mu, sigma)
        return float(avg[0]), float(a[0]), (None if w is None else float(w[0]))

    next_avg, next_age, next_win = cum(1.0)
    ever = cum(EVER_YEARS)[0]
    out = {
        "chance_next_year": round(next_avg, 4),
        "chance_ever": round(ever, 4),
        "chance_views": {
            "by_age": round(next_age, 4),
            "by_window": None if next_win is None else round(next_win, 4),
            "age_base": round(float(age_cum(params["curve"], ages, 1.0, np.array([1.0]))[0]), 4),
            "band": band,
            "band_neutral": bool(neutral_band),
            "band_factor_age": round(float(params["band_age"].get(factor_band, 1.0)), 3),
            "pub_factor_age": round(float(params["pub_age"].get(pub, 1.0)) if pub else 1.0, 3),
            "band_factor_window": round(float(params["band_window"].get(factor_band, 1.0)), 3),
            "pub_factor_window": round(float(params["pub_window"].get(pub, 1.0)) if pub else 1.0, 3),
            "ever_like_it": round(float(pi_g[0]), 4),
        },
    }
    if window_end_years is not None and window_end_years > 0:
        out["chance_by_window_end"] = round(cum(window_end_years)[0], 4)
    if buckets:
        rows = []
        for label, start, end in buckets:
            if end <= start:
                continue
            p = cum(end)[0] - (cum(start)[0] if start > 0 else 0.0)
            rows.append({"label": label, "from_years": round(start, 3), "to_years": round(end, 3),
                         "chance": round(max(0.0, p), 4)})
        out["chance_buckets"] = rows
    return out
