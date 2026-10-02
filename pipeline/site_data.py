"""Stage 6b - the data files the site's pages read, built from the stored answers.

Runs after pipeline.precompute. Everything here is derived from answers the
backend itself produced, so a page can never show a different figure from the
game's own prediction page.

  apps/frontend/public/rankings.json     most likely to join next, per service (D-040)
  apps/frontend/public/odds_rank.json    every waiting game's chance, for "better odds
                                         than N in 10" on the prediction card
  apps/frontend/public/statistics.json   how the answers are tested (D-040)
  apps/frontend/api/_precomputed/games.json
                                         game name -> [RAWG slug, cover image], so the
                                         server-side leaderboard can link each game to its
                                         own prediction and show its cover (no RAWG calls)
  data/rankings_archive/<date>.json      the published lists, kept so they can be
                                         scored later and never revised (D-042)
"""

import glob
import json
import os

import numpy as np
import pandas as pd

from . import config, hazard

FRONTEND = os.path.join(config.REPO_ROOT, "apps", "frontend")
PRECOMPUTED = os.path.join(FRONTEND, "api", "_precomputed")
PUBLIC = os.path.join(FRONTEND, "public")
ARCHIVE = os.path.join(config.REPO_ROOT, "data", "rankings_archive")
SERVICE_CSV = {"epic": "Epic.csv", "gamepass": "Xbox.csv", "psplus": "PS.csv", "humble": "HB.csv"}
TOP = 20
# Answers that carry a forecast chance for a game not yet on the service.
CHANCE_GRAINS = {"month", "year", "floor", "suppressed", "window", "fading", "unlikely-soon"}


def _resize(url):
    """RAWG's own resized copy (420 px wide) instead of the full image."""
    if not url:
        return None
    for part in ("/media/games/", "/media/screenshots/"):
        if part in url:
            return url.replace(part, "/media/resize/420/-/" + part.split("/media/")[1])
    return url


def _details():
    out = {}
    with open(os.path.join(config.DATA_CANONICAL, "rawg_details.jsonl"), encoding="utf-8") as f:
        for line in f:
            try:
                d = json.loads(line)
            except ValueError:
                continue
            if d.get("rawg_slug"):
                out[d["rawg_slug"]] = d
    return out


def _stored(service):
    answers = {}
    for path in glob.glob(os.path.join(PRECOMPUTED, service, "*.json")):
        with open(path, encoding="utf-8") as f:
            answers.update(json.load(f))
    return answers


def rankings(details, as_of):
    out = {"as_of": as_of, "computed_at": pd.Timestamp.now().strftime("%Y-%m-%d"), "services": {}}
    ranks = {"as_of": as_of, "services": {}}
    for service in SERVICE_CSV:
        cands, announced = [], []
        for slug, e in _stored(service).items():
            a, d = e["a"], details.get(slug, {})
            image = _resize(d.get("background_image"))
            if a.get("grain") == "announced":
                announced.append({"name": e["in"]["name"], "slug": slug, "date": a.get("arriving_on"), "image": image})
                continue
            if a.get("grain") not in CHANCE_GRAINS or a.get("chance_next_year") is None:
                continue
            rel = pd.to_datetime(e["in"].get("released"), errors="coerce")
            cands.append({"name": e["in"]["name"], "slug": slug, "publisher": (e["in"].get("publisher") or "").split(",")[0].strip() or None,
                          "year": int(rel.year) if pd.notna(rel) else None, "chance": float(a["chance_next_year"]), "image": image})
        cands.sort(key=lambda g: (-g["chance"], g["name"]))
        top = [{"rank": i + 1, **g} for i, g in enumerate(cands[:TOP])]
        out["services"][service] = {"waiting": len(cands), "announced": announced, "likely": top}

        chances = np.array([g["chance"] for g in cands])
        if len(chances):
            vals, counts = np.unique(np.round(chances, 4), return_counts=True)
            ranks["services"][service] = {
                "waiting": int(len(chances)),
                "under_1": round(float((chances < 0.01).mean()), 4),
                "median": round(float(np.median(chances)), 4),
                "buckets": [[float(v), int(n)] for v, n in zip(vals, counts)],
            }
        print(f"  {service:9s} {len(cands)} waiting with a chance; top: "
              + ", ".join(f"{g['name']} {g['chance'] * 100:.0f}%" for g in top[:3]))
    return out, ranks


def archive(rank_file):
    """Keep the published lists (D-042). One file per publish date."""
    os.makedirs(ARCHIVE, exist_ok=True)
    path = os.path.join(ARCHIVE, f"{rank_file['computed_at']}.json")
    keep = {"published": rank_file["computed_at"], "data_as_of": rank_file["as_of"],
            "services": {s: [{"name": g["name"], "slug": g["slug"], "chance": g["chance"]} for g in v["likely"]]
                         for s, v in rank_file["services"].items()}}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(keep, f, indent=1, ensure_ascii=False)
    return path


