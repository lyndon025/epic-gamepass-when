"""Stage 2b - corrections applied to the canonical data after every enrich.

Enrich rebuilds PS.csv, Xbox.csv and HB.csv from each new snapshot, so a fix
made by hand in data/canonical would not survive the next refresh. Fixes live
here instead and are re-applied every run. Everything is idempotent: running it
twice changes nothing the second time.

Three kinds:
  - PUBLISHER_ALIASES: one publisher recorded under several names, usually
    because it was renamed. Every name is rewritten to the current one in all
    four files, so the publisher's whole record counts as one. The same map
    travels in each model bundle (pipeline.train) and the backend applies it to
    the publisher a request sends, so a search for an older title that RAWG
    still lists under the old name meets the same history.
  - FIXES: one field of one game is wrong at the source, usually because RAWG
    matched a different edition. Each entry says why.
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


def apply(csv_name: str, df: pd.DataFrame, rawg: dict | None = None) -> tuple[pd.DataFrame, list[str]]:
    """Return (corrected copy, list of changes made)."""
    df = df.copy()
    changes = []
    for fix in FIXES:
        if fix["csv"] != csv_name:
            continue
        hit = df["game_name"] == fix["game_name"]
        for idx in df.index[hit]:
            if str(df.at[idx, fix["field"]]) != fix["value"]:
                df.at[idx, fix["field"]] = fix["value"]
                changes.append(f"{fix['game_name']}: {fix['field']} -> {fix['value']}")

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
