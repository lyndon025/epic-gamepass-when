"""Stage 6 - precompute answers so the backend stops being load-bearing.

WHY
---
Every prediction used to cost a call into the Flask service, which sleeps when
idle on free hosting, so the first visitor after a quiet spell waited up to a
minute. With the answers precomputed, a known game resolves instantly inside
the site's own /api/predict function, and only games outside the catalogue (or
games whose RAWG details have changed) reach the backend.

SAME ANSWER, NOT A SECOND IMPLEMENTATION
---------------------------------------
Each answer is produced by calling the backend's own /api/predict route through
Flask's test client, with the request body the site itself would send for that
game. So a stored answer is byte-for-byte what a live request returns: same
cascade, same rules, same serialisation. The inputs are kept with the answer,
and the proxy serves it only when a request carries exactly those inputs; any
difference (RAWG corrected a publisher, a date moved) falls through to the live
backend.

WHICH GAMES
-----------
Every game in data/canonical/rawg_details.jsonl, which pipeline.rawg_details
fetches from the same RAWG endpoint the site uses. Games RAWG does not know, or
that were typed in by hand, are always answered live.

FRESHNESS
---------
Two stamps travel in meta.json:

  backend_hash   fingerprint of everything that shapes an answer: the model
                 bundles, the served datasets, the arrival-odds table, the data
                 status and the backend's Python. pipeline.preflight fails if it
                 no longer matches the backend, so a retrain or a code change
                 cannot ship with answers from the previous one.
  computed_at    the proxy stops serving the files after SERVE_DAYS, since a few
                 fields (where "today" sits in a window, a game's age) move with
                 the calendar. The quarterly refresh regenerates them well inside
                 that.

LAYOUT
------
apps/frontend/api/_precomputed/meta.json
apps/frontend/api/_precomputed/<service>/<shard>.json   (16 shards per service)

A shard is the first hex digit of sha1(slug), so the proxy reads one small file
per request instead of the whole set. The underscore keeps Vercel from treating
the folder as a route; vercel.json bundles it into the predict function.
"""

import contextlib
import hashlib
import io
import json
import os
import shutil
import sys
from datetime import datetime, timezone

from . import config

BACKEND = config.BACKEND_DIR
DETAILS = os.path.join(config.DATA_CANONICAL, "rawg_details.jsonl")
OUT_DIR = os.path.join(config.REPO_ROOT, "apps", "frontend", "api", "_precomputed")
SHARDS = 16
SERVE_DAYS = 120


def backend_hash() -> str:
    """Fingerprint of every backend file that shapes an answer.

    The backend's own function (apps/backend/backend_version.py), recomputed
    from disk, so a stored answer, the pre-flight check and a live answer all
    carry the same value for the same build.
    """
    if BACKEND not in sys.path:
        sys.path.insert(0, BACKEND)
    import backend_version
    return backend_version.compute(BACKEND)


def shard_of(slug: str) -> str:
    return hashlib.sha1(slug.encode("utf-8")).hexdigest()[0]


def _norm_platforms(names) -> list:
    return sorted({str(n).strip().lower() for n in (names or []) if str(n).strip()})


def _client():
    if BACKEND not in sys.path:
        sys.path.insert(0, BACKEND)
    import app as backend_app  # the real Flask app, with its real predictors
    return backend_app.app.test_client()


def _games():
    rows = []
    with open(DETAILS, encoding="utf-8") as f:
        for line in f:
            try:
                d = json.loads(line)
            except ValueError:
                continue
            if d.get("name") and d.get("rawg_slug"):
                rows.append(d)
    seen, out = set(), []
    for d in rows:
        if d["rawg_slug"] not in seen:
            seen.add(d["rawg_slug"])
            out.append(d)
    return out


def run(limit=None):
    with contextlib.redirect_stdout(io.StringIO()):
        client = _client()
        from platform_config import PLATFORMS
    services = [p["key"] for p in PLATFORMS]

    games = _games()
    if limit:
        games = games[:limit]
    print(f"Precomputing {len(games)} games x {len(services)} services")

    shards = {s: {k: {} for k in "0123456789abcdef"} for s in services}
    counts, failures = {}, 0
    for i, g in enumerate(games, 1):
        # The body the site sends: Home.jsx runPrediction.
        body = {
            "game_name": g["name"],
            "publisher": g.get("publisher") or "Unknown",
            "metacritic_score": g.get("metacritic") or None,
            "platforms": [{"platform": {"name": n}} for n in g.get("platforms") or []] or None,
            "release_date": g.get("released"),
        }
        inputs = {
            "name": body["game_name"],
            "publisher": body["publisher"],
            "metacritic": body["metacritic_score"],
            "released": body["release_date"],
            "platforms": _norm_platforms(g.get("platforms")),
        }
        for svc in services:
            with contextlib.redirect_stdout(io.StringIO()):
                r = client.post("/api/predict", json={**body, "platform": svc})
            if r.status_code != 200:
                failures += 1
                continue
            answer = r.get_json()
            if not answer or answer.get("error"):
                failures += 1
                continue
            shards[svc][shard_of(g["rawg_slug"])][g["rawg_slug"]] = {"in": inputs, "a": answer}
            counts[answer.get("grain", "?")] = counts.get(answer.get("grain", "?"), 0) + 1
        if i % 500 == 0:
            print(f"  {i}/{len(games)}")

    if os.path.isdir(OUT_DIR):
        shutil.rmtree(OUT_DIR)
    total = 0
    for svc, by_shard in shards.items():
        os.makedirs(os.path.join(OUT_DIR, svc), exist_ok=True)
        for k, entries in by_shard.items():
            with open(os.path.join(OUT_DIR, svc, f"{k}.json"), "w", encoding="utf-8") as f:
                json.dump(entries, f, separators=(",", ":"), ensure_ascii=False)
            total += len(entries)
    meta = {
        "computed_at": datetime.now(timezone.utc).strftime("%Y-%m-%d"),  # UTC, as the proxy reads it
        "serve_days": SERVE_DAYS,
        "backend_hash": backend_hash(),
        "games": len(games),
        "answers": total,
        "shards": SHARDS,
    }
    with open(os.path.join(OUT_DIR, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1)

    size = sum(os.path.getsize(os.path.join(dp, n)) for dp, _d, ns in os.walk(OUT_DIR) for n in ns)
    print(f"Wrote {total} answers ({failures} failed) to {OUT_DIR}")
    print(f"Size: {size / 1024 / 1024:.1f} MB. Answer types: {dict(sorted(counts.items()))}")
    return meta


if __name__ == "__main__":
    run()
