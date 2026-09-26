"""Complete the Epic giveaway history, repeats included.

WHY
---
data/canonical/Epic.csv holds one row per giveaway, but when the data was
consolidated in June 2026 only one row per game survived: every game Epic gave
away twice or three times kept its latest date only. The older export in
legacy/Epic.csv still had 71 repeated titles; the canonical file had none, and
the quarterly text updates have only added repeats from 2025 on. The repeat
logic and the return-rate line ("only 9 of 629 games have ever been given away
again") were therefore built on a history that could not show repeats. Control,
given away in June 2021, December 2021 and December 2024, was recorded once.

SOURCE
------
The open-source Epic Free Games Scraper (github.com/evenwebb/epic-free-games-scraper,
GPL-3.0) keeps a SQLite record of every Epic promotion since December 2018,
scraped from Epic's own promotions feed. Only the promotion facts are used here:
game name and start date.

HOW THE MERGE WORKS
-------------------
Names differ between sources ("Disco Elysium" / "Disco Elysium - The Final
Cut", edition suffixes, bundles), but a giveaway week has one to three games,
so the date is the reliable key. Each promotion in the record is matched to a
canonical row given away within MATCH_DAYS of it whose title agrees
(pipeline.popularity.similarity, which understands editions and subtitles).
Promotions with no match are giveaways our file is missing; each becomes a new
row that copies the name and metadata of the same game's existing row, so a
repeat is recognised as the same game. A missing game with no existing row is
added with its name only and filled by pipeline.enrich like any new game.
Canonical rows the record does not have are kept.

Idempotent: run it again and it adds nothing.
"""

import os
import re
import sqlite3
import tempfile

import pandas as pd
import requests

from . import config
from .popularity import similarity

EPIC_CSV = os.path.join(config.DATA_CANONICAL, "Epic.csv")
DB_URL = "https://raw.githubusercontent.com/evenwebb/epic-free-games-scraper/main/output/epic_games.db"
MATCH_DAYS = 8          # a giveaway week, plus a day of time-zone slack
SAME_GAME = 0.80        # title agreement needed to call two rows the same game


def _norm(s):
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


def _sim(a, b):
    """Title agreement; identical letters and digits always agree (a title such
    as "[REDACTED]" is all brackets to the subtitle-aware comparison)."""
    if _norm(a) and _norm(a) == _norm(b):
        return 1.0
    return similarity(a, b)


def collapse_same_week(df: pd.DataFrame):
    """One row per giveaway: the same game twice within MATCH_DAYS is one event
    recorded twice (a curly apostrophe, another date format, a two-week
    promotion). Keeps the row with the fuller details. Returns (df, removed)."""
    df = df.copy()
    df["_k"] = df["game_name"].map(_norm)
    df["_d"] = pd.to_datetime(df["Added to Service"], errors="coerce", format="mixed")
    df["_filled"] = df[["publisher", "release_date", "developer"]].notna().sum(axis=1)
    keep, removed = [], 0
    for _k, grp in df.sort_values("_d").groupby("_k", sort=False):
        last = None
        for i, row in grp.iterrows():
            if last is not None and pd.notna(row["_d"]) and pd.notna(df.at[last, "_d"]) \
                    and (row["_d"] - df.at[last, "_d"]).days <= MATCH_DAYS:
                removed += 1
                if row["_filled"] > df.at[last, "_filled"]:
                    keep[-1] = i
                    last = i
                continue
            keep.append(i)
            last = i
    out = df.loc[keep].drop(columns=["_k", "_d", "_filled"])
    return out, removed


# In-game item offers the record lists as promotions. They are not games Epic
# gave away, so they are not added (rows already in the canonical file stay).
ITEM_OFFER = re.compile(
    r"\b(?:bundle|pack|set|starter kit)$"
    r"|\b(?:outfits?|skins?|currency)\b",
    re.IGNORECASE,
)
# Free-to-play games whose Epic promotions were in-game items, not the game.
FREE_TO_PLAY = ("genshin impact", "firestone online")


def _clean_name(name: str) -> str:
    """A few record entries carry the store address instead of the title."""
    name = str(name).strip()
    if name.lower().startswith("http"):
        slug = name.rstrip("/").rsplit("/", 1)[-1]
        slug = re.sub(r"-[0-9a-f]{6}$", "", slug)
        name = slug.replace("-", " ").title()
    return name


def _is_item_offer(name: str) -> bool:
    low = name.lower()
    if any(low.startswith(f) for f in FREE_TO_PLAY):
        return True
    return bool(ITEM_OFFER.search(name)) and "complete" not in low and "collection" not in low


def _part_of_collection(name: str, same_week: pd.DataFrame) -> bool:
    """A game given away inside a collection that the canonical file records as
    one row ("BioShock: The Collection" covering BioShock 2 and Infinite)."""
    first = re.sub(r"[^a-z0-9 ]", " ", name.lower()).split()
    if not first or len(first[0]) < 4:
        return False
    for other in same_week["game_name"]:
        o = re.sub(r"[^a-z0-9 ]", " ", str(other).lower()).split()
        if o and o[0] == first[0] and ("collection" in o or "trilogy" in o or "bundle" in o):
            return True
    return False