def rankings_check(today):
    """Score every archived list at least a quarter old: of the listed games,
    how many joined since it was published, against how many the chances add up
    to over the time that has passed (D-042)."""
    rows = []
    frames = {s: hazard._load(csv) for s, csv in SERVICE_CSV.items()}
    for path in sorted(glob.glob(os.path.join(ARCHIVE, "*.json"))):
        with open(path, encoding="utf-8") as f:
            a = json.load(f)
        published = pd.Timestamp(a["published"])
        years = (today - published).days / hazard.YEAR
        if years < 0.2:
            continue
        for service, games in a["services"].items():
            df = frames[service]
            joined_keys = set(df.loc[df["added"] > published, "key"])
            joined = sum(1 for g in games if hazard._norm(g["name"]) in joined_keys)
            expected = sum(1 - (1 - g["chance"]) ** min(years, 1.0) for g in games)
            rows.append({"published": a["published"], "service": service, "listed": len(games),
                         "expected": round(expected, 1), "joined": joined})
    return rows


def statistics(as_of):
    from . import backtest, holdout, scorecard, train

    status = {}
    status_path = os.path.join(config.BACKEND_DIR, "data_status.json")
    if os.path.exists(status_path):
        with open(status_path, encoding="utf-8") as f:
            status = json.load(f)
    key_of = {"Xbox": "gamepass", "PSPlus": "psplus", "Epic": "epic", "HumbleBundle": "humble"}

    arrivals = sum(len(config.read_served(p["input"])) for p in config.TRAIN_PLATFORMS)
    first = sum(len(train.organic(train._prepare(config.read_served(p["input"])))) for p in config.TRAIN_PLATFORMS)

    dated = {}
    for p in config.TRAIN_PLATFORMS:
        r = scorecard.evaluate(p["name"], p["input"])
        if r:
            dated[key_of[p["name"]]] = {"n": r["n"], "within1": round(r["within_12"], 3), "within2": round(r["within_24"], 3),
                                        "within3": round(r["within_36"], 3), "coverage": round(r["coverage"], 3)}
    start = min(pd.Timestamp(c) for c in holdout.CUTOFFS.values())

    base = {}
    for r in backtest.run():
        best = min(r["baseline_global_median"], r["baseline_publisher_median"])
        base[key_of[r["platform"]]] = {"model_months": round(r["model_mae_walkforward"] / 30.44),
                                       "baseline_months": round(best / 30.44)}

    with open(os.path.join(config.BACKEND_DIR, "arrival_hazard.json"), encoding="utf-8") as f:
        tests = json.load(f).get("odds_backtest", {})
    csv_key = {v: k for k, v in SERVICE_CSV.items()}
    yearly = {"tests": [], "services": {}}
    for csv, t in tests.items():
        rows = []
        for x in t["tests"]:
            rows.append({"cutoff": x["cutoff"], "expected": round(x["expected_new"] if t["used"] else x["expected_old"]),
                         "joined": x["joined"]})
            if x["cutoff"] not in yearly["tests"]:
                yearly["tests"].append(x["cutoff"])
        yearly["services"][csv_key[csv]] = rows

    return {"as_of": status.get("collected_on", as_of), "next_update_by": status.get("next_update_by"),
            "cadence": status.get("cadence_label", "quarterly"),
            "facts": {"arrivals": int(arrivals), "first_arrivals": int(first)},
            "dated": {"tested": int(sum(v["n"] for v in dated.values())),
                      "period": f"{start:%B %Y} to {holdout.TODAY:%B %Y}", "services": dated},
            "baseline": {"services": base},
            "yearly": yearly,
            "rankings_check": rankings_check(pd.Timestamp.now().normalize())}


def games(details):
    """Normalised game name -> [RAWG slug, resized cover or null], for the
    leaderboard function."""
    out = {}
    for slug, d in details.items():
        k = hazard._norm(d.get("name"))
        if k:
            out.setdefault(k, [slug, _resize(d.get("background_image"))])
    return out


def _write(path, data, compact=False):
    with open(path, "w", encoding="utf-8") as f:
        if compact:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(data, f, indent=1, ensure_ascii=False)


def run():
    details = _details()
    with open(os.path.join(config.BACKEND_DIR, "data_status.json"), encoding="utf-8") as f:
        as_of = json.load(f).get("collected_on")
    rank_file, odds_rank = rankings(details, as_of)
    _write(os.path.join(PUBLIC, "rankings.json"), rank_file)
    _write(os.path.join(PUBLIC, "odds_rank.json"), odds_rank)
    print(f"  archived the published lists to {archive(rank_file)}")
    _write(os.path.join(PRECOMPUTED, "games.json"), games(details), compact=True)
    stats = statistics(as_of)
    _write(os.path.join(PUBLIC, "statistics.json"), stats)
    from . import accuracy
    accuracy.run(os.path.join(PUBLIC, "accuracy.json"))
    print(f"  statistics: {stats['dated']['tested']} unseen arrivals scored, "
          f"{len(stats['rankings_check'])} archived list(s) checked")
    return {"rankings": rank_file, "statistics": stats}


if __name__ == "__main__":
    run()
