"""Stage 0 - download the Game Pass and PS Plus catalogue sheets.

Both are public Google Sheets maintained by u/ABattleVet, so the xlsx export URL
works without any login. This replaces exporting them by hand each quarter.

Converts each sheet's "Master List" tab to the CSV that pipeline.ingest reads,
preserving the two-row preamble ingest expects (title row, then headers).

Two things this guards against, both learned the hard way:

  Dates. The xlsx carries real day-precision dates, where a CSV export from the
  sheet carries whatever the cell DISPLAYS ("Jan 2026"). They are written out
  explicitly as MM/DD/YYYY rather than left to pandas' default formatting.

  Column drift. ingest reads these sheets by column POSITION. If the maintainer
  inserts a column, ingest would silently read the wrong field. The header is
  checked against the expected positions and the fetch refuses to proceed on a
  mismatch, which is far better than training on shuffled data.

Epic and Humble have no equivalent sheet and are still assembled by hand.
"""

import os
import urllib.request
from datetime import date, datetime

import pandas as pd

from . import config

# Positions ingest.process_xbox_new / process_ps_new read, with the header each
# one must carry.
EXPECTED_COLUMNS = {0: "Game", 1: "System", 4: "Added", 5: "Removed",
                    7: "Release", 9: "Metacritic"}
# The Game Pass sheet also carries a game's earlier runs in its notes column
# ("Returning title: Joined 8/13/21, left 8/31/22"), which ingest reads.
EXTRA_EXPECTED = {"Xbox": {13: "Owner Notes"}}


def _download(url: str, dest: str) -> int:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as resp, open(dest, "wb") as f:
        data = resp.read()
        f.write(data)
    return len(data)


def _format(value):
    if isinstance(value, (pd.Timestamp, datetime, date)):
        return pd.Timestamp(value).strftime("%m/%d/%Y")
    return value


def _check_header(stem: str, raw: pd.DataFrame) -> None:
    header = [str(h).strip() for h in raw.iloc[1].tolist()]
    expected = dict(EXPECTED_COLUMNS)
    for key, extra in EXTRA_EXPECTED.items():
        if stem.lower().startswith(key.lower()):
            expected.update(extra)
    bad = [
        f"col {i}: expected {want!r}, found {header[i] if i < len(header) else None!r}"
        for i, want in expected.items()
        if i >= len(header) or header[i].lower() != want.lower()
    ]
    if bad:
        raise RuntimeError(
            f"{stem}: sheet layout changed, refusing to ingest. " + "; ".join(bad)
        )


def run() -> dict:
    config.ensure_dirs()
    summary = {}
    for stem, url in config.SHEET_EXPORTS.items():
        xlsx = os.path.join(config.DATA_RAW, f"{stem}.xlsx")
        size = _download(url, xlsx)

        raw = pd.read_excel(xlsx, sheet_name="Master List", header=None)
        _check_header(stem, raw)
        out = raw.apply(lambda col: col.map(_format))
        csv = os.path.join(config.DATA_RAW, f"{stem}.csv")
        out.to_csv(csv, header=False, index=False)

        body = raw.iloc[2:]
        added = pd.to_datetime(body[4], errors="coerce")
        summary[stem] = {
            "bytes": size,
            "rows": int(body[0].notna().sum()),
            "latest_added": str(added.max())[:10],
        }
        print(f"  {stem}: {summary[stem]['rows']} rows, newest entry "
              f"{summary[stem]['latest_added']}, {size / 1024:.0f} KB")

    today = date.today().isoformat()
    with open(config.COLLECTED_ON_FILE, "w", encoding="utf-8") as f:
        f.write(today + "\n")
    print(f"Collected on {today}")
    summary["collected_on"] = today
    return summary


if __name__ == "__main__":
    run()
