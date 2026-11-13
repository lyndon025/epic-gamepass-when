"""Stage 5b - Metacritic scores from Steam for stored games that have none (D-067).

RAWG gave no Metacritic score for about half the stored games, and IGDB has
none at all, so those games were answered with the model's typical value (75)
and their cards read "Not rated". Steam's store search carries the Metacritic
score for many PC games, and appdetails gives the release date to check it.

A score is taken only when Steam has a game of exactly the same name (letters
and digits) with a score, released within MAX_YEARS of ours. The year check
keeps a remake's score off the original of the same name: Steam's "Resident
Evil 4" is the 2023 remake, not the 2005 game. Steam's date is the PC release,
which can trail a console launch by a year or two, hence the allowance.

Scores already stored are never replaced; the source is recorded as
"metacritic_source": "steam". Run before precompute:
    python -m pipeline.steam_scores
"""

import json
import os
import re
import sys
import time

from . import config, steam

PATH = os.path.join(config.DATA_CANONICAL, "rawg_details.jsonl")
MAX_YEARS = 2
PAUSE = 1.0  # seconds between Steam requests; its store API limits bursts


def _norm(name):
    return re.sub(r"[^a-z0-9]", "", str(name or "").lower())


def _year(date):
    m = re.match(r"(\d{4})", str(date or ""))
    return int(m.group(1)) if m else None


def score_for(name, released) -> tuple[int, str] | None:
    """(score, Steam app id) for this game, or None."""
    j = steam._get(steam.SEARCH, {"term": str(name), "cc": "us", "l": "en"})
    time.sleep(PAUSE)
    hit = next((i for i in (j or {}).get("items", [])
                if i.get("type") == "app" and _norm(i.get("name")) == _norm(name)
                and str(i.get("metascore") or "").isdigit()), None)
    if not hit:
        return None
    want = _year(released)
    if want is not None:
        d = steam.details(hit["id"])
        time.sleep(PAUSE)
        got = _year((d or {}).get("release_date"))
        if got is None or abs(got - want) > MAX_YEARS:
            return None
    score = int(hit["metascore"])
    return (score, str(hit["id"])) if 0 < score <= 100 else None


def run(limit=None) -> dict:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    with open(PATH, encoding="utf-8") as f:
        rows = [json.loads(line) for line in f if line.strip()]
    todo = [d for d in rows if not d.get("metacritic")]
    if limit:
        todo = todo[:limit]
    print(f"{len(todo)} stored games have no Metacritic score; asking Steam")
    found = {}
    for i, d in enumerate(todo, 1):
        got = score_for(d.get("name"), d.get("released"))
        if got:
            d["metacritic"], d["metacritic_source"], d["steam_appid"] = got[0], "steam", got[1]
            found[d.get("rawg_slug") or d.get("slug")] = (d.get("name"), got[0])
        if i % 250 == 0:
            print(f"  {i}/{len(todo)} checked, {len(found)} scores found", flush=True)
            _write(rows)  # keep progress if the run is stopped
    _write(rows)
    print(f"Scores found for {len(found)} of {len(todo)} games.")
    return found


def _write(rows):
    tmp = PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        for d in rows:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")
    os.replace(tmp, PATH)


if __name__ == "__main__":
    for slug, (name, score) in sorted(run().items(), key=lambda kv: kv[1][0] or ""):
        print(f"  {name}: {score}")
