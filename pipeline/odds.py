"""Stage 4c - how likely a waiting game is to join, measured at deploy (D-041).

WHAT IT MEASURES
----------------
For each service, the parameters apps/backend/services/odds.py needs to answer
"how likely is this game to join, and over what stretch":

  curve        the yearly join rate as a smooth function of game age
  band_age     a factor per Metacritic band, against the curve
  pub_age      a factor per publisher, against the curve and band
  pi           the chance a game in the pool ever joins (mixture cure model)
  band_window  a factor per Metacritic band, against the cure model
  pub_window   a factor per publisher, against the cure model and band

Factors are shrunk toward 1 by counting K extra joins at exactly the usual rate:
(joined + K) / (expected + K), so a publisher with a thin record stays close to
the service as a whole.

WHAT IT COUNTS
--------------
Only games on another service's list (the pool the site answers for), only the
years the service existed (from its first recorded arrival), and for services
that only offer PC games, only games available on PC (RAWG platforms). Counting
years before a service existed, or arrivals of games that never waited in the
pool, pushes the rates the wrong way - see D-041.

THE GATE
--------
Before writing, every service is rebuilt as of each backtest date from the data
known then (the timing model included, retrained at that date) and asked which
waiting games would join in the following year. If the new figures score worse
than the age table (pipeline.hazard) on average, that service keeps the age
table: its "odds" entry is null and the backend falls back. The results are
written next to the parameters for the Statistics page.
"""

import contextlib
import io
import json
import os
import pickle
import sys

import numpy as np
import pandas as pd
from scipy.optimize import minimize, minimize_scalar

from . import config, hazard, train

if config.BACKEND_DIR not in sys.path:
    sys.path.insert(0, config.BACKEND_DIR)
from services import odds as serve  # noqa: E402  the serving math, shared

K = 2.0
PC_ONLY = {"Epic.csv", "HB.csv"}
CUTOFFS = ["2024-09-25", "2025-09-25"]
EPS = 1e-4
YEAR = hazard.YEAR
MAX_AGE = hazard.MAX_AGE
CSVS = list(config.CANONICAL.values())
TRAIN_BY_CSV = {os.path.basename(p["input"]): p for p in config.TRAIN_PLATFORMS}


# ---------- inputs ----------

def _primary(pub):
    if pub is None or (isinstance(pub, float) and np.isnan(pub)):
        return None
    s = str(pub).split(",")[0].strip()
    return s if s and s.lower() not in ("nan", "unknown", "none") else None


def details(frames: dict) -> tuple[dict, dict]:
    """PC availability and Metacritic by normalised game name.

    PC from the stored RAWG details (None when RAWG has no entry, which counts as
    eligible). Metacritic from our canonical data first, then RAWG.
    """
    plat, meta = {}, {}
    path = os.path.join(config.DATA_CANONICAL, "rawg_details.jsonl")
    rawg_meta = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                try:
                    d = json.loads(line)
                except ValueError:
                    continue
                for k in {hazard._norm(d.get("name")), hazard._norm(d.get("slug"))}:
                    if not k:
                        continue
                    plat.setdefault(k, any(p in ("PC", "macOS", "Linux") for p in (d.get("platforms") or [])))
                    if d.get("metacritic"):
                        rawg_meta.setdefault(k, float(d["metacritic"]))
    for df in frames.values():
        scores = pd.to_numeric(df.get("metacritic_score"), errors="coerce")
        for k, m in zip(df["key"], scores):
            if pd.notna(m) and m > 0:
                meta.setdefault(k, float(m))
    for k, m in rawg_meta.items():
        meta.setdefault(k, m)
    return plat, meta


def _pub_map(frames: dict) -> dict:
    out = {}
    for csv in CSVS:
        for k, p in zip(frames[csv]["key"], frames[csv]["publisher"]):
            if k not in out:
                pp = _primary(p)
                if pp:
                    out[k] = pp
    return out


