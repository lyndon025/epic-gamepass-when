"""RAWG follower counts for every known game, for a within-year "hype" signal.

WHY WITHIN-YEAR
---------------
RAWG's `added` count (users who put the game in their library or wishlist) is
dominated by WHEN a game came out, not how big it is: its community was far
larger years ago. GTA V has 22,730; Ghost of Yotei, a 2025 AAA release, has 391 -
about the same as the indie Shogun Showdown (371). Used raw, the count mostly
repeats the release year.

Ranked within a release year, it separates big from small: a game's percentile
among the games released the same year. That comparison is only meaningful
against a reference population, which is every game in the canonical data.

MATCHING
--------
A popularity number is only as good as the match behind it, and RAWG's top
search hit is often the wrong game ("Firestone Free Offer" returned "fault -
milestone one"). So each title is cleaned first (edition suffixes, platform
tags, roman numerals), the top five results are scored on name AND release year,
and every row records how confident the match is:

  high        names match (>= 0.95 similarity) and release years within a year
              or unknown; or names agree (>= 0.90, which includes one title
              being the other plus a subtitle) and the years are known to agree
  medium      names match and years within three (remasters, regional dates), or
              names close (>= 0.85) and years known to agree
  low         anything else - kept for audit, never used
  not_a_game  an in-game item giveaway (skins, unlock bundles, currency). Not
              looked up at all

Only high and medium rows are meant to feed anything downstream.

Writes data/canonical/rawg_popularity.csv. Resumable: games already matched with
high or medium confidence are skipped, so an interrupted run picks up where it
stopped and a rerun only retries the doubtful ones; rows on disk are regraded
under the current rules on every run. One search request per game, plus one
retry on the part before the colon when a subtitled title matches poorly or
nothing comes back; the list endpoint already carries `added` and
`ratings_count`.
"""

import os
import re
import time
from difflib import SequenceMatcher

import pandas as pd
import requests

from . import config
from .enrich import _KeyRotator, normalize_name

OUT = os.path.join(config.DATA_CANONICAL, "rawg_popularity.csv")
COLUMNS = ["key", "query", "cleaned", "rawg_name", "rawg_slug", "match", "our_year",
           "rawg_year", "confidence", "released", "added", "ratings_count", "rating",
           "metacritic"]
USABLE = ("high", "medium")
CANDIDATES = 5
MAX_CONSECUTIVE_FAILURES = 20

EDITION = re.compile(
    r"[\s:\-\u2013\u2014]*(?:the\s+)?"
    r"(?:(?:premium|definitive|complete|deluxe|digital deluxe|ultimate|gold|"
    r"game of the year|goty|standard|enhanced|special|anniversary|legendary|"
    r"sovereign|remastered|collector'?s|platinum|celebration|challenger)\s+edition|"
    r"director'?s cut)\b.*$",
    re.IGNORECASE,
)
PLATFORM_TAG = re.compile(
    r"\s*[\(\[](?:game preview|pc|windows|xbox[^)\]]*|ps[45][^)\]]*|"
    r"playstation[^)\]]*|cloud|console|early access)[\)\]]",
    re.IGNORECASE,
)
# Epic and Game Pass also list in-game item drops. They have no popularity of
# their own and any search hit is either the base game or noise.
NOT_A_GAME = re.compile(
    r"\bfree\b.*\b(?:bonus|bundle|gift|offer|unlock|pack|loot|drop)s?\b"
    r"|\b(?:outfits?|skins?|cosmetics?|starter|currency|weapon|emote)\s+(?:pack|bundle|set)s?\b"
    r"|\b(?:anniversary|content|starter|welcome|launch|founder'?s|epic|slayer|season \w+)"
    r"\s+(?:pack|bundle|kit)\b"
    r"|\bunlock bundle\b|\blegendary status\b|\bin-game\b|\bwelcome gift\b",
    re.IGNORECASE,
)
ROMAN = {"ii": "2", "iii": "3", "iv": "4", "v": "5", "vi": "6", "vii": "7",
         "viii": "8", "ix": "9", "x": "10"}


def clean_title(name: str) -> str:
    """The title as a search query: no edition suffix or platform tag."""
    s = PLATFORM_TAG.sub("", str(name))
    s = EDITION.sub("", s)
    return re.sub(r"[\u2122\u00ae\u00a9]", "", s).strip(" :-") or str(name)


def _comparable(name: str) -> str:
    """Folded form for similarity: lowercase, no punctuation, digits for numerals."""
    s = re.sub(r"\s*[\(\[][^)\]]*[\)\]]", " ", clean_title(name))  # "(2000)", "(Kisima Ingitchuna)"
    s = s.lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    tokens = [ROMAN.get(t, t) for t in s.split()]
    if tokens and tokens[0] == "the":
        tokens = tokens[1:]
    return " ".join(tokens)


