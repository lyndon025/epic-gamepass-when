"""Stage 6b - the games behind the accuracy figures, per service (D-054).

The Statistics page's tables summarise two tests. This writes the games behind
them, so each service's figures can be checked one game at a time:

  WHEN     pipeline.scorecard's out-of-time test: the replica trained on data up
           to each service's cutoff, then every organic arrival after it up to
           holdout.TODAY, with the best guess, the range shown and the real
           month.
  WHETHER  pipeline.odds' backtest: every game waiting at each backtest date,
           the chance the site would have shown then, and which joined within
           a year. Kept: the top 10 picks, every game that joined, and totals
           by chance band.

Writes apps/frontend/public/accuracy.json. No RAWG calls.
"""

import contextlib
import io
import json
import os

import numpy as np
import pandas as pd

from . import config, hazard, odds, scorecard
from .holdout import CUTOFFS, TODAY

PUBLIC = os.path.join(config.REPO_ROOT, "apps", "frontend", "public")
KEY = {"Xbox": "gamepass", "PSPlus": "psplus", "Epic": "epic", "HumbleBundle": "humble"}
CSV = {"gamepass": "Xbox.csv", "psplus": "PS.csv", "epic": "Epic.csv", "humble": "HB.csv"}
MONTH = 30.44
WITHIN = (3, 6, 12, 24, 36)
BANDS = [(0.10, 1.01, "10% or more"), (0.05, 0.10, "5 to 10%"), (0.02, 0.05, "2 to 5%"),
         (0.01, 0.02, "1 to 2%"), (0.005, 0.01, "0.5 to 1%"), (0.0, 0.005, "Under 0.5%")]


def _month(ts):
    return None if ts is None or pd.isna(ts) else pd.Timestamp(ts).strftime("%Y-%m")


def _name(s):
    # A few source rows carry a broken apostrophe.
    return str(s).replace("�", "'").strip() if s is not None and not pd.isna(s) else None


def when(name: str, csv_path: str) -> dict | None:
    """Every unseen arrival: best guess, range shown, real month."""
    with contextlib.redirect_stdout(io.StringIO()):
        g = scorecard.holdout_games(name, csv_path)
    if g is None:
        return None
    rel = pd.to_datetime(g["release_date"], errors="coerce")
    actual = g["days_to_service"].astype(float).to_numpy()
    off = (g["p50"].to_numpy() - actual) / MONTH
    inside = (actual >= g["low"].to_numpy()) & (actual <= g["high"].to_numpy())
    games = []
    for i, r in g.iterrows():
        games.append({
            "game": _name(r["game_name"]), "publisher": _name(r["primary_publisher"]), "released": _month(rel[i]),
            "guess": _month(rel[i] + pd.Timedelta(days=float(r["p50"]))),
            "low": _month(rel[i] + pd.Timedelta(days=float(r["low"]))),
            "high": _month(rel[i] + pd.Timedelta(days=float(r["high"]))),
            "arrived": _month(r["added_to_service"]), "off": round(float(off[i]), 1), "inside": bool(inside[i]),
        })
    games.sort(key=lambda x: abs(x["off"]))
    err = np.abs(off)
    return {"from": CUTOFFS[name], "to": TODAY.strftime("%Y-%m-%d"), "n": len(games),
            "within": {str(m): round(float(np.mean(err <= m)), 3) for m in WITHIN},
            "inside": round(float(np.mean(inside)), 3), "games": games}


def whether(key: str, full: dict, plat: dict, meta: dict, used: bool) -> list:
    """Each backtest date: totals, top picks, bands and every game that joined."""
    out = []
    for c in odds.CUTOFFS:
        with contextlib.redirect_stdout(io.StringIO()):
            t = odds.test_games(full, CSV[key], c, plat, meta)
        t["p"] = t["p_new"] if used else t["p_old"]
        t = t.sort_values("p", ascending=False).reset_index(drop=True)
        t["rank"] = np.arange(1, len(t) + 1)

        def game(r):
            return {"game": _name(r["game"]), "publisher": _name(r["pub"]), "chance": round(float(r["p"]), 4),
                    "rank": int(r["rank"]), "joined": _month(r["joined_on"])}

        bands = []
        for lo, hi, label in BANDS:
            m = (t["p"] >= lo) & (t["p"] < hi)
            bands.append({"label": label, "games": int(m.sum()), "expected": round(float(t.loc[m, "p"].sum()), 1),
                          "joined": int(t.loc[m, "joined"].sum())})
        joined = int(t["joined"].sum())
        out.append({
            "cutoff": c, "waiting": int(len(t)), "expected": round(float(t["p"].sum()), 1), "joined": joined,
            "top": {str(n): {"joined": int(t["joined"].head(n).sum()), "expected": round(float(t["p"].head(n).sum()), 1)}
                    for n in (20, 100)},
            # Twenty waiting games picked at random would expect this many to join.
            "random20": round(20 * joined / len(t), 2) if len(t) else None,
            "bands": bands,
            "top10": [game(r) for _, r in t.head(10).iterrows()],
            "joined_games": [game(r) for _, r in t[t["joined"] == 1].iterrows()],
        })
    return out


def build() -> dict:
    with open(os.path.join(config.BACKEND_DIR, "arrival_hazard.json"), encoding="utf-8") as f:
        tests = json.load(f).get("odds_backtest", {})
    full = {c: hazard._load(c) for c in odds.CSVS}
    plat, meta = odds.details(full)
    services = {}
    for p in config.TRAIN_PLATFORMS:
        key = KEY[p["name"]]
        services[key] = {"when": when(p["name"], p["input"]),
                         "whether": whether(key, full, plat, meta, bool(tests.get(CSV[key], {}).get("used", True)))}
    return {"services": services}


def run(path=None) -> dict:
    path = path or os.path.join(PUBLIC, "accuracy.json")
    data = build()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"), ensure_ascii=False)
    for k, v in data["services"].items():
        w = v["when"]
        print(f"  accuracy {k:9s} {w['n'] if w else 0} arrivals scored; "
              + "; ".join(f"{t['cutoff'][:4]} top 20 joined {t['top']['20']['joined']}" for t in v["whether"]))
    return data


if __name__ == "__main__":
    run()
