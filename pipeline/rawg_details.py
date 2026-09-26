"""RAWG game details for every catalogue game, exactly as the site loads them.

Precomputed answers are only safe to serve if they were produced from the same
inputs a live request carries. The site builds its request from RAWG's game
details endpoint (name, first publisher, release date, Metacritic, platforms),
so this stage fetches that same endpoint for every game we can place on RAWG and
keeps just those fields. pipeline.precompute then predicts from them, and the
Vercel proxy serves a stored answer only when a request's inputs match these
exactly.

Which games:
  - every catalogue game, located through the graded matches in
    data/canonical/rawg_popularity.csv (high and medium confidence only, so a
    wrong match is never used);
  - games people are most likely to search that are on no service yet, which
    the catalogue cannot contain: RAWG's most-followed releases from the last
    few years and the next two (POPULAR_PAGES pages), and the site's own top
    searches from its public leaderboard. Those are the searches that most
    often landed on a cold backend.

Writes data/canonical/rawg_details.jsonl, one game per line. Resumable: slugs
already fetched are skipped, so a quarterly rerun only fetches new games.
"""

import json
import os
import time
from datetime import datetime

import pandas as pd
import requests

from . import config
from .enrich import _KeyRotator

POPULARITY = os.path.join(config.DATA_CANONICAL, "rawg_popularity.csv")
OUT = os.path.join(config.DATA_CANONICAL, "rawg_details.jsonl")
MAX_CONSECUTIVE_FAILURES = 20
POPULAR_PAGES = 5          # 40 games a page
POPULAR_YEARS_BACK = 4
POPULAR_YEARS_AHEAD = 2
LEADERBOARD_URL = "https://epic-gamepass-when.vercel.app/api/leaderboard"
LEADERBOARD_PLATFORMS = ("global", "epic", "gamepass", "psplus", "humble")


def _slugs():
    pop = pd.read_csv(POPULARITY)
    pop = pop[pop["confidence"].isin(["high", "medium"])]
    return sorted(set(pop["rawg_slug"].dropna().astype(str)) - {""})


def _get(url, rotator):
    """A RAWG list call with key rotation; None on failure."""
    for _ in range(max(1, len(rotator.keys))):
        key = rotator.current()
        try:
            r = requests.get(f"{url}&key={key}", timeout=20)
        except requests.RequestException:
            time.sleep(2)
            continue
        if r.status_code in (401, 403, 429):
            rotator.cycle()
            time.sleep(1)
            continue
        return r.json() if r.status_code == 200 else None
    return None


def _popular_slugs(rotator):
    """RAWG's most-followed games released recently or coming soon."""
    year = datetime.now().year
    dates = f"{year - POPULAR_YEARS_BACK}-01-01,{year + POPULAR_YEARS_AHEAD}-12-31"
    slugs = []
    for page in range(1, POPULAR_PAGES + 1):
        j = _get(f"https://api.rawg.io/api/games?dates={dates}&ordering=-added&page_size=40&page={page}", rotator)
        if not j:
            break
        slugs += [g["slug"] for g in j.get("results") or [] if g.get("slug")]
        time.sleep(0.25)
    return slugs


def _searched_slugs(rotator):
    """The site's top searches, matched back to RAWG by exact name.

    The leaderboard stores the name the site received from RAWG, so an exact
    (case-insensitive) name match among the top results is the same game.
    """
    names = set()
    for p in LEADERBOARD_PLATFORMS:
        try:
            j = requests.get(f"{LEADERBOARD_URL}?platform={p}", timeout=30).json()
            names |= {x["game"] for x in j.get("leaderboard") or [] if x.get("game")}
        except (requests.RequestException, ValueError):
            continue
    slugs = []
    for name in sorted(names):
        j = _get(f"https://api.rawg.io/api/games?search={requests.utils.quote(name)}&page_size=5", rotator)
        for g in (j or {}).get("results") or []:
            if (g.get("name") or "").strip().lower() == name.strip().lower() and g.get("slug"):
                slugs.append(g["slug"])
                break
        time.sleep(0.25)
    return slugs


def _fetch(slug, rotator):
    for _ in range(max(1, len(rotator.keys))):
        key = rotator.current()
        try:
            r = requests.get(f"https://api.rawg.io/api/games/{slug}?key={key}", timeout=20)
        except requests.RequestException:
            time.sleep(2)
            continue
        if r.status_code in (401, 403, 429):
            rotator.cycle()
            time.sleep(1)
            continue
        if r.status_code == 404:
            return {}
        if r.status_code != 200:
            return None
        return r.json()
    return None


def _row(slug, d):
    """The fields the site's request is built from, in the site's own shape."""
    pubs = d.get("publishers") or []
    return {
        "slug": slug,
        "rawg_slug": d.get("slug") or slug,
        "name": d.get("name") or "",
        "publisher": pubs[0]["name"] if pubs else "Unknown",
        "released": d.get("released"),
        "metacritic": d.get("metacritic"),
        "platforms": [
            (p.get("platform") or {}).get("name", "")
            for p in (d.get("platforms") or [])
            if isinstance(p, dict)
        ],
        "background_image": d.get("background_image"),
    }


def run(limit=None):
    done = set()
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            for line in f:
                try:
                    done.add(json.loads(line)["slug"])
                except (ValueError, KeyError):
                    pass
    rotator = _KeyRotator(config.rawg_keys())
    extra = _popular_slugs(rotator) + _searched_slugs(rotator)
    wanted = list(dict.fromkeys(_slugs() + extra))
    todo = [s for s in wanted if s not in done]
    if limit:
        todo = todo[:limit]
    print(f"{len(done)} already fetched, {len(todo)} to fetch "
          f"({len(set(extra))} popular or searched games considered)")

    failures = fetched = 0
    with open(OUT, "a", encoding="utf-8") as f:
        for i, slug in enumerate(todo, 1):
            d = _fetch(slug, rotator)
            if d is None:
                failures += 1
                if failures >= MAX_CONSECUTIVE_FAILURES:
                    print(f"Stopping: {failures} failed requests in a row. Rerun later to resume.")
                    break
                time.sleep(5)
                continue
            failures = 0
            if d:
                f.write(json.dumps(_row(slug, d), ensure_ascii=False) + "\n")
                fetched += 1
            if i % 250 == 0:
                f.flush()
                print(f"  {i}/{len(todo)}")
            time.sleep(0.25)
    print(f"Fetched {fetched}. Wrote {OUT}")


if __name__ == "__main__":
    run()