def similarity(a: str, b: str) -> float:
    ca, cb = _comparable(a), _comparable(b)
    if not ca or not cb:
        return 0.0
    if ca == cb:
        return 1.0
    # A sequel is a different game: "Golf With Your Friends" is not "Golf With
    # Your Friends 2", however similar the strings.
    na, nb = re.findall(r"\b\d+\b", ca), re.findall(r"\b\d+\b", cb)
    if na != nb and (not na or not nb or na[-1] != nb[-1]):
        return min(SequenceMatcher(None, ca, cb).ratio(), 0.5)
    ratio = SequenceMatcher(None, ca, cb).ratio()
    # One title is the other plus a subtitle ("Earthlock" / "Earthlock:
    # Festival of Magic"). Scored as agreeing, not matching, so grade() only
    # accepts it when the release years back it up - "Fallout" is also a
    # prefix of "Fallout Classic Collection".
    short, long_ = sorted((ca, cb), key=len)
    if len(short) >= 4 and long_.startswith(short + " "):
        return max(ratio, 0.90)
    return ratio


def grade(sim: float, our_year, rawg_year) -> str:
    known = pd.notna(our_year) and pd.notna(rawg_year)
    gap = abs(int(our_year) - int(rawg_year)) if known else None
    agree = gap is not None and gap <= 1
    if (sim >= 0.95 and (gap is None or gap <= 1)) or (sim >= 0.90 and agree):
        return "high"
    if (sim >= 0.95 and gap is not None and gap <= 3) or (sim >= 0.85 and agree):
        return "medium"
    return "low"


def _year(released):
    y = pd.to_datetime(released, errors="coerce")
    return int(y.year) if pd.notna(y) else None


def _pick(query: str, our_year, results: list) -> tuple:
    """Best candidate by name similarity, penalised by release-year distance."""
    best, best_score, best_sim = None, -9.0, 0.0
    for r in results:
        # itch.io mirrors reuse common titles ("Jump!", "Lonestar") and carry no
        # following, so a hit there is a namesake, not the game.
        if "(itch)" in (r.get("name") or "").lower():
            continue
        sim = similarity(query, r.get("name") or "")
        ry = _year(r.get("released"))
        score = sim
        if our_year is not None and ry is not None:
            score -= 0.1 * min(abs(our_year - ry), 5)
        if score > best_score:
            best, best_score, best_sim = r, score, sim
    return best, best_sim


def _catalogue():
    """(key, name, release year) for every distinct game across the four services."""
    seen, out = set(), []
    for csv in config.CANONICAL.values():
        df = pd.read_csv(os.path.join(config.DATA_CANONICAL, csv))
        for name, rel in zip(df["game_name"], df["release_date"]):
            if not isinstance(name, str):
                continue
            k = normalize_name(name)
            if k and k not in seen:
                seen.add(k)
                out.append((k, name, _year(rel)))
    return out


def _search(query, rotator, precise=True):
    q = requests.utils.quote(query)
    for _ in range(max(1, len(rotator.keys))):
        key = rotator.current()
        try:
            r = requests.get(
                f"https://api.rawg.io/api/games?key={key}&search={q}"
                f"{'&search_precise=true' if precise else ''}&page_size={CANDIDATES}",
                timeout=15,
            )
        except requests.RequestException:
            time.sleep(2)
            continue
        if r.status_code in (401, 403, 429):
            rotator.cycle()
            time.sleep(1)
            continue
        if r.status_code != 200:
            return None
        return r.json().get("results") or []
    return None


def _load_existing(years: dict) -> pd.DataFrame:
    """Rows already on disk, regraded under the current rules.

    Rows from the earlier top-hit-only lookup carry no grade. They are regraded
    from what they stored; the ones that no longer pass are dropped so the run
    looks them up again with the full candidate comparison.
    """
    if not os.path.exists(OUT):
        return pd.DataFrame(columns=COLUMNS)
    df = pd.read_csv(OUT).reindex(columns=COLUMNS)
    looked_up = df["confidence"] != "not_a_game"
    df.loc[looked_up, "cleaned"] = df.loc[looked_up, "query"].map(clean_title)
    df["our_year"] = df["key"].astype(str).map(years)
    df["rawg_year"] = df["released"].map(_year)
    df.loc[looked_up, "match"] = [
        round(similarity(q, n if isinstance(n, str) else ""), 3)
        for q, n in zip(df.loc[looked_up, "query"], df.loc[looked_up, "rawg_name"])
    ]
    df.loc[looked_up, "confidence"] = [
        grade(m, a, b) for m, a, b in zip(df.loc[looked_up, "match"],
                                          df.loc[looked_up, "our_year"],
                                          df.loc[looked_up, "rawg_year"])
    ]
    # An inexact name landing on an entry nobody follows is almost always a stub
    # namesake ("Operator" -> "Operator please.", 0 followers).
    df.loc[(df["match"] < 1.0) & (df["added"] == 0), "confidence"] = "low"
    df.loc[df["query"].astype(str).str.contains(NOT_A_GAME), "confidence"] = "not_a_game"
    df.loc[df["rawg_name"].astype(str).str.lower().str.contains("(itch)", regex=False),
           "confidence"] = "low"
    return df


