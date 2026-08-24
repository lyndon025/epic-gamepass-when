"""Stage 1 - ingest raw scrape dumps into standardized *_Processed.csv files.

Ported from the original process_new_data.py; logic unchanged, paths now come
from pipeline.config (reads data/raw, writes data/processed).
"""

import os
import re
from datetime import datetime

import pandas as pd

from . import config

# Standard output columns.
COLUMNS = [
    "game_name",
    "release_date",
    "Added to Service",
    "Removed from Service",
    "metacritic_score",
    "publisher",
    "developer",
    "System",
]

# Input files (raw dumps).
XBOX_NEW_FILE = os.path.join(config.DATA_RAW, "Xbox NEW 2026.csv")
PS_NEW_FILE = os.path.join(config.DATA_RAW, "PS NEW 2026.csv")
EPIC_NEW_FILE = os.path.join(config.DATA_RAW, "NEW_Epic Games List from PCGamer.txt")
HB_NEW_FILE = os.path.join(config.DATA_RAW, "NEW_Humble Bundle Up to December 2025 Games.txt")


def parse_date(date_str):
    """Attempt to parse date strings into MM/DD/YYYY format."""
    if pd.isna(date_str) or date_str == "":
        return ""
    formats = ["%b %Y", "%Y-%m-%d", "%m/%d/%Y", "%d-%b", "%B %d"]
    for fmt in formats:
        try:
            dt = datetime.strptime(str(date_str).strip(), fmt)
            if fmt == "%b %Y":
                return dt.strftime("%m/1/%Y")
            return dt.strftime("%m/%d/%Y")
        except ValueError:
            continue
    return str(date_str)


def process_xbox_new():
    print("Processing Xbox New Data...")
    try:
        df = pd.read_csv(XBOX_NEW_FILE, header=1, on_bad_lines="skip")
        df_clean = pd.DataFrame()
        df_clean["game_name"] = df.iloc[:, 0]
        df_clean["release_date"] = df.iloc[:, 7].apply(parse_date)
        df_clean["Added to Service"] = df.iloc[:, 4].apply(parse_date)
        df_clean["Removed from Service"] = df.iloc[:, 5].apply(parse_date)
        df_clean["metacritic_score"] = df.iloc[:, 9]
        df_clean["publisher"] = ""
        df_clean["developer"] = ""
        df_clean["System"] = df.iloc[:, 1]
        df_clean = df_clean.dropna(subset=["game_name"])
        return df_clean[COLUMNS]
    except Exception as e:
        print(f"Error processing Xbox: {e}")
        return pd.DataFrame(columns=COLUMNS)


def process_ps_new():
    print("Processing PS New Data...")
    try:
        df = pd.read_csv(PS_NEW_FILE, header=1, on_bad_lines="skip")
        df_clean = pd.DataFrame()
        df_clean["game_name"] = df.iloc[:, 0]
        df_clean["release_date"] = df.iloc[:, 7].apply(parse_date)
        df_clean["Added to Service"] = df.iloc[:, 4].apply(parse_date)
        df_clean["Removed from Service"] = df.iloc[:, 5].apply(parse_date)
        df_clean["metacritic_score"] = df.iloc[:, 9]
        df_clean["publisher"] = ""
        df_clean["developer"] = ""
        df_clean["System"] = df.iloc[:, 1]
        df_clean = df_clean.dropna(subset=["game_name"])
        return df_clean[COLUMNS]
    except Exception as e:
        print(f"Error processing PS: {e}")
        return pd.DataFrame(columns=COLUMNS)


# --- Epic parsing -----------------------------------------------------------
# The PCGamer article has used two layouts over the years, and a paste can
# contain both, so the parser handles either and takes the year from the section
# header instead of assuming it (the year used to be hardcoded).
#   2026 layout: a standalone date-range line, then one game per following line.
#   legacy layout: "August 14 - August 21: Hidden Folks, Totally Reliable ..."
# The giveaway date is the START of the range (when the game became free).
EPIC_YEAR_RE = re.compile(r"free games.*?(\d{4})", re.IGNORECASE)
EPIC_RANGE_RE = re.compile(r"^([A-Za-z]+)\s+(\d{1,2})\s*[-–]\s*[A-Za-z]+\s+\d{1,2}\s*$")
EPIC_INLINE_RE = re.compile(r"^([A-Za-z]+ \d{1,2})(?: - [A-Za-z]+ \d{1,2})?: (.+)$")
EPIC_SKIP = {"date", "game", "games"}


def _epic_row(name, formatted_date):
    return {
        "game_name": name,
        "release_date": "",
        "Added to Service": formatted_date,
        "Removed from Service": "",
        "metacritic_score": "",
        "publisher": "",
        "developer": "",
        "System": "PC",
    }