def pool_games(frames: dict, csv: str, as_of, pmap: dict) -> pd.DataFrame:
    """Every game on another service's list, as of a date: arrived on this
    service (with its age at arrival) or still waiting (with its age now). The
    same counting as hazard.compute, restricted to the pool."""
    as_of = pd.Timestamp(as_of)
    mine = frames[csv]
    others = pd.concat([f for c, f in frames.items() if c != csv], ignore_index=True)
    pool = set(others["key"])
    first = (mine.dropna(subset=["rel", "added"]).loc[lambda d: d["added"] <= as_of]
             .sort_values("added").drop_duplicates("key"))
    rows, seen = [], set()
    for k, a, r, p in zip(first["key"], first["added"], first["rel"], first["publisher"]):
        if (a - r).days >= 0 and k in pool:
            rows.append((k, _primary(p) or pmap.get(k), r, True, (a - r).days / YEAR))
        seen.add(k)
    o = others.dropna(subset=["rel"]).drop_duplicates("key")
    for k, r, p in zip(o["key"], o["rel"], o["publisher"]):
        if k not in seen and (as_of - r).days > 0:
            rows.append((k, _primary(p) or pmap.get(k), r, False, (as_of - r).days / YEAR))
    return pd.DataFrame(rows, columns=["key", "pub", "rel", "arrived", "age"])


def game_years(games: pd.DataFrame, start) -> pd.DataFrame:
    """One row per game-year at risk, from release, inside the service's life."""
    top = np.minimum(games["age"].astype(int).to_numpy(), MAX_AGE)
    gi = np.repeat(np.arange(len(games)), top + 1)
    a = np.concatenate([np.arange(t + 1) for t in top]) if len(top) else np.array([], dtype=int)
    rel = games["rel"].to_numpy()[gi]
    mid = rel + pd.to_timedelta((a + 0.5) * YEAR, unit="D").to_numpy()
    joined = games["arrived"].to_numpy()[gi] & (a == games["age"].astype(int).to_numpy()[gi])
    rows = pd.DataFrame({"gi": gi, "age": a, "m": a + 0.5, "O": joined.astype(float)})
    return rows[mid >= np.datetime64(pd.Timestamp(start))].reset_index(drop=True)


def _group_r(keys, observed, expected) -> dict:
    d = pd.DataFrame({"g": keys, "O": observed, "E": expected}).dropna(subset=["g"]).groupby("g").sum()
    return {str(g): round(float(v), 4) for g, v in ((d["O"] + K) / (d["E"] + K)).items()}


def _fit_curve(rows: pd.DataFrame) -> list:
    m, a, y = rows["m"].to_numpy(), rows["age"].to_numpy(), rows["O"].to_numpy()
    X = np.column_stack([np.ones_like(m), m * (a >= 1), (a < 1).astype(float)])

    def nll(th):
        eta = X @ th
        return -(y * eta - np.exp(eta)).sum()

    def grad(th):
        return -(X.T @ (y - np.exp(X @ th)))

    th0 = np.array([np.log(max(y.mean(), 1e-4)), 0.0, 0.0])
    return [round(float(v), 6) for v in minimize(nll, th0, jac=grad, method="BFGS").x]


# ---------- the timing model, as deployed or as of a past date ----------

def _bundle(csv: str, cutoff=None) -> dict:
    """The timing model: the deployed bundle, or one retrained on what was known
    at a past date (for the backtest, so it cannot see the answers)."""
    plat = TRAIN_BY_CSV[csv]
    if cutoff is None:
        with open(os.path.join(config.MODELS_DIR, config.artifacts(plat["name"])["bundle"]), "rb") as f:
            return pickle.load(f)
    with contextlib.redirect_stdout(io.StringIO()):
        prep = train._prepare(config.read_served(plat["input"]))
        df = train.organic(prep[prep["added_to_service"] <= pd.Timestamp(cutoff)])
        cqr, _ = train._fit_conformal_offset(df)
        params, featurize = train._build_featurizer(df)
        X = featurize(df)
        y = np.log(df["days_to_service"])
        models = {str(q): train._make_quantile_model(q).fit(X, y) for q in train.QUANTILES}
    return {"models": models, "cqr_offset": cqr, **params}


