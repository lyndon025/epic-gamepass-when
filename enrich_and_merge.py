import pandas as pd
import requests
import time
import os
import shutil
from tqdm import tqdm

# Configuration
# RAWG key comes from the environment, never hardcoded (D-006). The raw key
# lives in the gitignored "RAWG API key.txt" for local use.
API_KEY = os.environ.get("RAWG_API_KEY", "")
BASE_DIR = r"i:\Lyndon\AI ML\Project\Epic and Gamepass Predictor"

# Define operations
FILES_TO_PROCESS = [
    {
        "processed": os.path.join(BASE_DIR, "Xbox", "Xbox_Processed.csv"),
        "target": os.path.join(BASE_DIR, "Xbox", "Xbox.csv"),
        "platform_system": "Xbox / PC",
        "mode": "REPLACE" # Xbox processed is a full snapshot
    },
    {
        "processed": os.path.join(BASE_DIR, "Xbox", "PS_Processed.csv"),
        "target": os.path.join(BASE_DIR, "Xbox", "PS.csv"),
        "platform_system": "PS5/PS4",
        "mode": "REPLACE" # PS processed is a full snapshot
    },
    {
        "processed": os.path.join(BASE_DIR, "Epic", "Epic_Processed.csv"),
        "target": os.path.join(BASE_DIR, "Epic", "Epic.csv"),
        "platform_system": "PC",
        "mode": "APPEND" # Epic processed is just new giveaways
    },
    {
        "processed": os.path.join(BASE_DIR, "HB", "HB.csv"),
        "target": None,
        "platform_system": "PC",
        "mode": "NEW" # HB is a new standalone list
    }
]

METADATA_CACHE = {}

def normalize_name(name):
    return str(name).lower().strip()

def load_cache():
    """Load metadata from existing target files into memory."""
    print("Loading local metadata cache...")
    count = 0
    for item in FILES_TO_PROCESS:
        target = item['target']
        if target and os.path.exists(target):
            try:
                df = pd.read_csv(target)
                for _, row in df.iterrows():
                    name = normalize_name(row.get('game_name'))
                    if name and name not in METADATA_CACHE:
                        # Only cache if it has useful data
                        pub = str(row.get('publisher', ''))
                        dev = str(row.get('developer', ''))
                        rel = str(row.get('release_date', ''))
                        meta = str(row.get('metacritic_score', ''))
                        
                        if (pub and pub != 'nan') or (rel and rel != 'nan'):
                            METADATA_CACHE[name] = {
                                'publisher': pub if pub != 'nan' else None,
                                'developer': dev if dev != 'nan' else None,
                                'release_date': rel if rel != 'nan' else None,
                                'metacritic_score': meta if meta != 'nan' else None
                            }
                            count += 1
            except Exception as e:
                print(f"Error loading cache from {target}: {e}")
    print(f"Cache loaded with {len(METADATA_CACHE)} games.")

def get_game_details(game_name):
    """Fetch publisher, developer, release_date, metacritic from RAWG."""
    if not game_name or pd.isna(game_name):
        return None

    # Check cache first
    norm_name = normalize_name(game_name)
    if norm_name in METADATA_CACHE:
        return METADATA_CACHE[norm_name]

    try:
        search_query = requests.utils.quote(str(game_name))
        search_url = f"https://api.rawg.io/api/games?key={API_KEY}&search={search_query}&page_size=1"
        response = requests.get(search_url, timeout=10)
        # response.raise_for_status() 
        if response.status_code != 200:
            print(f"API Error {response.status_code} for {game_name}")
            return None

        data = response.json()
        
        if not data.get('results'):
             return None
             
        game_slug = data['results'][0]['slug']
        
        details_url = f"https://api.rawg.io/api/games/{game_slug}?key={API_KEY}"
        response = requests.get(details_url, timeout=10)
        if response.status_code != 200:
            return None
            
        game_data = response.json()

        publishers = [p['name'] for p in game_data.get('publishers', [])]
        developers = [d['name'] for d in game_data.get('developers', [])]
        
        result = {
            'publisher': ', '.join(publishers) if publishers else None,
            'developer': ', '.join(developers) if developers else None,
            'release_date': game_data.get('released', None),
            'metacritic_score': game_data.get('metacritic', None)
        }
        
        # Update Cache
        METADATA_CACHE[norm_name] = result
        return result
        
    except Exception as e:
        print(f"Error fetching {game_name}: {e}")
        return None

