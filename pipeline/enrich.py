"""Stage 2 - enrich processed rows via RAWG (publisher/developer/release/
metacritic) and merge into the canonical datasets.

Ported from the original enrich_and_merge.py; logic unchanged. Paths come from
pipeline.config (reads data/processed, writes data/canonical, backups to
data/backups). The RAWG key comes from the RAWG_API_KEY environment variable.
"""

import os
import shutil
import time

import pandas as pd
import requests
from tqdm import tqdm

from . import config

class _KeyRotator:
    """Rotates RAWG keys on auth/rate-limit failures, mirroring the frontend's
    apiKeyManager (cycle on 401/403/429)."""

    def __init__(self, keys):
        self.keys = keys
        self.i = 0

    def current(self):
        return self.keys[self.i] if self.keys else ""

    def cycle(self):
        if self.keys:
            self.i = (self.i + 1) % len(self.keys)
        return self.current()


# processed (input) -> target (canonical) per platform, with merge mode.
FILES_TO_PROCESS = [
    {"processed": os.path.join(config.DATA_PROCESSED, "Xbox_Processed.csv"),
     "target": os.path.join(config.DATA_CANONICAL, "Xbox.csv"),
     "platform_system": "Xbox / PC", "mode": "REPLACE"},
    {"processed": os.path.join(config.DATA_PROCESSED, "PS_Processed.csv"),
     "target": os.path.join(config.DATA_CANONICAL, "PS.csv"),
     "platform_system": "PS5/PS4", "mode": "REPLACE"},
    {"processed": os.path.join(config.DATA_PROCESSED, "Epic_Processed.csv"),
     "target": os.path.join(config.DATA_CANONICAL, "Epic.csv"),
     "platform_system": "PC", "mode": "APPEND"},
    {"processed": os.path.join(config.DATA_PROCESSED, "HB_Processed.csv"),
     "target": os.path.join(config.DATA_CANONICAL, "HB.csv"),
     "platform_system": "PC", "mode": "REPLACE"},
]

METADATA_CACHE = {}


def normalize_name(name):
    return str(name).lower().strip()


def _backup_path(target):
    return os.path.join(config.DATA_BACKUPS, os.path.basename(target).replace(".csv", "_backup.csv"))


def load_cache():
    """Load metadata from existing canonical files into memory."""
    print("Loading local metadata cache...")
    for item in FILES_TO_PROCESS:
        target = item["target"]
        if target and os.path.exists(target):
            try:
                df = pd.read_csv(target)
                for _, row in df.iterrows():
                    name = normalize_name(row.get("game_name"))
                    if name and name not in METADATA_CACHE:
                        pub = str(row.get("publisher", ""))
                        dev = str(row.get("developer", ""))
                        rel = str(row.get("release_date", ""))
                        meta = str(row.get("metacritic_score", ""))
                        if (pub and pub != "nan") or (rel and rel != "nan"):
                            METADATA_CACHE[name] = {
                                "publisher": pub if pub != "nan" else None,
                                "developer": dev if dev != "nan" else None,
                                "release_date": rel if rel != "nan" else None,
                                "metacritic_score": meta if meta != "nan" else None,
                            }
            except Exception as e:
                print(f"Error loading cache from {target}: {e}")
    print(f"Cache loaded with {len(METADATA_CACHE)} games.")


def get_game_details(game_name, rotator):
    """Fetch publisher/developer/release/metacritic from RAWG, rotating keys on
    401/403/429 (up to one full pass over the available keys)."""
    if not game_name or pd.isna(game_name):
        return None
    norm_name = normalize_name(game_name)
    if norm_name in METADATA_CACHE:
        return METADATA_CACHE[norm_name]
    if not rotator.keys:
        return None

    search_query = requests.utils.quote(str(game_name))
    for _ in range(max(1, len(rotator.keys))):
        key = rotator.current()
        try:
            search_url = f"https://api.rawg.io/api/games?key={key}&search={search_query}&page_size=1"
            response = requests.get(search_url, timeout=10)
            if response.status_code in (401, 403, 429):
                rotator.cycle()
                continue
            if response.status_code != 200:
                print(f"API Error {response.status_code} for {game_name}")
                return None
            data = response.json()
            if not data.get("results"):
                return None
            game_slug = data["results"][0]["slug"]

            details_url = f"https://api.rawg.io/api/games/{game_slug}?key={key}"
            response = requests.get(details_url, timeout=10)
            if response.status_code in (401, 403, 429):
                rotator.cycle()
                continue
            if response.status_code != 200:
                return None
            game_data = response.json()
            publishers = [p["name"] for p in game_data.get("publishers", [])]
            developers = [d["name"] for d in game_data.get("developers", [])]
            result = {
                "publisher": ", ".join(publishers) if publishers else None,
                "developer": ", ".join(developers) if developers else None,
                "release_date": game_data.get("released", None),
                "metacritic_score": game_data.get("metacritic", None),
            }
            METADATA_CACHE[norm_name] = result
            return result
        except Exception as e:
            print(f"Error fetching {game_name}: {e}")
            rotator.cycle()
    return None