def timing_for(bundle: dict, pubs, metas, rels) -> tuple[np.ndarray, np.ndarray]:
    """Lognormal timing per game from the bundle, built exactly as the backend
    builds its feature row (services/predictor.py predict_new_xgb)."""
    rel = pd.to_datetime(pd.Series(rels), errors="coerce")
    med = bundle.get("median_meta", 75)
    feat = pd.DataFrame({
        "metacritic_score": [float(m) if m and m == m else float(med) for m in metas],
        "pub_te": [float(bundle["te_map"].get(p or "", bundle["global_mean_days"])) for p in pubs],
        "pub_count": [float(bundle["pub_count"].get(p or "", 0)) for p in pubs],
        "pub_cv": [float(bundle["pub_cv"].get(p or "", 0.5)) for p in pubs],
        "rel_year": rel.dt.year.fillna(bundle["rel_year_med"]).clip(upper=bundle.get("rel_year_cap", 9999)).to_numpy(),
        "rel_month": rel.dt.month.fillna(6).to_numpy(),
        "rel_quarter": rel.dt.quarter.fillna(2).to_numpy(),
    })
    X = feat[bundle["features"]].to_numpy(dtype=float)
    cqr = float(bundle.get("cqr_offset", 0.0) or 0.0)
    lo = bundle["models"]["0.1"].predict(X) - cqr
    mid = bundle["models"]["0.5"].predict(X)
    hi = bundle["models"]["0.9"].predict(X) + cqr
    lo, mid, hi = np.sort(np.vstack([lo, mid, hi]), axis=0)
    return serve.timing(np.exp(lo), np.exp(mid), np.exp(hi))


# ---------- fit ----------

def fit(frames: dict, csv: str, as_of, bundle: dict, plat: dict, meta: dict) -> dict:
    """The parameters for one service, from data as of a date."""
    pmap = _pub_map(frames)
    games = pool_games(frames, csv, as_of, pmap)
    if csv in PC_ONLY:
        games = games[[plat.get(k, True) is not False for k in games["key"]]].reset_index(drop=True)
    start = frames[csv]["added"].min()
    rows = game_years(games, start)
    pubs = games["pub"].to_numpy()[rows["gi"]]
    bands = np.array([serve.meta_band(meta.get(k)) for k in games["key"]])[rows["gi"]]
    O = rows["O"].to_numpy()

    # by age
    curve = _fit_curve(rows)
    rate = serve.curve_rate(curve, rows["m"].to_numpy())
    band_age = _group_r(bands, O, rate)
    pub_age = _group_r(pubs, O, rate * np.array([band_age.get(b, 1.0) for b in bands]))

    # by window: the game's own timing, read once; only the cure share is fitted
    mu_g, sg_g = timing_for(bundle, games["pub"].tolist(), [meta.get(k) for k in games["key"]], games["rel"].tolist())
    mu, sg = mu_g[rows["gi"]], sg_g[rows["gi"]]
    a = rows["age"].to_numpy().astype(float)
    F0 = serve.lognorm_cdf(a * YEAR, mu, sg)
    F1 = serve.lognorm_cdf((a + 1) * YEAR, mu, sg)

    def hz(pi):
        return np.clip(pi * (F1 - F0) / np.maximum(1 - pi * F0, 1e-9), EPS, 1 - EPS)

    def nll(pi):
        h = hz(pi)
        return -(O * np.log(h) + (1 - O) * np.log(1 - h)).sum()

    pi = float(minimize_scalar(nll, bounds=(1e-4, 0.99), method="bounded").x)
    e = hz(pi)
    band_window = _group_r(bands, O, e)
    pub_window = _group_r(pubs, O, e * np.array([band_window.get(b, 1.0) for b in bands]))
    return {"version": 1, "k": K, "pc_only": csv in PC_ONLY, "as_of": pd.Timestamp(as_of).strftime("%Y-%m-%d"),
            "curve": curve, "pi": round(pi, 5), "band_age": band_age, "pub_age": pub_age,
            "band_window": band_window, "pub_window": pub_window}


