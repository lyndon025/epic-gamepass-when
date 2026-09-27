"""Stage 2b - corrections applied to the canonical data after every enrich.

Enrich rebuilds PS.csv, Xbox.csv and HB.csv from each new snapshot, so a fix
made by hand in data/canonical would not survive the next refresh. Fixes live
here instead and are re-applied every run. Everything is idempotent: running it
twice changes nothing the second time.

Two kinds:
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

# Only PlayStation rows are filled: that is the gap D-035 found and the only
# data retrained for it. Other services keep their data as collected.
FILL_PUBLISHERS = {"PS.csv"}

_BLANK = {"", "nan", "none", "unknown"}


def _norm(name) -> str:
    return re.sub(r"[^a-z0-9]", "", str(name).lower())


def _blank(value) -> bool:
    return pd.isna(value) or str(value).strip().lower() in _BLANK


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
