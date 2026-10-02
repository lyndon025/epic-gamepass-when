"""Stage 2b - corrections applied to the canonical data after every enrich.

Enrich rebuilds PS.csv, Xbox.csv and HB.csv from each new snapshot, so a fix
made by hand in data/canonical would not survive the next refresh. Fixes live
here instead and are re-applied every run. Everything is idempotent: running it
twice changes nothing the second time.

Four kinds:
  - PUBLISHER_ALIASES: one publisher recorded under several names, usually
    because it was renamed. Every name is rewritten to the current one in all
    four files, so the publisher's whole record counts as one. The same map
    travels in each model bundle (pipeline.train) and the backend applies it to
    the publisher a request sends, so a search for an older title that RAWG
    still lists under the old name meets the same history.
  - FIXES: fields of one game are wrong at the source, usually because RAWG
    matched a different game or edition. Each entry says why. Values come from
    RAWG's entry for the right game, or the real release date where RAWG's own
    date is wrong; a score that belonged to the wrong game is blanked when the
    right entry has none, so the model uses its usual value.
  - DROP: rows that are not games (a free trial, a note about keys, an in-game
    item), removed so they neither teach the models nor answer a search.
  - Missing PlayStation publishers. The PlayStation Store data records the
    publisher in the developer column for many older titles ("Sony Interactive
    Entertainment"), and RAWG's details endpoint knows a few more. Without a
    publisher a row is dropped from training and a Sony game is not recognised
    as Sony (D-035). A developer is only used when it already appears as a
    publisher elsewhere in the same file, which keeps out RAWG uploader
    handles that sometimes sit in that column.
"""

import json
import os
import re

import pandas as pd

from . import config

FIXES = [
    {
        "csv": "PS.csv",
        "game_name": "The Last of Us: Part I",
        "field": "release_date",
        "value": "09/02/2022",
        "why": "RAWG matched Part II Remastered's January 2024 date; Part I launched on PS5 on 2 September 2022.",
    },
    {
        "csv": "PS.csv",
        "game_name": "Poppy Playtime: Chapter 1",
        "field": "publisher",
        "value": "Mob Entertainment",
        "why": "Blank at the source, and RAWG's entry names an unrelated uploader.",
    },
]

# Wrong RAWG matches found in October 2026 (D-055): enrich took RAWG's first
# search result without checking its name. Checked against RAWG one by one.
def _fix(csv, game, why, **fields):
    return {"csv": csv, "game_name": game, "fields": fields, "why": why}