def run(limit=None):
    games = _catalogue()
    years = {k: y for k, _n, y in games}
    existing = _load_existing(years)
    keep = existing[existing["confidence"].isin(USABLE + ("not_a_game",))]
    done = set(keep["key"].astype(str))
    todo = [g for g in games if g[0] not in done]
    if limit:
        todo = todo[:limit]
    print(f"{len(done)} already matched, {len(todo)} to look up")
    keep.to_csv(OUT, index=False)

    counts, failures = {}, 0
    with open(OUT, "a", encoding="utf-8", newline="") as f:
        for i, (key, name, our_year) in enumerate(todo, 1):
            row = {"key": key, "query": name, "cleaned": clean_title(name), "our_year": our_year}
            if NOT_A_GAME.search(name):
                row["confidence"] = "not_a_game"
            else:
                results = _search(row["cleaned"], _rotator())
                if results is None:
                    # Left for the next run. A long unbroken run of failures
                    # means RAWG or every key is refusing, so stop rather than
                    # keep calling an API that is saying no.
                    failures += 1
                    if failures >= MAX_CONSECUTIVE_FAILURES:
                        print(f"Stopping: {failures} failed requests in a row. Rerun later to resume.")
                        break
                    time.sleep(5)
                    continue
                failures = 0
                hit, sim = _pick(name, our_year, results)
                base = re.split(r"\s*(?::|\s-\s|\s–\s)\s*", row["cleaned"])[0]
                weak = not hit or grade(sim, our_year, _year(hit.get("released"))) == "low"
                if weak and (base != row["cleaned"] or not results):
                    more = _search(base, _rotator(), precise=bool(results)) or []
                    time.sleep(0.25)
                    hit, sim = _pick(name, our_year, results + more)
                hit = hit or {}
                ry = _year(hit.get("released"))
                row.update({
                    "rawg_name": hit.get("name") or "", "rawg_slug": hit.get("slug") or "",
                    "match": round(sim, 3), "rawg_year": ry,
                    "confidence": grade(sim, our_year, ry) if hit else "low",
                    "released": hit.get("released") or "", "added": hit.get("added"),
                    "ratings_count": hit.get("ratings_count"), "rating": hit.get("rating"),
                    "metacritic": hit.get("metacritic"),
                })
                time.sleep(0.25)
            pd.DataFrame([row], columns=COLUMNS).to_csv(f, header=False, index=False)
            counts[row["confidence"]] = counts.get(row["confidence"], 0) + 1
            if i % 250 == 0:
                f.flush()
                print(f"  {i}/{len(todo)}  {counts}")
    print(f"Done. {counts}. Wrote {OUT}")


REFERENCE_POOL_YEARS = 1   # a year's population also includes the years either side
REFERENCE_MIN_GAMES = 20   # below this a percentile is noise, so the year is left out


def reference() -> dict:
    """Per-release-year cut points of RAWG `added`, for ranking any game.

    For each year: the 0th..100th percentiles of `added` among catalogue games
    released within REFERENCE_POOL_YEARS of it, from confidently matched rows
    only. A searched game's percentile is read off its year's cut points, so the
    ranking needs nothing but this table and the game's own RAWG count - both
    measured the same way, on the same day.
    """
    if not os.path.exists(OUT):
        return {}
    df = pd.read_csv(OUT)
    df = df[df["confidence"].isin(USABLE) & df["added"].notna()].copy()
    df["year"] = df["our_year"].fillna(df["rawg_year"])
    df = df.dropna(subset=["year"])
    years = df["year"].astype(int).to_numpy()
    added = df["added"].astype(float).to_numpy()
    out = {}
    for y in range(int(years.min()), int(years.max()) + REFERENCE_POOL_YEARS + 1):
        ref = added[abs(years - y) <= REFERENCE_POOL_YEARS]
        if len(ref) >= REFERENCE_MIN_GAMES:
            out[str(y)] = {
                "n": int(len(ref)),
                "cuts": [float(v) for v in pd.Series(ref).quantile([i / 100 for i in range(101)])],
            }
    return out


def write_reference(path: str) -> int:
    """Write reference() to path as JSON. Returns the number of years written."""
    import json
    ref = reference()
    if ref:
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"source": "RAWG", "pool_years": REFERENCE_POOL_YEARS, "years": ref},
                      f, separators=(",", ":"))
    return len(ref)


_ROTATOR = None


def _rotator():
    global _ROTATOR
    if _ROTATOR is None:
        _ROTATOR = _KeyRotator(config.rawg_keys())
    return _ROTATOR


if __name__ == "__main__":
    run()
