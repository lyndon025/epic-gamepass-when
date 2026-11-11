"""Stage 5a - bring the stored platform lists up to date from IGDB (D-060).

data/canonical/rawg_details.jsonl holds each game's platforms as RAWG gave them
when it was first fetched. Games get ported afterwards (Hades II reached PS5
after it was stored), and a stale list rules a game out of a service it is now
on: the precomputed answers, Rankings and the catalogue all read this file.

For every stored game, IGDB is searched by name; a result counts as the same
game only with the same name (normalised) and a release year within one of
ours. Its platforms are added to ours, written in RAWG's names so the backend's
checks read them as before. Platforms are only ever added, never removed: a
missing entry on IGDB is not evidence a game left a platform.

Needs IGDB set up (pipeline.setup_igdb); without it this does nothing.
Run before precompute: python -m pipeline.refresh_platforms
"""

import json
import os
import re

from . import config, igdb

PATH = os.path.join(config.DATA_CANONICAL, "rawg_details.jsonl")

# IGDB's names for the platforms the services care about, in RAWG's spelling.
AS_RAWG = {
    "PC (Microsoft Windows)": "PC",
    "Xbox Series X|S": "Xbox Series S/X",
    "PlayStation 5": "PlayStation 5",
    "PlayStation 4": "PlayStation 4",
    "PlayStation 3": "PlayStation 3",
    "Xbox One": "Xbox One",
    "Xbox 360": "Xbox 360",
    "Nintendo Switch": "Nintendo Switch",
    "Nintendo Switch 2": "Nintendo Switch 2",
    "Mac": "macOS",
    "Linux": "Linux",
}


def _norm(name):
    return re.sub(r"[^a-z0-9]", "", str(name or "").lower())


def _year(date):
    m = re.match(r"(\d{4})", str(date or ""))
    return int(m.group(1)) if m else None


def run(limit=None) -> dict:
    if not igdb.enabled():
        print("IGDB is not set up; platforms left as stored.")
        return {}
    with open(PATH, encoding="utf-8") as f:
        rows = [json.loads(line) for line in f if line.strip()]
    changed, unmatched = {}, 0
    for i, d in enumerate(rows[:limit] if limit else rows, 1):
        want, year = _norm(d.get("name")), _year(d.get("released"))
        match = None
        for g in igdb.search(d.get("name") or "", limit=10):
            gy = _year(g.get("release_date"))
            if _norm(g["name"]) == want and (year is None or gy is None or abs(gy - year) <= 1):
                match = g
                break
        if not match:
            unmatched += 1
            continue
        have = list(d.get("platforms") or [])
        lower = {p.lower() for p in have}
        added = [AS_RAWG[p] for p in match["platforms"] if p in AS_RAWG and AS_RAWG[p].lower() not in lower]
        if added:
            d["platforms"] = have + added
            changed[d.get("rawg_slug") or d.get("slug")] = (d.get("name"), added)
        if i % 500 == 0:
            print(f"  {i}/{len(rows)} checked, {len(changed)} gained platforms")
    with open(PATH, "w", encoding="utf-8") as f:
        for d in rows:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")
    print(f"Checked {len(rows)} games: {len(changed)} gained platforms, {unmatched} not matched on IGDB (left as stored).")
    return changed


if __name__ == "__main__":
    changes = run()
    for slug, (name, added) in sorted(changes.items(), key=lambda kv: kv[1][0] or ""):
        print(f"  {name}: + {', '.join(added)}")