FIXES += [
    # Humble Choice
    _fix("HB.csv", "Sea of Stars: Sunset Edition", "Matched Sunset (Tale of Tales, 2015).",
         release_date="2023-08-29", publisher="Sabotage Studio", metacritic_score="90"),
    _fix("HB.csv", "Indica", "Matched Fahrenheit: Indigo Prophecy (2005); this is INDIKA, so named as the other services and RAWG name it.",
         release_date="2024-05-02", publisher="11 bit studios", metacritic_score="", game_name="INDIKA"),
    _fix("HB.csv", "Saints Row", "Matched the 2006 Xbox 360 game; Humble gave the 2022 reboot.",
         release_date="2022-08-23", metacritic_score=""),
    _fix("HB.csv", "Destroy All Humans!", "Matched the 2005 original; Humble gave the 2020 remake.",
         release_date="2020-07-28"),
    _fix("HB.csv", "Drop Duchy - Complete Edition", "Matched a 2017 Koei Tecmo entry.",
         release_date="2025-05-05", publisher="The Arcade Crew", metacritic_score=""),
    _fix("HB.csv", "Urban Jungle", "Matched a 2017 itch.io game of the same name.",
         release_date="2025-03-21", publisher="Assemble Entertainment"),
    _fix("HB.csv", "Gatekeeper", "Matched a 2017 itch.io game of the same name.",
         release_date="2024-05-13", publisher="HypeTrain Digital"),
    _fix("HB.csv", "Synergy", "Matched a 2017 game of the same name.",
         release_date="2024-05-21", publisher="Goblinz Publishing"),
    _fix("HB.csv", "The Thaumaturge - Deluxe Edition", "Matched a 2015 game by Jesse Makkonen.",
         release_date="2024-03-04", publisher="11 bit studios", metacritic_score=""),
    _fix("HB.csv", "Tales & Tactics", "Matched WARMACHINE: Tactics (2014).",
         release_date="2023-08-10", publisher="Yogscast Games"),
    _fix("HB.csv", "Station To Station", "Matched a 2017 itch.io game of the same name.",
         release_date="2023-10-03", publisher="Prismatika"),
    _fix("HB.csv", "Humankind Definitive Edition", "Matched a 2014 Zen Studios entry.",
         release_date="2021-08-17", publisher="SEGA", metacritic_score="77"),
    _fix("HB.csv", "There Is No Light: Enhanced Edition", "Matched a 2015 Techland entry.",
         release_date="2022-09-19", publisher="HypeTrain Digital", metacritic_score=""),
    _fix("HB.csv", "Chivalry 2 - Epic Edition", "Matched Chivalry: Medieval Warfare (2012).",
         release_date="2021-06-08", publisher="Tripwire Interactive", metacritic_score="78"),
    _fix("HB.csv", "Monster Train (First Class - Collectors Edition)", "Matched a 2014 Viva Media entry.",
         release_date="2020-05-21", publisher="Good Shepherd Entertainment", metacritic_score="86"),
    _fix("HB.csv", "Shapez + Puzzle Dlc", "Matched Sound Shapes (2012).",
         release_date="2020-05-19", publisher="Tobias Springer"),
    _fix("HB.csv", "Gamedec - Definitive Edition", "Matched a 2014 Zen Studios entry.",
         release_date="2021-09-16", publisher="Anshar Studios"),
    _fix("HB.csv", "Valkyria Chronicles 4 Complete Edition", "Matched the first Valkyria Chronicles (2008).",
         release_date="2018-09-25"),
    _fix("HB.csv", "Endless Space\u00ae 2 - Digital Deluxe Edition", "Matched the first Endless Space (2012).",
         release_date="2017-05-19"),
    _fix("HB.csv", "F1 2019 Anniversary Edition", "Matched F1 2017.",
         release_date="2019-06-28", publisher="Codemasters", metacritic_score="87"),
    _fix("HB.csv", "Call of Duty: Black Ops 4 Standard Edition", "Matched the first Black Ops (2010).",
         release_date="2018-10-12", publisher="Activision Blizzard"),
    _fix("HB.csv", "DARK SOULS\u2122 III", "Matched Dark Fall 3: Lost Souls (2009).",
         release_date="2016-04-12", publisher="Bandai Namco Entertainment", metacritic_score="89"),
    _fix("HB.csv", "Tomb Raider IV-VI Remastered", "Named as RAWG names it, so a search finds this giveaway (D-056).",
         game_name="Tomb Raider IV•V•VI Remastered"),
    _fix("HB.csv", "Tomb Raider 1-3 Remastered", "Named as RAWG names it, so a search finds this giveaway (D-056).",
         game_name="Tomb Raider I•II•III Remastered"),
    _fix("PS.csv", "Tomb Raider I-III Remastered", "Named as RAWG names it, so a search finds it (D-056).",
         game_name="Tomb Raider I•II•III Remastered"),
    _fix("Epic.csv", "Tomb Raider I-III Remastered", "Named as RAWG names it, so a search finds this giveaway (D-056).",
         game_name="Tomb Raider I•II•III Remastered"),
    _fix("HB.csv", "Crime Boss: Rockay City - First Month Edition", "Named as RAWG names it; a two-word edition name is not matched on its own (D-056).",
         game_name="Crime Boss: Rockay City"),
    # Epic Games Store
    _fix("Epic.csv", "Arcadgeddon", "Matched a 1999 game; this is IllFonic's Arcadegeddon.",
         release_date="2021-07-08", publisher="IllFonic"),
    _fix("Epic.csv", "Saints Row", "Matched the 2006 Xbox 360 game, never on PC; Epic gave the 2022 reboot.",
         release_date="2022-08-23", metacritic_score=""),
    # Xbox Game Pass
    _fix("Xbox.csv", "Barbie Horse Trails", "Matched Barbie Horse Adventures: Riding Camp (2008).",
         release_date="2025-10-10", metacritic_score=""),
    _fix("Xbox.csv", "Sea of Stars", "Released on 29 August 2023, the day it joined; publisher was blank.",
         release_date="2023-08-29", publisher="Sabotage Studio"),
    _fix("Xbox.csv", "FINAL FANTASY", "The Pixel Remaster; matched an older edition.",
         release_date="2021-07-28", publisher="Square Enix"),
    _fix("Xbox.csv", "Final Fantasy II", "The Pixel Remaster.", release_date="2021-07-28", publisher="Square Enix"),
    _fix("Xbox.csv", "Final Fantasy III", "The Pixel Remaster; matched the 1990 original.",
         release_date="2021-07-28", publisher="Square Enix"),
    _fix("Xbox.csv", "Final Fantasy IV", "The Pixel Remaster; matched the 2014 3D remake.",
         release_date="2021-09-08", publisher="Square Enix"),
    _fix("Xbox.csv", "Final Fantasy V", "The Pixel Remaster; matched the 1992 original.",
         release_date="2021-11-10", publisher="Square Enix"),
    _fix("Xbox.csv", "Final Fantasy VI", "The Pixel Remaster; dated by its 2024 console port.",
         release_date="2022-02-23", publisher="Square Enix"),
    _fix("Xbox.csv", "Tomb Raider: Definitive Edition", "Matched the 2013 original.", release_date="2014-01-28"),
    # PlayStation Plus Extra
    _fix("PS.csv", "Resident Evil (2015)", "Matched the 2005 GameCube release under other publishers.",
         release_date="2015-01-20", publisher="Capcom"),
    _fix("PS.csv", "Tales of Symphonia: Remastered", "Matched the 2004 original and its score.",
         release_date="2023-02-17", metacritic_score=""),
    _fix("PS.csv", "Final Fantasy Type-0 HD", "Matched the 2011 PSP original.", release_date="2015-03-17"),
    _fix("PS.csv", "Tomb Raider: Definitive Edition", "Matched the 2013 original.", release_date="2014-01-28"),
]

