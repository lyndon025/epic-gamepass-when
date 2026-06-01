import pandas as pd
import os
import re
from datetime import datetime

# File Paths
BASE_DIR = r"i:\Lyndon\AI ML\Project\Epic and Gamepass Predictor"
XBOX_DIR = os.path.join(BASE_DIR, "Xbox")
EPIC_DIR = os.path.join(BASE_DIR, "Epic")
HB_DIR = os.path.join(BASE_DIR, "HB")

# Input Files
XBOX_NEW_FILE = os.path.join(XBOX_DIR, "Xbox NEW 2026.csv")
PS_NEW_FILE = os.path.join(XBOX_DIR, "PS NEW 2026.csv")
EPIC_NEW_FILE = os.path.join(EPIC_DIR, "NEW_Epic Games List from PCGamer.txt")
HB_NEW_FILE = os.path.join(HB_DIR, "NEW_Humble Bundle Up to December 2025 Games.txt")

# Output/Reference Files
XBOX_OLD_FILE = os.path.join(XBOX_DIR, "Xbox.csv")
PS_OLD_FILE = os.path.join(XBOX_DIR, "PS.csv")
EPIC_OLD_FILE = os.path.join(EPIC_DIR, "Epic.csv")
HB_OUTPUT_FILE = os.path.join(HB_DIR, "HB.csv")

# Standard Columns
COLUMNS = [
    "game_name",
    "release_date",
    "Added to Service",
    "Removed from Service",
    "metacritic_score",
    "publisher",
    "developer",
    "System"
]

def parse_date(date_str):
    """Attempt to parse date strings into MM/DD/YYYY format."""
    if pd.isna(date_str) or date_str == "":
        return ""
    
    formats = [
        "%b %Y",       # Jan 2026
        "%Y-%m-%d",    # 2026-01-01
        "%m/%d/%Y",    # 10/1/2025
        "%d-%b",       # 31-Dec (Need to infer year)
        "%B %d",       # December 31
    ]
    
    for fmt in formats:
        try:
            dt = datetime.strptime(str(date_str).strip(), fmt)
            # If format is month-only or day-month, might need year adjustment, 
            # but for now let's just return what we have or handle specifically.
            if fmt == "%b %Y":
                return dt.strftime("%m/1/%Y") # Default to 1st of month
            return dt.strftime("%m/%d/%Y")
        except ValueError:
            continue
    return str(date_str)


def process_xbox_new():
    print("Processing Xbox New Data...")
    try:
        # Header is on row 2 (index 1)
        # using on_bad_lines='skip' to avoid crashing on malformed rows
        df = pd.read_csv(XBOX_NEW_FILE, header=1, on_bad_lines='skip') 
        
        # Select relevant columns and rename
        # Handle duplicate columns by using unique names or index
        # Game is col 0
        # Release is col 7 (based on header string, checks needed if names are duplicate)
        # Added is col 4 (first occurrence)
        
        df_clean = pd.DataFrame()
        df_clean["game_name"] = df.iloc[:, 0] # Game
        df_clean["release_date"] = df.iloc[:, 7].apply(parse_date) # Release
        df_clean["Added to Service"] = df.iloc[:, 4].apply(parse_date) # Added
        df_clean["Removed from Service"] = df.iloc[:, 5].apply(parse_date) # Removed
        df_clean["metacritic_score"] = df.iloc[:, 9] # Metacritic
        df_clean["publisher"] = ""
        df_clean["developer"] = ""
        df_clean["System"] = df.iloc[:, 1] # System
        
        df_clean = df_clean.dropna(subset=["game_name"])
        return df_clean[COLUMNS]
    except Exception as e:
        print(f"Error processing Xbox: {e}")
        return pd.DataFrame(columns=COLUMNS)

def process_ps_new():
    print("Processing PS New Data...")
    try:
        # Header on row 2 (index 1)
        df = pd.read_csv(PS_NEW_FILE, header=1, on_bad_lines='skip')
        
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

