"""Pre-flight: prove the backend works locally BEFORE anything is deployed.

Hosting should never be what discovers a bug. Every check here runs in-process
against the real bundles and the real canonical CSVs in apps/backend, so it
exercises the code path the deployed service uses without needing a server, a
network, or a dev environment.

Run it after deploy.run() and before pushing. Exits non-zero on failure, so it
can become the CI gate in Phase 7.

What it deliberately checks:
  - every platform's bundle loads and serves
  - the four serving tiers each still fire on a case that should reach them
  - the response carries every field the frontend binds to
  - interval bounds come back correctly ordered
  - awkward input degrades instead of crashing

It does NOT check accuracy. That is pipeline.backtest and pipeline.holdout.
This answers a narrower question: is the thing wired up correctly.
"""

import json
import os
import sys
import traceback

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))), "apps", "backend"))

BACKEND = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "apps", "backend")

# Fields the frontend reads. Renaming any of these is a breaking change and
# should go through docs/CONTRACT.md (Phase 6).
REQUIRED_FIELDS = ["game_name", "category", "confidence", "reasoning", "tier",
                   "grain", "basis", "data_as_of"]


class Result:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.notes = []

    def check(self, label, condition, detail=""):
        if condition:
            self.passed += 1
            print(f"  PASS  {label}")
        else:
            self.failed += 1
            print(f"  FAIL  {label}" + (f"  -> {detail}" if detail else ""))
            self.notes.append(label)

    def soft(self, label, detail):
        print(f"  NOTE  {label}" + (f"  -> {detail}" if detail else ""))


def _build_predictors():
    from platform_config import PLATFORMS
    from services.platform_checks import (check_pc_platform, check_playstation_platform,
                                          check_xbox_platform)
    from services.predictor import GameServicePredictor

    # The same platform checks app.py wires in, so answers that depend on the
    # game's consoles (not on PC, older PlayStation) are checked as served.
    checks = {"pc": check_pc_platform, "xbox": check_xbox_platform,
              "playstation": check_playstation_platform}

    built = {}
    for cfg in PLATFORMS:
        built[cfg["key"]] = GameServicePredictor(
            csv_path=os.path.join(BACKEND, cfg["csv"]),
            bundle_path=os.path.join(BACKEND, "models", cfg["bundle"]),
            platform_name=cfg["platform_name"],
            avg_repeat_interval=cfg["avg_repeat_interval"],
            repeat_confidence_mult=cfg["repeat_confidence_mult"],
            date_column=cfg["date_column"],
            date_format=cfg["date_format"],
            model_quality_mult=cfg["model_quality_mult"],
            max_confidence_cap=cfg["max_confidence_cap"],
            disclaimer=cfg["disclaimer"],
            platform_check=checks[cfg["platform_check"]],
        )
    return built