# Rows that are not games. Each entry says why.
DROP = [
    {"csv": "HB.csv", "game_name": "Dc Universe Infinite 1-Month Free Trial", "why": "A comic subscription trial."},
    {"csv": "HB.csv", "game_name": "Get Two Months Of Ign Plus", "why": "A website subscription."},
    {"csv": "HB.csv", "game_name": "Those who already own the base game, follow the instructions here.",
     "why": "A note on Humble's page, read as a game."},
    {"csv": "HB.csv", "game_name": "These keys have expired as of January 2nd, 2024.",
     "why": "A note on Humble's page, read as a game."},
    {"csv": "HB.csv", "game_name": "Borderlands 3: Director'S Cut", "why": "An add-on to Borderlands 3, listed the same month."},
    {"csv": "Epic.csv", "game_name": "Olympics Go! Paris 2024 Exclusive Outfits Pack", "why": "An in-game item."},
    {"csv": "Epic.csv", "game_name": "World of Warships: Anniversary Party Favor", "why": "An in-game item."},
    {"csv": "Epic.csv", "game_name": "Destiny 2: Bungie 30th Anniversary Pack", "why": "An add-on."},
]

# Old name -> current name. Matched on the normalised name, so case and
# punctuation do not matter. Each entry says why.
PUBLISHER_ALIASES = [
    {
        "names": ["Microsoft Game Studios", "Microsoft Studios", "Xbox Publishing Studio"],
        "to": "Xbox Game Studios",
        "why": "Microsoft's publishing arm, renamed Microsoft Studios in 2011 and "
               "Xbox Game Studios in 2019; Xbox Publishing Studio is its publishing "
               "team's name. Left apart, The Outer Worlds 2 read as an unseen "
               "publisher on Epic and Humble.",
    },
    {
        "names": ["Sony Computer Entertainment"],
        "to": "Sony Interactive Entertainment",
        "why": "Sony's publishing arm, renamed Sony Interactive Entertainment in 2016. "
               "Left apart, a Sony game's PS Plus odds roughly halved or doubled with the "
               "name RAWG happened to list (x0.85 against x1.70). PlayStation PC and "
               "PlayStation Mobile stay separate labels (D-045).",
    },
]

