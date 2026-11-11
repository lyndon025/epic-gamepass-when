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

The same match also fills "more_publishers" (D-063) when the stored publisher
has never been a lead publisher on any service: IGDB's publishers that have
been are recorded there, so a label listed before its parent (RAWG kept only
the first name) is answered from the parent's history. The stored publisher
field itself is left alone, so training and corrections read what they did.

Needs IGDB set up (pipeline.setup_igdb); without it this does nothing.
Run before precompute: python -m pipeline.refresh_platforms
"""

import json
import os
import re
import sys

import pandas as pd

from . import config, corrections, igdb

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


def known_publishers(aliases: dict) -> set:
    """Normalised lead publishers across the four services' records."""
    known = set()
    for name in ("Epic.csv", "Xbox.csv", "PS.csv", "HB.csv"):
        path = os.path.join(config.DATA_CANONICAL, name)
        if not os.path.exists(path):
            continue
        for pub in pd.read_csv(path, usecols=["publisher"])["publisher"].dropna():
            lead = corrections.canonical_publishers(str(pub).split(",")[0].strip(), aliases)
            if lead:
                known.add(_norm(lead))
    return known


# Never added from IGDB: these names switch on the backend's Microsoft
# first-party rule ("launches on Game Pass day one"), which is right for new
# Xbox Game Studios releases and wrong for an Xbox 360 arcade game IGDB credits
# to them (Joy Ride Turbo would lose its "on Game Pass" answer).
FIRST_PARTY = re.compile(r"microsoft|xbox game studios|xbox publishing|bethesda|zenimax", re.I)


def more_publishers(stored, igdb_pubs, aliases: dict, known: set) -> list:
    """IGDB publishers with history, when the stored one has none."""
    if stored and stored != "Unknown":
        if _norm(corrections.canonical_publishers(stored, aliases)) in known:
            return []
    out = []
    for name in igdb_pubs or []:
        name = corrections.canonical_publishers(name, aliases)
        if (name and _norm(name) in known and _norm(name) != _norm(stored) and name not in out
                and not FIRST_PARTY.search(name)):
            out.append(name)
    return out


def run(limit=None) -> dict:
    # Game names are not all ASCII; a Windows console must not stop the run.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    if not igdb.enabled():
        print("IGDB is not set up; platforms left as stored.")
        return {}
    with open(PATH, encoding="utf-8") as f:
        rows = [json.loads(line) for line in f if line.strip()]
    aliases = corrections.alias_map()
    known = known_publishers(aliases)
    changed, unmatched, pub_changed = {}, 0, {}
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
        extra = more_publishers(d.get("publisher"), match.get("publishers"), aliases, known)
        if extra:
            d["more_publishers"] = extra
            pub_changed[d.get("rawg_slug") or d.get("slug")] = (d.get("name"), d.get("publisher"), extra)
        else:
            d.pop("more_publishers", None)
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
    print(f"{len(pub_changed)} games with a never-seen publisher gained one with history:")
    for name, stored, extra in sorted(pub_changed.values(), key=lambda v: v[0] or ""):
        print(f"  {name}: {stored} -> + {', '.join(extra)}")
    return changed


if __name__ == "__main__":
    changes = run()
    for slug, (name, added) in sorted(changes.items(), key=lambda kv: kv[1][0] or ""):
        print(f"  {name}: + {', '.join(added)}")