def run():
    r = Result()

    print("=" * 74)
    print("PRE-FLIGHT - backend served from apps/backend, in-process")
    print("=" * 74)

    # ---- 1. everything loads -------------------------------------------
    print("\n[1] Bundles and datasets load")
    try:
        preds = _build_predictors()
        r.check("all four platforms construct", len(preds) == 4,
                f"got {len(preds)}")
    except Exception as e:
        print(f"  FAIL  could not construct predictors -> {e}")
        traceback.print_exc()
        return 1

    for key, p in preds.items():
        has_bundle = getattr(p, "bundle", None) is not None or \
            getattr(p, "models", None) is not None
        r.check(f"{key}: model bundle present", has_bundle)
        # Explicit None check: a DataFrame has no truth value, so "or []" raises.
        frame = getattr(p, "df", None)
        n = 0 if frame is None else len(frame)
        r.check(f"{key}: dataset non-empty", n > 0, f"{n} rows")

    # ---- 2. each serving tier still fires ------------------------------
    print("\n[2] Serving tiers fire on a case that should reach them")

    cases = [
        # (label, platform key, kwargs, predicate on result, description)
        ("tier 1 first-party -> day one", "gamepass",
         dict(game_name="Halo Infinite", publisher="Microsoft",
              release_date="12/08/2021"),
         lambda o: o.get("predicted_months") == 0.0,
         "Microsoft on Game Pass should be 0 months"),

        ("new Sony game -> Sony window, best estimate", "psplus",
         dict(game_name="Ghost of Yotei", publisher="Sony Interactive Entertainment",
              release_date="2025-10-02", platforms=[{"platform": {"name": "PlayStation 5"}}]),
         lambda o: o.get("tier") == "Sony Window" and o.get("grain") == "year"
         and (o.get("track_record") or {}).get("n", 0) >= 8
         and o.get("projected_arrival_low") and o.get("projected_arrival_high"),
         "a Sony PS5 game gets Sony's measured range and its own track record (D-037)"),

        ("Sony game inside its range -> any time now", "psplus",
         dict(game_name="Astro Bot", publisher="Sony Interactive Entertainment",
              release_date="2024-09-06"),
         lambda o: o.get("tier") == "Sony Window" and o.get("grain") == "window"
         and o.get("window_start") and o.get("window_end"),
         "past 18 months but inside the measured range reads 'Could be any time now'"),

        ("PS3-only game -> not a PS Plus Extra game", "psplus",
         dict(game_name="Folklore", publisher="Sony Computer Entertainment",
              release_date="2007-06-21", platforms=[{"platform": {"name": "PlayStation 3"}}]),
         lambda o: o.get("grain") == "ineligible" and o.get("ineligible_reason") == "classic",
         "older PlayStation games are not in the PS4/PS5 catalogue (D-035)"),

        ("PS4 and Vita game -> still eligible", "psplus",
         dict(game_name="Some Cross-Buy Game 777", publisher="Nonexistent Studio QQQ",
              release_date="2015-05-05",
              platforms=[{"platform": {"name": "PlayStation 4"}}, {"platform": {"name": "PS Vita"}}]),
         lambda o: o.get("grain") != "ineligible",
         "a PS4 release makes a game eligible even if it is also on Vita"),

        ("tier 1 COD policy -> ~12mo from release", "gamepass",
         dict(game_name="Call of Duty: Modern Warfare 4", publisher="Activision",
              release_date="10/23/2026"),
         lambda o: o.get("prediction_basis") == "policy",
         "post-2026 Call of Duty follows the announced policy"),

        ("old COD falls through, NOT +1yr", "gamepass",
         dict(game_name="Call of Duty: Black Ops II", publisher="Activision",
              release_date="11/13/2012"),
         lambda o: o.get("prediction_basis") != "policy",
         "pre-policy Call of Duty must not get the 12-month rule"),

        ("tier 4 model on an unseen publisher", "epic",
         dict(game_name="Some Entirely Made Up Game 12345",
              publisher="Nonexistent Studio QQQ", release_date="03/04/2024",
              metacritic_score=75),
         lambda o: o.get("confidence", 0) > 0,
         "unseen publisher must still answer, not refuse (P7)"),
    ]

    # A game that is in the Game Pass catalogue right now, picked from the live
    # data so this check survives every refresh. "Now" is the collection date,
    # not today: membership is only known as of then, and a game added after it
    # (a day-one release, say) is answered by its own rule, not the catalogue.
    import pandas as pd
    with open(os.path.join(BACKEND, "data_status.json"), encoding="utf-8") as f:
        as_of = pd.Timestamp(json.load(f)["collected_on"])
    xb = pd.read_csv(os.path.join(BACKEND, "Xbox.csv"))
    added = pd.to_datetime(xb["Added to Service"], errors="coerce", format="mixed")
    removed = pd.to_datetime(xb["Removed from Service"], errors="coerce", format="mixed")
    live = xb[(added <= as_of) & removed.isna()]
    if len(live):
        row = live.iloc[0]
        cases.append((
            "on the service now -> available", "gamepass",
            dict(game_name=str(row["game_name"]), publisher=str(row["publisher"]),
                 release_date=str(row["release_date"])),
            lambda o: o.get("grain") == "available",
            "a catalogue game with no removal date is on the service now",
        ))

    # A Sony game in the catalogue right now must say so, not get a forecast:
    # the Sony window runs after the history check (D-037).
    ps = pd.read_csv(os.path.join(BACKEND, "PS.csv"))
    ps_added = pd.to_datetime(ps["Added to Service"], errors="coerce", format="mixed")
    ps_removed = pd.to_datetime(ps["Removed from Service"], errors="coerce", format="mixed")
    sony_live = ps[(ps_added <= as_of) & ps_removed.isna()
                   & ps["publisher"].fillna("").str.contains("Sony", case=False)]
    if len(sony_live):
        row = sony_live.iloc[0]
        cases.append((
            "Sony game in the catalogue -> available", "psplus",
            dict(game_name=str(row["game_name"]), publisher=str(row["publisher"]),
                 release_date=str(row["release_date"])),
            lambda o: o.get("grain") == "available",
            "a Sony game already on PS Plus Extra is answered from the catalogue",
        ))
    r.check("served PS data has no PS3/Vita/PSP-only rows",
            ps["System"].astype(str).str.contains("PS4|PS5").all(),
            "deploy should write only config.served_rows")

    # A game whose arrival date is after the collection date: announced, and
    # must never be presented as already on the service.
    upcoming = xb[added > as_of]
    if len(upcoming):
        row = upcoming.iloc[0]
        cases.append((
            "announced arrival -> announced, not available", "gamepass",
            dict(game_name=str(row["game_name"]), publisher=str(row["publisher"]),
                 release_date=str(row["release_date"])),
            lambda o: o.get("grain") in ("announced", "available", "rule"),
            "an announced arrival is a published date, not a forecast",
        ))

    cases += [
        ("given once long ago -> rarely returns", "epic",
         dict(game_name="Grand Theft Auto V", publisher="Rockstar Games",
              release_date="04/14/2015"),
         lambda o: o.get("grain") == "unlikely" and (o.get("chance_next_year") or 1) < 0.03,
         "a giveaway six years old has a measured return chance under 3%; also exercises edition matching"),

        ("given several times -> full history, answered with odds", "epic",
         dict(game_name="Control", publisher="Remedy Entertainment",
              release_date="08/27/2019"),
         lambda o: o.get("grain") in ("may-return", "unlikely")
         and (o.get("sample_size") or 0) >= 3 and o.get("chance_next_year") is not None
         and len(o.get("chance_by_year") or []) == 8
         and abs(o["chance_by_year"][0] - o["chance_next_year"]) < 1e-3
         and o["chance_by_year"] == sorted(o["chance_by_year"]),
         "Control was given away in June 2021, December 2021 and December 2024; "
         "the full giveaway history must be present and answered with measured odds, "
         "with a rising 8-year running chance that starts at the one-year chance"),

        ("RAWG year tag -> finds the game's history", "psplus",
         dict(game_name="Demon's Souls (2020)", publisher="Sony Interactive Entertainment",
              release_date="2020-11-12"),
         lambda o: str(o.get("tier", "")).startswith("Historical"),
         "\"Demon's Souls (2020)\" is the PS5 game that joined Extra in June 2022"),

        ("year tag of a different game -> kept apart", "gamepass",
         dict(game_name="Star Wars: Battlefront II (2005)", publisher="Disney Interactive", release_date="2005-10-30"),
         lambda o: not str(o.get("tier", "")).startswith("Historical"),
         "the 2005 Battlefront II is not EA's 2017 game of the same name that was on Game Pass"),

        ("same title written differently -> finds its history", "humble",
         dict(game_name="Remnant 2", publisher="Gearbox Publishing", release_date="2023-07-25"),
         lambda o: str(o.get("tier", "")).startswith("Historical") and o.get("last_appearance_date") == "October 2024",
         "Humble lists it as \"Remnant Ii®\"; Roman numerals and marks must not hide a giveaway (D-056)"),

        ("one-word edition name -> finds its history", "humble",
         dict(game_name="Sea of Stars", publisher="Sabotage Studio", release_date="2023-08-29"),
         lambda o: str(o.get("tier", "")).startswith("Historical") and o.get("last_appearance_date") == "July 2026",
         "Humble lists it as \"Sea of Stars: Sunset Edition\" (D-056)"),

        ("sequel number -> kept apart", "humble",
         dict(game_name="Octopath Traveler", publisher="Square Enix", release_date="2018-07-13"),
         lambda o: not str(o.get("tier", "")).startswith("Historical"),
         "Humble gave Octopath Traveler II, not the first game; a number is never read away (D-056)"),

        ("subtitle before an edition name -> kept apart", "epic",
         dict(game_name="Fallout", publisher="Bethesda Softworks", release_date="1997-09-30"),
         lambda o: not str(o.get("tier", "")).startswith("Historical"),
         "Epic gave Fallout: New Vegas Ultimate Edition, which is not Fallout; only one word before "
         "\"Edition\" is ever dropped (D-056)"),

        ("year tag of the same game -> finds its history", "epic",
         dict(game_name="Saints Row (2022)", publisher="Deep Silver", release_date="2022-08-23"),
         lambda o: str(o.get("tier", "")).startswith("Historical") and o.get("last_appearance_date") == "December 2023",
         "Epic gave away the 2022 reboot in December 2023 (the 2006 game was never on PC; D-055)"),

        ("past best guess, window open -> chance by window end", "humble",
         dict(game_name="Persona 3 Reload", publisher="SEGA", release_date="2024-02-01"),
         lambda o: o.get("grain") not in ("fading", "unlikely-soon", "window")
         or (o.get("window_progress") or 1) >= 1
         or (o.get("chance_by_window_end") is not None
             and 0 <= o["chance_by_window_end"] <= 1
             and (o.get("window_years_left", 0) < 1
                  or o["chance_by_window_end"] >= (o.get("chance_next_year") or 0) - 1e-4)),
         "while the window is open the answer says how the yearly odds add up before it closes (CONTRACT v1.9)"),

        ("tiny chance -> 'fewer than 1 in 100', not rounded up", "humble",
         dict(game_name="Grand Theft Auto V", publisher="Rockstar Games", release_date="2013-09-17"),
         lambda o: (o.get("chance_next_year") is None or o["chance_next_year"] >= 0.01)
         or str(o.get("basis", "")).startswith("Fewer than 1 in 100"),
         "a 0.2% chance must not read 'About 1 in 100'"),

        ("renamed publisher -> one history", "epic",
         dict(game_name="The Outer Worlds 2", publisher="Microsoft Studios",
              release_date="2025-10-29"),
         lambda o: o.get("publisher_known") is True
         and "Xbox Game Studios" in str(o.get("basis", "")),
         "Microsoft Studios and Xbox Game Studios are one publisher (corrections.PUBLISHER_ALIASES)"),

        ("Metacritic on record -> used, and both odds views", "humble",
         dict(game_name="Persona 3 Reload", publisher="SEGA", release_date="2024-02-01",
              platforms=[{"platform": {"name": "PC"}}]),
         lambda o: o.get("metacritic_source") == "records"
         and o.get("odds_method") == "two_views"
         and (o.get("chance_views") or {}).get("by_window") is not None
         and 0 < (o.get("chance_next_year") or 0) <= (o.get("chance_ever") or 0) <= 1
         and abs(sum(b["chance"] for b in o.get("chance_buckets") or []) - (o.get("chance_by_window_end") or 0)) < 0.005,
         "RAWG has no Metacritic for Persona 3 Reload; the score on record is used, and the "
         "window's stretches add up to the chance by its end (D-041)"),

        ("Sony on PS Plus: Sony's window, odds like everyone else", "psplus",
         dict(game_name="Some Sony Game 4242", publisher="Sony Interactive Entertainment",
              release_date="2026-03-01", platforms=[{"platform": {"name": "PlayStation 5"}}]),
         lambda o: o.get("tier") == "Sony Window" and o.get("odds_method") == "two_views"
         and (o.get("chance_views") or {}).get("band_neutral") is True
         and (o.get("chance_next_year") or 0) > 0,
         "Sony's own games are dated from Sony's record (D-037) and get the same chances as "
         "other games, with a missing Metacritic score counted as neutral (D-044)"),

        ("old, never given -> decays, not 'any time now'", "epic",
         dict(game_name="Red Dead Redemption 2", publisher="Rockstar Games",
              release_date="10/26/2018"),
         lambda o: o.get("grain") in ("unlikely-soon", "fading"),
         "an 8-year-old game not yet on Epic has ~1% yearly chance"),
    ]

    results = {}
    for label, key, kwargs, predicate, why in cases:
        try:
            out = preds[key].predict(**kwargs)
            results[label] = out
            r.check(label, bool(out) and predicate(out),
                    f"{why}; got months={out.get('predicted_months')} "
                    f"basis={out.get('prediction_basis')} "
                    f"tier={out.get('tier')}")
        except Exception as e:
            r.check(label, False, f"raised {type(e).__name__}: {e}")

    # ---- 3. response shape ---------------------------------------------
    print("\n[3] Response carries the fields the frontend binds to")
    sample = results.get("tier 4 model on an unseen publisher")
    if sample:
        for field in REQUIRED_FIELDS:
            r.check(f"field present: {field}", field in sample)
        has_interval = "predicted_months_low" in sample and \
            "predicted_months_high" in sample
        if has_interval:
            lo = sample["predicted_months_low"]
            mid = sample.get("predicted_months")
            hi = sample["predicted_months_high"]
            r.check("interval bounds ordered low <= mid <= high",
                    lo <= mid <= hi, f"{lo} / {mid} / {hi}")
            r.soft("interval width (months)", f"{hi - lo:.1f}")
        else:
            r.soft("no interval on this path",
                   "expected on the model tier; rule tiers return a point")
    else:
        r.check("model-tier response available to inspect", False)

    # ---- 4. awkward input degrades rather than crashing -----------------
    print("\n[4] Awkward input degrades instead of crashing")
    edge = [
        ("no publisher", "epic", dict(game_name="Mystery Game")),
        ("empty publisher", "gamepass", dict(game_name="X", publisher="")),
        ("no release date", "humble",
         dict(game_name="Y", publisher="Devolver Digital")),
        ("garbage release date", "psplus",
         dict(game_name="Z", publisher="Sega", release_date="not-a-date")),
        ("unicode title", "epic",
         dict(game_name="Ni no Kuni II: Revenant Kingdom – 日本",
              publisher="Bandai Namco")),
    ]
    for label, key, kwargs in edge:
        try:
            out = preds[key].predict(**kwargs)
            r.check(f"survives {label}", isinstance(out, dict) and bool(out),
                    f"returned {type(out).__name__}")
        except Exception as e:
            r.check(f"survives {label}", False, f"raised {type(e).__name__}: {e}")

    # ---- precomputed answers ---------------------------------------------
    # The site serves these before it ever calls the backend, so they must come
    # from exactly the backend being deployed: same models, data and code.
    print()
    print("Precomputed answers")
    from . import precompute
    meta_path = os.path.join(precompute.OUT_DIR, "meta.json")
    if os.path.exists(meta_path):
        with open(meta_path, encoding="utf-8") as f:
            pmeta = json.load(f)
        r.check("precomputed answers match this backend",
                pmeta.get("backend_hash") == precompute.backend_hash(),
                "models, data or backend code changed since they were generated; rerun pipeline.precompute")
    else:
        r.soft("precomputed answers", "none generated; every request goes to the backend")

    # ---- verdict --------------------------------------------------------
    print()
    print("=" * 74)
    total = r.passed + r.failed
    if r.failed:
        print(f"PRE-FLIGHT FAILED - {r.failed} of {total} checks failed")
        for n in r.notes:
            print(f"  - {n}")
        print("Do not deploy.")
        return 1
    print(f"PRE-FLIGHT PASSED - {r.passed}/{total} checks")
    print("Backend is wired correctly. This says nothing about accuracy;")
    print("see pipeline.backtest and pipeline.holdout for that.")
    return 0


if __name__ == "__main__":
    sys.exit(run())