# D-046. A name is combined only when it is the same company: a formal rename
# (or the company that survived a merger under a new name), the same name with
# a different case, punctuation, legal suffix or a typo, or a regional arm that
# carries the company's own name. Differently-named labels and subsidiaries
# (Deep Silver, Atlus, XSEED, Private Division, EA Originals, EA SPORTS),
# companies that were bought rather than renamed (the original THQ, Rising Star
# Games, LucasArts) and look-alike names of different companies (Gaijin Games and
# Gaijin Entertainment, Uppercut Games and Digital Uppercut, Apogee Software and
# Apogee Entertainment) stay apart, as does anything that could not be confirmed.
# Renames were checked against release years: the old name on the older games.
_RENAMED = [
    (["Focus Home Interactive"], "Focus Entertainment", "renamed 2021"),
    (["Nordic Games", "Nordic Games Publishing"], "THQ Nordic", "renamed 2016, after buying the THQ brand"),
    (["Koch Media"], "PLAION", "renamed 2022; Deep Silver and Prime Matter stay separate labels"),
    (["Curve Digital"], "Curve Games", "renamed 2020"),
    (["Maximum Games"], "Maximum Entertainment", "renamed 2022"),
    (["Whitethorn Digital"], "Whitethorn Games", "renamed 2021"),
    (["Gun Media"], "Gun Interactive", "renamed 2022"),
    (["Bigben Interactive"], "Nacon", "Bigben's games publishing became Nacon in 2019"),
    (["Humble Bundle", "Humble"], "Humble Games", "Humble's publishing became Humble Games in 2020; Humble Hearts is a different studio"),
    (["Infogrames", "Infogrames Entertainment"], "Atari", "renamed Atari in 2003 and 2009"),
    (["Namco", "Namco Hometek", "BANDAI NAMCO Entertainment US", "BANDAI NAMCO Entertainment Europe"],
     "Bandai Namco Entertainment", "Namco's games company, renamed Namco Bandai Games in 2006 and Bandai Namco Entertainment in 2015; plus its US and European arms"),
    (["Koei", "Tecmo Koei", "Tecmo Koei America", "Koei Tecmo"], "Koei Tecmo Games",
     "Koei, the surviving company of the 2009 merger, renamed Tecmo Koei Games in 2010 and Koei Tecmo Games in 2014; plus its US arm"),
    (["Square"], "Square Enix", "Square was the surviving company of the 2003 merger, renamed Square Enix"),
    (["Sierra On-Line"], "Sierra Entertainment", "renamed 1999; Activision's later Sierra Games label stays separate"),
    (["505 Game Street"], "505 Games", "the company's earlier name"),
    (["Marvelous Interactive", "Marvelous AQL", "Marvelous USA", "Marvelous Europe"], "Marvelous",
     "renamed Marvelous AQL in 2011 and Marvelous in 2014; plus its US and European arms; XSEED stays a separate label"),
    (["Spike Co.", "Spike Chunsoft Co", "Spike-Chunsoft CO"], "Spike Chunsoft", "Spike, the surviving company, renamed Spike Chunsoft in 2012"),
    (["WB Games"], "Warner Bros. Interactive", "WB Games is the brand of Warner Bros. Interactive Entertainment"),
    (["Activison"], "Activision Blizzard", "a misspelling of Activision"),
    (["EA Swiss"], "Electronic Arts", "Electronic Arts' Swiss company"),
]