def enrich_and_merge():
    load_cache()
    
    print("\n--- Starting Data Processing ---")
    for item in FILES_TO_PROCESS:
        processed_path = item['processed']
        target_path = item['target']
        mode = item['mode']
        platform_sys = item['platform_system']
        
        if not os.path.exists(processed_path):
            print(f"Skipping {processed_path} (not found)")
            continue
            
        print(f"\nProcessing {os.path.basename(processed_path)} (Mode: {mode})")
        df = pd.read_csv(processed_path)
        
        # Ensure cols
        for col in ['publisher', 'developer', 'release_date', 'metacritic_score', 'System']:
            if col not in df.columns:
                df[col] = ""
        
        df['System'] = df['System'].fillna(platform_sys)
        df.loc[df['System'] == "", 'System'] = platform_sys

        # Enrich
        indices_to_enrich = []
        for idx, row in df.iterrows():
            pub = str(row.get('publisher', ''))
            date = str(row.get('release_date', ''))
            
            # Check if we need data
            if pub in ['', 'nan', 'None'] or date in ['', 'nan', 'None']:
                # Try cache first (instant)
                name = normalize_name(row['game_name'])
                if name in METADATA_CACHE:
                    cached = METADATA_CACHE[name]
                    df.loc[idx, 'publisher'] = cached.get('publisher')
                    df.loc[idx, 'developer'] = cached.get('developer')
                    df.loc[idx, 'release_date'] = cached.get('release_date')
                    df.loc[idx, 'metacritic_score'] = cached.get('metacritic_score')
                else:
                    indices_to_enrich.append(idx)
        
        print(f"Need to fetch API for {len(indices_to_enrich)} games.")
        
        if indices_to_enrich:
            for idx in tqdm(indices_to_enrich, desc="Fetching"):
                game_name = df.loc[idx, 'game_name']
                details = get_game_details(game_name)
                time.sleep(0.4) # Respect rate limits
                
                if details:
                    if pd.isna(df.loc[idx, 'publisher']) or df.loc[idx, 'publisher'] == "":
                        df.loc[idx, 'publisher'] = details['publisher']
                    if pd.isna(df.loc[idx, 'developer']) or df.loc[idx, 'developer'] == "":
                        df.loc[idx, 'developer'] = details['developer']
                    if pd.isna(df.loc[idx, 'release_date']) or df.loc[idx, 'release_date'] == "":
                        df.loc[idx, 'release_date'] = details['release_date']
                    if pd.isna(df.loc[idx, 'metacritic_score']) or df.loc[idx, 'metacritic_score'] == "":
                        df.loc[idx, 'metacritic_score'] = details['metacritic_score']
            
            # Save Enriched
            df.to_csv(processed_path, index=False)
        
        # MERGE
        if mode == "REPLACE" and target_path:
            # Backup
            if os.path.exists(target_path):
                shutil.copy2(target_path, target_path.replace(".csv", "_backup.csv"))
            df.to_csv(target_path, index=False)
            print(f"Replaced {target_path} with new full snapshot ({len(df)} rows).")
            
        elif mode == "APPEND" and target_path and os.path.exists(target_path):
            shutil.copy2(target_path, target_path.replace(".csv", "_backup.csv"))
            df_target = pd.read_csv(target_path)
            
            # Append new data
            df_combined = pd.concat([df_target, df], ignore_index=True)
            
            # Dedup (keep first, which is old data, but we might want to update? 
            # Actually for Epic giveaways, if it's already there, keep it.)
            before = len(df_combined)
            df_combined['norm_name'] = df_combined['game_name'].apply(normalize_name)
            df_combined = df_combined.drop_duplicates(subset=['norm_name'], keep='first')
            df_combined = df_combined.drop(columns=['norm_name'])
            
            df_combined.to_csv(target_path, index=False)
            print(f"Appended to {target_path}. Total rows: {len(df_combined)} (was {len(df_target)})")
            
        elif mode == "NEW" and target_path:
             # Just save to target if defined, but HB has processed=target essentially.
             pass

if __name__ == "__main__":
    enrich_and_merge()
