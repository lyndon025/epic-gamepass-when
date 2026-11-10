"""Game details from IGDB, the game database Twitch runs (D-059).

Free with a Twitch developer app: its client ID and secret buy an access token
(client-credentials flow, valid about 60 days), and the token reads the IGDB
API at up to 4 requests a second. Unlike the Steam backup, IGDB covers console
games and says which platforms a game is on, so a PlayStation-only game is not
mistaken for a PC one.

What IGDB does not have is a Metacritic score; its critic rating is a
different average on a different panel, so it is never used as one. Scores
keep coming from our records, RAWG or Steam.

Credentials: TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in the environment or a
gitignored .env (pipeline.config.twitch_credentials). Without them every
function here returns None and callers move on.
"""

import time
from datetime import datetime, timezone

import requests

from . import config

TOKEN_URL = "https://id.twitch.tv/oauth2/token"
GAMES_URL = "https://api.igdb.com/v4/games"
FIELDS = ("fields name,slug,first_release_date,platforms.name,cover.image_id,"
          "involved_companies.company.name,involved_companies.publisher,involved_companies.developer;")

_token = {"value": None, "expires": 0.0}
_last_call = [0.0]


def enabled() -> bool:
    cid, secret = config.twitch_credentials()
    return bool(cid and secret)


def _access_token():
    if _token["value"] and time.time() < _token["expires"] - 300:
        return _token["value"]
    cid, secret = config.twitch_credentials()
    if not (cid and secret):
        return None
    r = requests.post(TOKEN_URL, params={"client_id": cid, "client_secret": secret,
                                         "grant_type": "client_credentials"}, timeout=20)
    r.raise_for_status()
    j = r.json()
    _token.update(value=j["access_token"], expires=time.time() + float(j.get("expires_in", 0)))
    return _token["value"]


def query(body: str):
    """One IGDB query (Apicalypse text). None when IGDB is not set up or fails."""
    token = _access_token() if enabled() else None
    if not token:
        return None
    cid, _ = config.twitch_credentials()
    # 3 requests a second: IGDB allows 4 per app, and the site shares them.
    wait = 0.34 - (time.time() - _last_call[0])
    if wait > 0:
        time.sleep(wait)
    for attempt in range(3):
        _last_call[0] = time.time()
        try:
            r = requests.post(GAMES_URL, data=body.encode("utf-8"), timeout=20,
                              headers={"Client-ID": cid, "Authorization": f"Bearer {token}"})
        except requests.RequestException:
            time.sleep(2)
            continue
        if r.status_code == 429:
            time.sleep(1 + attempt)
            continue
        if r.status_code == 401:  # token expired early
            _token["value"] = None
            token = _access_token()
            continue
        return r.json() if r.ok else None
    return None


def _shape(g: dict) -> dict:
    companies = g.get("involved_companies") or []
    pubs = [c["company"]["name"] for c in companies if c.get("publisher") and c.get("company")]
    devs = [c["company"]["name"] for c in companies if c.get("developer") and c.get("company")]
    ts = g.get("first_release_date")
    cover = (g.get("cover") or {}).get("image_id")
    return {
        "name": g.get("name"),
        "slug": f"igdb-{g['id']}",
        "publisher": ", ".join(pubs) or None,
        "developer": ", ".join(devs) or None,
        "release_date": datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d") if ts else None,
        "metacritic_score": None,
        "platforms": [p["name"] for p in g.get("platforms") or [] if p.get("name")],
        "background_image": f"https://images.igdb.com/igdb/image/upload/t_cover_big/{cover}.jpg" if cover else None,
    }


def search(name: str, limit: int = 8) -> list:
    safe = str(name).replace('"', " ").replace("\\", " ")
    rows = query(f'search "{safe}"; {FIELDS} where version_parent = null; limit {limit};')
    return [_shape(g) for g in rows or []]


def find(game_name) -> dict | None:
    """The IGDB game with this name, or None when no result's name agrees."""
    from .enrich import best_match  # the same name check RAWG and Steam results get

    results = search(game_name)
    return best_match(game_name, results) if results else None