# Same company, same name: regional arms, legal suffixes, case and spelling.
_SAME_NAME = {
    "SEGA": ["SEGA USA"],
    "Atlus": ["Atlus USA"],
    "Konami": ["Konami Digital Entertainment-US", "Konami Entertainment"],
    "Natsume": ["Natsume USA"],
    "GungHo Online Entertainment": ["GungHo Online Entertainment America"],
    "GT Interactive Software": ["GT Interactive", "GT Interactive Software Europe"],
    "Perfect World Entertainment": ["Perfect World"],
    "EA SPORTS": ["EA SPORTS™"],
    "Take Two Interactive": ["Take 2 Interactive Software"],
    "Paradox Interactive": ["ParadoxInteractive"],
    "Bethesda Softworks": ["Bethesda"],
    "Plug In Digital": ["Plug-In Digital"],
    "Fellow Traveller": ["Fellow Traveller Games"],
    "XSEED Games": ["XSEED"],
    "Coffee Stain Studios": ["Coffee Stain"],
    "Arc System Works": ["Arc System Works Co."],
    "Midway Games": ["Midway", "Midway Home Entertainment", "Midway Home Entertainment.inc"],
    "Stardock Entertainment": ["Stardock"],
    "Another Indie": ["Another Indie Studio"],
    "Grip Digital": ["Grip Digital sro"],
    "Techland Publishing": ["Techland"],
    "Thunderful Publishing": ["Thunderful"],
    "H2 Interactive Co": ["H2 Interactive", "H2 Interactive Co."],
    "Image & Form": ["Image and Form", "Image & Form International", "Image & Form Games"],
    "Gamera Games": ["Gamera Game"],
    "Night School Studio": ["Night School Studios", "Night School"],
    "Virgin Interactive": ["Virgin Interactive Entertainment"],
    "Enhance": ["Enhance Games"],
    "Starbreeze": ["Starbreeze Studios"],
    "AQUIRIS": ["Aquiris Game Studio"],
    "Gambitious Digital Entertainment": ["Gambitious"],
    "Armor Games Studios": ["Armor Games"],
    "Noodlecake Studios": ["Noodlecake"],
    "Alientrap": ["Alientrap Games"],
    "Digixart": ["Digixart Entertainment"],
    "NEXT Studios": ["Next Studio"],
    "Acclaim Entertainment": ["Acclaim"],
    "Tate Multimedia": ["TATE MULTIMEDIA S.A"],
    "Digital Uppercut": ["Digital Uppercut Productions"],
    "Polytron": ["Corporation Polytron"],
    "Pillow Castle Games": ["Pillow Castle"],
    "Big Ant Studios": ["Big Ant Studios PTY"],
    "UFO Interactive Games": ["UFO Interactive"],
    "Alawar Entertainment": ["Alawar"],
    "Abylight": ["Abylight Studios"],
    "JoWooD Entertainment": ["JoWooD Productions"],
    "Imagineer": ["Imagineer Co."],
    "Stray Fawn Studio": ["Stray Fawn"],
    "Chainsawesome Games": ["Chainsawesome"],
    "Awesome Games Studio": ["Awesome Games"],
    "Snapbreak": ["Snapbreak Games"],
    "Nival": ["Nival Interactive", "NIVAL INTERNATIONAL"],
    "Blacklight Interactive": ["Blacklight Interactive®"],
    "Joe Richardson": ["Joe Richardson Games"],
    "TT Games": ["TT Games Publishing"],
    "Crema": ["Crema Games"],
    "Two Tribes": ["Two Tribes Publishing"],
    "bitComposer Interactive": ["bitComposer Entertainment"],
    "BAM! Entertainment": ["Bam Entertainment"],
    "cdv Software Entertainment": ["CDV Software"],
    "Other Ocean": ["Other Ocean Interactive"],
    "MAGES": ["MAGES.INC."],
    "Flamebait Games": ["Flamebait"],
    "Almost Human Games": ["Almost Human", "Almost Human Oy"],
    "Over The Moon": ["Over The Moon Games"],
    "Batterystaple Games": ["Batterystaple"],
    "Lucid Dreams Studio": ["Lucid Dreams Studios"],
    "MacSoft": ["MacSoft Games"],
    "Dovetail Games – Fishing": ["Dovetail Games - Fishing"],
    "Blue Wizard Digital": ["Blue Wizard Digital LP"],
    "Twisted Pixel Games": ["Twisted Pixel"],
    "Crazy Viking Studios": ["Crazy Viking"],
    "Digital Reality": ["Digital Reality Software"],
    "Broderbund": ["Broderbund Software"],
    "Petroglyph Games": ["Petroglyph"],
    "Dionic Software": ["Dionic"],
    "Friend & Foe": ["Friend & Foe Games"],
    "Rayark": ["Rayark International"],
    "Handelabra Games": ["Handelabra Studio"],
    "Headup Games": ["Headup Publishing"],
    "Aksys Games": ["Aksys Games Localization"],
}

PUBLISHER_ALIASES += [{"names": names, "to": to, "why": f"Same company: {why} (D-046)."} for names, to, why in _RENAMED]
PUBLISHER_ALIASES += [{"names": names, "to": to, "why": "Same company under the same name: a regional arm, legal suffix, case or spelling variant (D-046)."}
                      for to, names in _SAME_NAME.items()]

# Only PlayStation rows are filled: that is the gap D-035 found and the only
# data retrained for it. Other services keep their data as collected.
FILL_PUBLISHERS = {"PS.csv"}

_BLANK = {"", "nan", "none", "unknown"}


def _norm(name) -> str:
    return re.sub(r"[^a-z0-9]", "", str(name).lower())


def _blank(value) -> bool:
    return pd.isna(value) or str(value).strip().lower() in _BLANK


def alias_map() -> dict[str, str]:
    """Normalised old name -> current name. Saved into every model bundle."""
    out = {}
    for entry in PUBLISHER_ALIASES:
        for name in entry["names"]:
            out[_norm(name)] = entry["to"]
    return out