def run():
    """Enrich each processed file and merge into its canonical target."""
    config.ensure_dirs()
    rotator = _KeyRotator(config.rawg_keys())
    if not rotator.keys:
        print("WARNING: no RAWG keys found (env, apps/frontend/.env, .env, or "
              "'RAWG API key.txt'); only the local cache will be used - games "
              "missing from existing canonical data will not be enriched.")
    else:
        print(f"RAWG keys loaded: {len(rotator.keys)} (rotation enabled).")
    load_cache()

    print("\n--- Starting Data Processing ---")
    for item in FILES_TO_PROCESS:
        processed_path = item["processed"]
        target_path = item["target"]
        mode = item["mode"]
        platform_sys = item["platform_system"]

        if not os.path.exists(processed_path):
            print(f"Skipping {processed_path} (not found)")
            continue

        print(f"\nProcessing {os.path.basename(processed_path)} (Mode: {mode})")
        df = pd.read_csv(processed_path)

        for col in ["publisher", "developer", "release_date", "metacritic_score", "System"]:
            if col not in df.columns:
                df[col] = ""

        df["System"] = df["System"].fillna(platform_sys)
        df.loc[df["System"] == "", "System"] = platform_sys

        indices_to_enrich = []
        for idx, row in df.iterrows():
            pub = str(row.get("publisher", ""))
            date = str(row.get("release_date", ""))
            if pub in ["", "nan", "None"] or date in ["", "nan", "None"]:
                name = normalize_name(row["game_name"])
                if name in METADATA_CACHE:
                    cached = METADATA_CACHE[name]
                    df.loc[idx, "publisher"] = cached.get("publisher")
                    df.loc[idx, "developer"] = cached.get("developer")
                    df.loc[idx, "release_date"] = cached.get("release_date")
                    df.loc[idx, "metacritic_score"] = cached.get("metacritic_score")
                else:
                    indices_to_enrich.append(idx)

        print(f"Need to fetch API for {len(indices_to_enrich)} games.")
        if indices_to_enrich:
            for idx in tqdm(indices_to_enrich, desc="Fetching"):
                game_name = df.loc[idx, "game_name"]
                details = get_game_details(game_name, rotator)
                time.sleep(0.4)
                if details:
                    if pd.isna(df.loc[idx, "publisher"]) or df.loc[idx, "publisher"] == "":
                        df.loc[idx, "publisher"] = details["publisher"]
                    if pd.isna(df.loc[idx, "developer"]) or df.loc[idx, "developer"] == "":
                        df.loc[idx, "developer"] = details["developer"]
                    if pd.isna(df.loc[idx, "release_date"]) or df.loc[idx, "release_date"] == "":
                        df.loc[idx, "release_date"] = details["release_date"]
                    if pd.isna(df.loc[idx, "metacritic_score"]) or df.loc[idx, "metacritic_score"] == "":
                        df.loc[idx, "metacritic_score"] = details["metacritic_score"]
            df.to_csv(processed_path, index=False)

        if mode == "REPLACE":
            if os.path.exists(target_path):
                shutil.copy2(target_path, _backup_path(target_path))
            df.to_csv(target_path, index=False)
            print(f"Replaced {os.path.basename(target_path)} with new snapshot ({len(df)} rows).")
        elif mode == "APPEND" and os.path.exists(target_path):
            shutil.copy2(target_path, _backup_path(target_path))
            df_target = pd.read_csv(target_path)
            df_combined = pd.concat([df_target, df], ignore_index=True)
            # Dedupe on name AND date, not name alone. A game given away twice is
            # two real events, and keeping only the first threw the repeat away -
            # which matters because the repeat tier of the predictor is built
            # entirely from those intervals. Name-and-date still collapses an
            # exact re-ingest of the same dump, which is what dedupe is for.
            df_combined["norm_name"] = df_combined["game_name"].apply(normalize_name)
            df_combined["norm_added"] = pd.to_datetime(
                df_combined["Added to Service"], errors="coerce", format="mixed"
            ).dt.strftime("%Y-%m-%d")
            df_combined = df_combined.drop_duplicates(
                subset=["norm_name", "norm_added"], keep="first"
            )
            df_combined = df_combined.drop(columns=["norm_name", "norm_added"])
            df_combined.to_csv(target_path, index=False)
            print(f"Appended to {os.path.basename(target_path)}. Total rows: {len(df_combined)} (was {len(df_target)})")
        elif mode == "APPEND":
            # No existing target yet - treat the processed file as the canonical.
            df.to_csv(target_path, index=False)
            print(f"Created {os.path.basename(target_path)} ({len(df)} rows).")


if __name__ == "__main__":
    run()