def process_epic_txt():
    print("Processing Epic Text Data...")
    games = []
    current_year = 2025 # Heuristic
    
    try:
        with open(EPIC_NEW_FILE, "r", encoding="utf-8") as f:
            lines = f.readlines()
            
        for line in lines:
            line = line.strip()
            if not line or line.startswith("http"):
                continue
                
            match = re.search(r"([A-Za-z]+ \d{1,2})(?: - [A-Za-z]+ \d{1,2})?: (.+)", line)
            if match:
                date_str = match.group(1)
                game_text = match.group(2)
                
                game_list = [g.strip() for g in game_text.split(",")]
                full_date_str = f"{date_str}, {current_year}"
                formatted_date = parse_date(full_date_str)
                
                for g in game_list:
                    games.append({
                        "game_name": g,
                        "release_date": "", 
                        "Added to Service": formatted_date,
                        "Removed from Service": "",
                        "metacritic_score": "",
                        "publisher": "",
                        "developer": "",
                        "System": "PC"
                    })
    except Exception as e:
        print(f"Error processing Epic: {e}")
        
    return pd.DataFrame(games, columns=COLUMNS)

BLACKLIST_TERMS = [
    "Subscription", "Get One Month", "Redemption", "Keys expire", "Redeem",
    "Choice", "Bundle", "Monthly", "Charity", "Humble Trove", "About the Charity",
    "Coupons", "Off Ultimate Bundle", "Playtest", "Alpha", "Beta", "Demo",
    "Soundtrack", "DLC", "Expansion", "Pass", "Upgrade", "Edition", "Pack",
    "Collection", "Anthology" # Careful with these, some are games
]
# Specifically exclude "non-game" lines that are just genre lists
GENRES = set([
    "Action", "Adventure", "RPG", "Strategy", "Simulation", "Indie", "Shooter", 
    "Platformer", "Puzzle", "Racing", "Sports", "MMO", "FPS", "Survival", 
    "Horror", "Visual Novel", "Roguelike", "Turn-Based", "Tactical", "Fighting"
])

def is_garbage(line):
    # Check if line contains blacklist terms that definitely indicate non-game
    if any(term in line for term in ["Subscription", "Get One Month", "Redeem", "Keys expire", "Playtest", "Alpha Playtest", "Redemption", "Instructions"]):
        return True
    
    # Check if line is just genres
    words = line.replace(",", "").split()
    # If more than 50% of words are genres, skip
    genre_count = sum(1 for w in words if w in GENRES or w.capitalize() in GENRES)
    if genre_count > 0 and genre_count >= len(words) * 0.5:
        return True
    
    # Check if header-like but not caught
    if "Monthly" in line and not "Games" in line:
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
            
            # Detect Date Headers
            # E.g. "December 2025 Games", "December 2019 Monthly", etc.
            # We want to catch lines that have a Month and Year
            month_match = re.search(r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})", line)
            if month_match:
                # If it ends with "Games" or "Monthly" or just seems to be a header
                # We update the date
                date_part = f"{month_match.group(1)} {month_match.group(2)}" # Month Year
                current_date_str = parse_date(date_part)
                # This line is a header, so we skip adding it as a game
                i += 1
                continue
            
            # If we don't have a date yet, skip
            if not current_date_str:
                i += 1
                continue
                
            if is_garbage(line):
                i += 1
                continue
            
            # Heuristics for Game Name
            # It shouldn't be too long
            if len(line) > 100: 
                i += 1
                continue
                
            # Exclude lines that are likely descriptions (contain verbs/sentences?)
            # Hard to do without NLP, but length/blacklist helps.
            
            # Special check for "Must be redeemed..."
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
                "System": "PC"
            })
            
            i += 1
            
    except Exception as e:
        print(f"Error processing HB: {e}")
        
    return pd.DataFrame(games, columns=COLUMNS)

def main():
    # 1. Process Data
    xbox_df = process_xbox_new()
    ps_df = process_ps_new()
    epic_df = process_epic_txt()
    hb_df = process_hb_txt()
    
    print(f"Extracted: Xbox({len(xbox_df)}), PS({len(ps_df)}), Epic({len(epic_df)}), HB({len(hb_df)})")
    
    # 2. Merge/Append (Simulated for now, just saving clean versions)
    # Ideally we load old CSVs and append, but let's save these as "processed" first to verify.
    
    xbox_df.to_csv(os.path.join(XBOX_DIR, "Xbox_Processed.csv"), index=False)
    ps_df.to_csv(os.path.join(XBOX_DIR, "PS_Processed.csv"), index=False)
    epic_df.to_csv(os.path.join(EPIC_DIR, "Epic_Processed.csv"), index=False)
    hb_df.to_csv(HB_OUTPUT_FILE, index=False)
    
    print("Processing Complete. Check *_Processed.csv files.")

if __name__ == "__main__":
    main()