def canonical_publishers(value, aliases: dict[str, str]):
    """Rewrite each name in a comma-separated publisher list to its current
    name, dropping a name the rewrite makes a repeat. Blank stays blank."""
    if _blank(value):
        return value
    out = []
    for name in str(value).split(","):
        name = aliases.get(_norm(name), name.strip())
        if name and name not in out:
            out.append(name)
    return ", ".join(out)


def _rawg_publishers() -> dict:
    """Publisher by normalised name, from the stored RAWG details."""
    path = os.path.join(config.DATA_CANONICAL, "rawg_details.jsonl")
    out = {}
    if not os.path.exists(path):
        return out
    with open(path, encoding="utf-8") as f:
        for line in f:
            try:
                d = json.loads(line)
            except ValueError:
                continue
            pub = d.get("publisher")
            if _blank(pub):
                continue
            for key in {_norm(d.get("name")), _norm(d.get("slug"))}:
                if key:
                    out.setdefault(key, pub)
    return out


def _same(current, value) -> bool:
    """True when a field already holds the value: blank equals blank, and
    "90" equals the 90.0 pandas reads back, so a second run changes nothing."""
    if _blank(current) and _blank(value):
        return True
    try:
        return float(current) == float(value)
    except (TypeError, ValueError):
        return str(current).strip() == str(value).strip()


def apply(csv_name: str, df: pd.DataFrame, rawg: dict | None = None) -> tuple[pd.DataFrame, list[str]]:
    """Return (corrected copy, list of changes made)."""
    df = df.copy()
    changes = []
    for drop in DROP:
        if drop["csv"] != csv_name:
            continue
        hit = df["game_name"] == drop["game_name"]
        if hit.any():
            df = df[~hit]
            changes.append(f"{drop['game_name']}: dropped {int(hit.sum())} row(s), {drop['why']}")
    for fix in FIXES:
        if fix["csv"] != csv_name:
            continue
        fields = fix.get("fields") or {fix["field"]: fix["value"]}
        hit = df["game_name"] == fix["game_name"]
        for idx in df.index[hit]:
            for field, value in fields.items():
                if not _same(df.at[idx, field], value):
                    # A text value may land in a column pandas read as numbers.
                    if df[field].dtype != object:
                        df[field] = df[field].astype(object)
                    df.at[idx, field] = value if value != "" else None
                    changes.append(f"{fix['game_name']}: {field} -> {value or 'blank'}")

    if csv_name in FILL_PUBLISHERS and "publisher" in df.columns:
        rawg = _rawg_publishers() if rawg is None else rawg
        # A value may be written as text into a column pandas read as floats.
        df["publisher"] = df["publisher"].astype(object)
        known = {_norm(p) for p in df["publisher"] if not _blank(p)}
        for idx in df.index[df["publisher"].map(_blank)]:
            pub = rawg.get(_norm(df.at[idx, "game_name"]))
            source = "RAWG"
            dev = df.at[idx, "developer"] if "developer" in df.columns else None
            if pub is None and not _blank(dev) and _norm(dev) in known:
                pub, source = str(dev).strip(), "developer"
            if pub is not None:
                df.at[idx, "publisher"] = pub
                changes.append(f"{df.at[idx, 'game_name']}: publisher -> {pub} (from {source})")

    # After the fill, so a publisher filled from RAWG under an old name is
    # rewritten too.
    if "publisher" in df.columns:
        aliases = alias_map()
        renamed = df["publisher"].map(lambda v: canonical_publishers(v, aliases))
        moved = (renamed != df["publisher"]) & ~df["publisher"].map(_blank)
        for idx in df.index[moved]:
            changes.append(f"{df.at[idx, 'game_name']}: publisher {df.at[idx, 'publisher']} -> {renamed[idx]}")
        df["publisher"] = renamed
    return df, changes


def run() -> dict:
    """Apply every correction to data/canonical in place. Returns changes per file."""
    rawg = _rawg_publishers()
    report = {}
    for csv_name in config.CANONICAL.values():
        path = os.path.join(config.DATA_CANONICAL, csv_name)
        if not os.path.exists(path):
            continue
        df = pd.read_csv(path)
        fixed, changes = apply(csv_name, df, rawg)
        if changes:
            fixed.to_csv(path, index=False)
        report[csv_name] = changes
        print(f"{csv_name}: {len(changes)} correction(s)")
    return report


if __name__ == "__main__":
    run()