def load_record(path=None) -> pd.DataFrame:
    """Every PC promotion that has started: name and start date."""
    if path is None:
        path = os.path.join(tempfile.gettempdir(), "epic_games_record.db")
        r = requests.get(DB_URL, timeout=60)
        r.raise_for_status()
        with open(path, "wb") as f:
            f.write(r.content)
    con = sqlite3.connect(path)
    try:
        rec = pd.read_sql(
            "select g.name, p.start_date, p.status, p.platform from promotions p "
            "join games g on g.id = p.game_id", con)
    finally:
        con.close()
    rec = rec[(rec["platform"] == "PC") & (rec["status"] != "upcoming")].copy()
    rec["start"] = pd.to_datetime(rec["start_date"], utc=True, errors="coerce", format="mixed").dt.tz_localize(None)
    rec["name"] = rec["name"].map(_clean_name)
    return rec.dropna(subset=["start"])[["name", "start"]].reset_index(drop=True)


def merge(canon: pd.DataFrame, record: pd.DataFrame):
    """Canonical rows plus the giveaways they are missing. Returns (merged, added)."""
    canon = canon.copy()
    canon["_added"] = pd.to_datetime(canon["Added to Service"], errors="coerce", format="mixed")
    used = set()
    missing = []
    for ev in record.sort_values("start").itertuples():
        near = canon[(canon["_added"] - ev.start).abs() <= pd.Timedelta(days=MATCH_DAYS)]
        best, best_sim = None, 0.0
        for i, row in near.iterrows():
            if i in used:
                continue
            sim = _sim(ev.name, row["game_name"])
            if sim > best_sim:
                best, best_sim = i, sim
        if best is not None and best_sim >= 0.5:
            used.add(best)
        elif any(_sim(ev.name, n) >= SAME_GAME for n in near["game_name"]):
            # The record lists some games twice in one week under slightly
            # different names; the week's row already covers it.
            continue
        elif not _is_item_offer(ev.name) and not _part_of_collection(ev.name, near):
            missing.append(ev)

    # How many times the record gives each canonical title, so a copied repeat
    # can never push a game past that (which would mean a mismatched date, not
    # a missing giveaway).
    rec_names = record["name"].tolist()

    def record_count(title):
        return sum(1 for n in rec_names if _sim(n, title) >= SAME_GAME)

    have = canon["game_name"].map(_norm).value_counts().to_dict()
    rows = []
    for ev in missing:
        # The same game's existing row: copy its name and metadata so the repeat
        # is counted against the right title.
        scores = canon["game_name"].map(lambda n: _sim(ev.name, n))
        j = scores.idxmax() if len(scores) else None
        if j is not None and scores[j] >= SAME_GAME:
            title = canon.at[j, "game_name"]
            if have.get(_norm(title), 0) >= record_count(title):
                continue
            have[_norm(title)] = have.get(_norm(title), 0) + 1
            row = canon.loc[j].drop(labels=["_added"]).to_dict()
        else:
            row = {c: None for c in canon.columns if c != "_added"}
            row["game_name"] = ev.name
            row["System"] = "PC"
        row["Added to Service"] = ev.start.strftime("%m/%d/%Y")
        row["Removed from Service"] = None
        rows.append(row)

    added = pd.DataFrame(rows, columns=[c for c in canon.columns if c != "_added"])
    parts = [canon.drop(columns=["_added"])] + ([added] if len(added) else [])
    merged = pd.concat(parts, ignore_index=True)
    merged, collapsed = collapse_same_week(merged)
    # One date format, so later dedupes compare like with like.
    merged["_d"] = pd.to_datetime(merged["Added to Service"], errors="coerce", format="mixed")
    merged["Added to Service"] = merged["_d"].dt.strftime("%m/%d/%Y").where(merged["_d"].notna(), merged["Added to Service"])
    merged = merged.sort_values("_d", ascending=False).drop(columns=["_d"]).reset_index(drop=True)
    merged.attrs["collapsed"] = collapsed
    return merged, added


def run(write=True, record_path=None):
    canon = pd.read_csv(EPIC_CSV)
    record = load_record(record_path)
    merged, added = merge(canon, record)

    k = merged["game_name"].map(_norm)
    repeated = k[k.duplicated(keep=False)].nunique()
    print(f"Record: {len(record)} promotions. Canonical: {len(canon)} rows.")
    print(f"Adding {len(added)} missing giveaways "
          f"({int(added['publisher'].isna().sum())} are new games for enrich to fill).")
    print(f"Collapsed {merged.attrs.get('collapsed', 0)} giveaways recorded twice in one week.")
    print(f"Result: {len(merged)} rows, {repeated} games given away more than once.")
    if write and (len(added) or merged.attrs.get("collapsed", 0) or len(merged) != len(canon)):
        merged.to_csv(EPIC_CSV, index=False)
        print(f"Wrote {EPIC_CSV}")
    return merged, added


if __name__ == "__main__":
    run()