def predict(params: dict, bundle: dict, keys, pubs, ages, rels, plat: dict, meta: dict, csv: str, years=1.0) -> np.ndarray:
    """The served chance for many games at once (the backtest's view of the site)."""
    bands = [serve.meta_band(meta.get(k)) for k in keys]
    mult_age, pi_g = serve.multipliers(params, bands, list(pubs))
    mu, sg = timing_for(bundle, list(pubs), [meta.get(k) for k in keys], list(rels))
    p, _, _ = serve.within(params, np.asarray(ages, dtype=float), years, mult_age, pi_g, mu, sg)
    if csv in PC_ONLY:
        p = np.where([plat.get(k, True) is not False for k in keys], p, EPS)
    return p


# ---------- the gate ----------

def _logloss(p, y) -> float:
    p = np.clip(p, EPS, 1 - EPS)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def backtest(full: dict, csv: str, plat: dict, meta: dict) -> list:
    """Age table vs the new figures at each backtest date, on games waiting then."""
    out = []
    for c in CUTOFFS:
        C = pd.Timestamp(c)
        fr = {k: v[v["added"] <= C].copy() for k, v in full.items()}
        table = hazard.compute(as_of=C, frames=fr)
        h_old = np.array([b["chance_next_year"] for b in table["by_dataset"][csv]])
        pmap = _pub_map(fr)
        on_s = set(fr[csv]["key"])
        others = pd.concat([f for k, f in fr.items() if k != csv], ignore_index=True)
        others = others.dropna(subset=["rel"]).drop_duplicates("key")
        test = others[(~others["key"].isin(on_s)) & ((C - others["rel"]).dt.days > 0)].copy()
        test["pub"] = [_primary(p) or pmap.get(k) for p, k in zip(test["publisher"], test["key"])]
        test["age"] = (C - test["rel"]).dt.days / YEAR
        later = full[csv]
        joined = set(later.loc[(later["added"] > C) & (later["added"] <= C + pd.Timedelta(days=365)), "key"])
        y = test["key"].isin(joined).astype(int).to_numpy()
        p_old = h_old[np.minimum(test["age"].astype(int).to_numpy(), MAX_AGE)]
        bundle = _bundle(csv, C)
        params = fit(fr, csv, C, bundle, plat, meta)
        p_new = predict(params, bundle, test["key"].tolist(), test["pub"].tolist(), test["age"].to_numpy(),
                        test["rel"].tolist(), plat, meta, csv)
        out.append({"cutoff": c, "waiting": int(len(test)), "joined": int(y.sum()),
                    "expected_old": round(float(p_old.sum()), 1), "expected_new": round(float(p_new.sum()), 1),
                    "logloss_old": round(_logloss(p_old, y), 5), "logloss_new": round(_logloss(p_new, y), 5)})
    return out


def run(path=None) -> dict:
    """Measure, gate and write. Adds "odds" and "odds_backtest" to
    arrival_hazard.json and writes metacritic.json for the backend."""
    path = path or os.path.join(config.BACKEND_DIR, "arrival_hazard.json")
    full = {csv: hazard._load(csv) for csv in CSVS}
    plat, meta = details(full)
    now = pd.Timestamp.now().normalize()
    params_out, tests_out = {}, {}
    for csv in CSVS:
        tests = backtest(full, csv, plat, meta)
        old = np.mean([t["logloss_old"] for t in tests])
        new = np.mean([t["logloss_new"] for t in tests])
        used = bool(new <= old)
        params_out[csv] = fit(full, csv, now, _bundle(csv), plat, meta) if used else None
        tests_out[csv] = {"used": used, "tests": tests}
        print(f"  {csv:9s} odds {'NEW' if used else 'KEPT AGE TABLE'}: log loss {old:.4f} -> {new:.4f}; "
              + "; ".join(f"{t['cutoff'][:4]} expected {t['expected_new'] if used else t['expected_old']} "
                          f"joined {t['joined']}" for t in tests))
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    data["odds"] = params_out
    data["odds_backtest"] = tests_out
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1)

    meta_path = os.path.join(config.BACKEND_DIR, "metacritic.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump({k: meta[k] for k in sorted(meta)}, f, separators=(",", ":"))
    print(f"  Metacritic on record for {len(meta)} games -> {meta_path}")
    return {"odds": params_out, "odds_backtest": tests_out}


if __name__ == "__main__":
    run()