def process_epic_txt(default_year=2025):
    print("Processing Epic Text Data...")
    games = []
    current_year = default_year
    pending_date = None
    try:
        with open(EPIC_NEW_FILE, "r", encoding="utf-8") as f:
            lines = f.readlines()
        for line in lines:
            line = line.strip()
            if not line or line.startswith("http"):
                continue

            year_match = EPIC_YEAR_RE.search(line)
            if year_match:
                current_year = int(year_match.group(1))
                pending_date = None
                continue

            if line.lower() in EPIC_SKIP:
                continue

            inline_match = EPIC_INLINE_RE.match(line)
            if inline_match:
                pending_date = None
                formatted = parse_date(f"{inline_match.group(1)}, {current_year}")
                for game in (g.strip() for g in inline_match.group(2).split(",")):
                    if game:
                        games.append(_epic_row(game, formatted))
                continue

            range_match = EPIC_RANGE_RE.match(line)
            if range_match:
                pending_date = parse_date(
                    f"{range_match.group(1)} {range_match.group(2)}, {current_year}"
                )
                continue

            if pending_date:
                games.append(_epic_row(line, pending_date))
    except Exception as e:
        print(f"Error processing Epic: {e}")
    return pd.DataFrame(games, columns=COLUMNS)


# Words that appear in the genre annotation lines of the Humble dumps. The list
# has to be reasonably complete, because the filter below decides a line is an
# annotation when EVERY word in it is a genre - a missing word turns an
# annotation into a fake game, and an over-eager rule deletes a real one.
GENRES = set([
    "Action", "Adventure", "RPG", "Strategy", "Simulation", "Indie", "Shooter",
    "Platformer", "Puzzle", "Racing", "Sports", "MMO", "FPS", "Survival",
    "Horror", "Visual Novel", "Roguelike", "Turn-Based", "Tactical", "Fighting",
    "Multiplayer", "Singleplayer", "Retro", "Rpg", "Fps", "Co-op", "Coop",
    "Casual", "Sandbox", "Metroidvania", "Building", "Management", "Crafting",
    "Exploration", "Card", "Deckbuilder", "Sidescroller", "Arcade", "Stealth",
    "Rhythm", "Educational", "Party", "Trivia", "Openworld", "Open-World",
])


def is_garbage(line):
    if any(term in line for term in ["Subscription", "Get One Month", "Redeem", "Keys expire", "Playtest", "Alpha Playtest", "Redemption", "Instructions"]):
        return True
    words = line.replace(",", " ").split()
    if not words:
        return False
    genre_count = sum(1 for w in words if w in GENRES or w.capitalize() in GENRES)
    # An annotation is a line made up ENTIRELY of genre words. Requiring "all"
    # rather than "half" is what spares real titles that happen to contain one
    # genre word - Settlement Survival, Nomad Survival, Hotshot Racing,
    # Action Henk are all real Humble games the half-rule deleted.
    if genre_count == len(words):
        return True
    # Two or more genre words forming the majority is still an annotation
    # ("Fps Multiplayer Action"), but one genre word in a short title is not.
    if genre_count >= 2 and genre_count >= len(words) * 0.5:
        return True
    if "Monthly" in line and "Games" not in line:
        return True
    return False


def process_hb_txt():
    print("Processing Humble Bundle Text Data...")
    games = []
    try:
        with open(HB_NEW_FILE, "r", encoding="utf-8") as f:
            lines = f.readlines()
        current_date_str = ""
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            if not line:
                i += 1
                continue
            month_match = re.search(r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})", line)
            if month_match:
                date_part = f"{month_match.group(1)} {month_match.group(2)}"
                current_date_str = parse_date(date_part)
                i += 1
                continue
            if not current_date_str:
                i += 1
                continue
            if is_garbage(line):
                i += 1
                continue
            if len(line) > 100:
                i += 1
                continue
            if "redeem" in line.lower():
                i += 1
                continue
            games.append({
                "game_name": line,
                "release_date": "",
                "Added to Service": current_date_str,
                "Removed from Service": "",
                "metacritic_score": "",
                "publisher": "",
                "developer": "",
                "System": "PC",
            })
            i += 1
    except Exception as e:
        print(f"Error processing HB: {e}")
    return pd.DataFrame(games, columns=COLUMNS)


def run():
    """Run all scrapers and write *_Processed.csv into data/processed."""
    config.ensure_dirs()
    xbox_df = process_xbox_new()
    ps_df = process_ps_new()
    epic_df = process_epic_txt()
    hb_df = process_hb_txt()

    print(f"Extracted: Xbox({len(xbox_df)}), PS({len(ps_df)}), Epic({len(epic_df)}), HB({len(hb_df)})")

    xbox_df.to_csv(os.path.join(config.DATA_PROCESSED, "Xbox_Processed.csv"), index=False)
    ps_df.to_csv(os.path.join(config.DATA_PROCESSED, "PS_Processed.csv"), index=False)
    epic_df.to_csv(os.path.join(config.DATA_PROCESSED, "Epic_Processed.csv"), index=False)
    hb_df.to_csv(os.path.join(config.DATA_PROCESSED, "HB_Processed.csv"), index=False)

    print(f"Processing complete. Wrote *_Processed.csv to {config.DATA_PROCESSED}")
    return {"Xbox": len(xbox_df), "PS": len(ps_df), "Epic": len(epic_df), "HB": len(hb_df)}


if __name__ == "__main__":
    run()
