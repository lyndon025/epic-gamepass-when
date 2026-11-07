"""Game details from the Steam store, the free backup when RAWG is down (D-058).

Steam's public store endpoints need no key: storesearch finds a game by name,
appdetails gives its release date, publishers and Metacritic score. Used only
where RAWG gives nothing, and with the same name check enrich uses, so a
backup never files another game's details.

Two limits to keep in mind: Steam lists PC games only, and its release date is
the PC release (Horizon Forbidden West reads 2024, not its 2022 PlayStation
launch). A game first out on console should be checked by hand.
"""

import re
import time
from datetime import datetime

import requests

HEADERS = {"User-Agent": "epic-gamepass-when data refresh"}
SEARCH = "https://store.steampowered.com/api/storesearch/"
DETAILS = "https://store.steampowered.com/api/appdetails"


def _get(url, params, timeout=20):
    for attempt in range(3):
        try:
            r = requests.get(url, params=params, headers=HEADERS, timeout=timeout)
            if r.status_code == 200:
                return r.json()
            if r.status_code == 429:
                time.sleep(5 * (attempt + 1))
                continue
            return None
        except (requests.RequestException, ValueError):
            time.sleep(2)
    return None


def _iso(date_text):
    """Steam's "Aug 7, 2025" (or "7 Aug, 2025") as "2025-08-07"; None otherwise."""
    for fmt in ("%b %d, %Y", "%d %b, %Y", "%B %d, %Y", "%d %B, %Y", "%b %Y", "%Y"):
        try:
            return datetime.strptime(str(date_text).strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


# Steam writes the company's legal name ("CAPCOM Co., Ltd.", "Milestone
# S.r.l."); our records use the trading name, so the suffix goes.
_LEGAL = re.compile(
    r",?\s+(?:co\.?,?\s+ltd\.?|ltd\.?|inc\.?|llc|s\.r\.l\.?|gmbh|s\.a\.?|corp\.?|k\.k\.)\s*$", re.IGNORECASE)


def _publisher(name):
    name = _LEGAL.sub("", str(name)).strip()
    return name.title() if name.isupper() and len(name) > 4 else name


def details(appid) -> dict | None:
    """One Steam game's details in the shape enrich and the site use."""
    j = _get(DETAILS, {"appids": appid, "cc": "us", "l": "en"})
    entry = (j or {}).get(str(appid)) or {}
    d = entry.get("data") if entry.get("success") else None
    if not d:
        return None
    rel = d.get("release_date") or {}
    return {
        "name": d.get("name"),
        "slug": f"steam-{appid}",
        "publisher": ", ".join(_publisher(p) for p in d.get("publishers") or []) or None,
        "developer": ", ".join(d.get("developers") or []) or None,
        "release_date": None if rel.get("coming_soon") else _iso(rel.get("date")),
        "metacritic_score": (d.get("metacritic") or {}).get("score"),
        "background_image": d.get("header_image"),
        "platforms": ["PC"],
    }


def find(game_name) -> dict | None:
    """The Steam game with this name, or None when no result's name agrees."""
    from .enrich import best_match  # same name check as RAWG results get

    j = _get(SEARCH, {"term": str(game_name), "cc": "us", "l": "en"})
    items = [{"name": i.get("name"), "slug": i.get("id")} for i in (j or {}).get("items", [])]
    match = best_match(game_name, items)
    return details(match["slug"]) if match else None
