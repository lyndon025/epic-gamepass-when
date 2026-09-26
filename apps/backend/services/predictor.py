import pickle
import pandas as pd
import numpy as np
import re
from difflib import SequenceMatcher
from datetime import datetime, timedelta

from services import return_odds
import os
import json

# Call of Duty is governed by an announced policy, not by its own history.
# Microsoft said in April 2026 that new Call of Duty releases no longer arrive on
# Game Pass at launch and instead join roughly a year later. Day-one Call of Duty
# covered exactly two releases - Black Ops 6 (Oct 2024) and Black Ops 7 (Nov 2025)
# - and both stay in the catalogue, so the change is not retroactive.
#
# The delay therefore applies ONLY to titles released from the policy date on.
# Older Call of Duty games are already on the service and already in the training
# data; pushing them a year into the future would be plainly wrong, so they fall
# through to the historical lookup instead.
#
# Revisit once Modern Warfare 4 (23 Oct 2026) actually lands, expected late 2027 -
# that is the first real evidence of the new policy and the point at which the
# model can begin to answer this from data rather than from a hardcoded rule.

def _log(message):
    """Print a diagnostic without letting console encoding break a prediction.

    Windows consoles default to cp1252, and plenty of real game titles carry
    characters it cannot encode - Ni no Kuni, Pokemon, Okami, anything Japanese.
    A debug line must never be the reason a prediction fails, which is exactly
    what happened before this existed: printing the game name raised
    UnicodeEncodeError and took the whole request down.
    """
    try:
        print(message)
    except UnicodeEncodeError:
        print(str(message).encode("ascii", "replace").decode("ascii"))


COD_POLICY_START = pd.Timestamp("2026-04-01")
COD_GAMEPASS_DELAY_DAYS = 365

# Microsoft completed the ZeniMax acquisition on 2021-03-09, and Bethesda
# titles released since have gone to Game Pass on day one - Starfield,
# Indiana Jones and the Great Circle, Doom: The Dark Ages. Titles released
# BEFORE that predate the arrangement and reached the service on their own
# schedule, so they fall through to their real history rather than being
# claimed as day one retroactively.
ZENIMAX_ACQUISITION = pd.Timestamp("2021-03-09")

# Edition suffixes that name the same game. A search for "Grand Theft Auto V"
# must find "Grand Theft Auto V: Premium Edition", or the game's real history is
# missed and it gets a model estimate instead. Remasters and remakes are left
# out on purpose: those are different products with their own release dates.
EDITION_SUFFIX = re.compile(
    r"[\s:\-\u2013\u2014]*(?:the\s+)?"
    r"(?:(?:premium|definitive|complete|deluxe|digital deluxe|ultimate|gold|"
    r"game of the year|goty|standard|enhanced|special|anniversary|legendary)"
    r"\s+edition|director'?s cut)\b.*$",
    re.IGNORECASE,
)

# Below this chance of arriving within a year, "any time now" stops being true.
# Between the two, it is still possible but fading; under the lower one it is a
# long shot. Applied to the measured per-service table in arrival_hazard.json.
WINDOW_CHANCE = 0.08
LONG_SHOT_CHANCE = 0.03

# How precisely an answer may be stated, decided by how wide the calibrated band
# came out. A 40-month range does not support naming a month, and pretending
# otherwise is the false precision the intervals exist to avoid.
#
# Resolved here rather than in the frontend so there is one source of truth: the
# UI renders the grain it is handed. Thresholds are measured against real
# predictions, not chosen by taste - see docs/PROTOTYPE_results.html.
GRAIN_MONTH_MAX = 24    # under 2 years of spread -> name a month
GRAIN_YEAR_MAX = 48     # under 4 years -> name a year
GRAIN_FLOOR_MAX = 96    # under 8 years -> give a floor, leave the top open
                        # beyond that -> say we cannot narrow it down


class GameServicePredictor:
    def __init__(
        self,
        csv_path,
        bundle_path,
        platform_name,
        avg_repeat_interval,
        repeat_confidence_mult,
        date_column,
        date_format,
        model_quality_mult=1.0,
        max_confidence_cap=95,
        disclaimer="",
        platform_check=None,
    ):
        self.platform_name = platform_name
        self.avg_repeat_interval = avg_repeat_interval
        self.repeat_confidence_mult = repeat_confidence_mult
        self.model_quality_mult = model_quality_mult
        self.max_confidence_cap = max_confidence_cap
        self.disclaimer = disclaimer
        self.platform_check = platform_check

        self.df = pd.read_csv(csv_path)
        self.df = self.df[self.df["game_name"].notna()].copy()

        # Parse dates from the ACTUAL column name using robust parser
        self.df["added_to_service"] = self.df[date_column].apply(self._parse_date_robust)
        self.df["release_date"] = self.df["release_date"].apply(self._parse_date_robust)
        if "Removed from Service" in self.df.columns:
            self.df["removed_from_service"] = self.df["Removed from Service"].apply(
                self._parse_date_robust
            )
        else:
            self.df["removed_from_service"] = pd.NaT

        # Game Pass and PS Plus are CATALOGUES: a game joins and stays until it
        # is removed, so "is it on the service now" has an answer. Epic and
        # Humble are one-off events with no removal date, so the question does
        # not apply and a blank removal date must not be read as "still there".
        self.is_catalogue = platform_name in ("Xbox Game Pass", "PS Plus Extra")

        # When the data was collected. Catalogue membership is only known as of
        # that date: a game with no removal date was on the service THEN, and may
        # have left since. Written by pipeline.deploy; falls back to the newest
        # arrival in the data, which can only understate freshness.
        self.data_as_of = None
        self.next_update_by = None
        status_path = os.path.join(os.path.dirname(csv_path), "data_status.json")
        if os.path.exists(status_path):
            with open(status_path, encoding="utf-8") as f:
                status = json.load(f)
            self.data_as_of = pd.Timestamp(status.get("collected_on"))
            self.next_update_by = status.get("next_update_by")
        if self.data_as_of is None or pd.isna(self.data_as_of):
            self.data_as_of = self.df["added_to_service"].max()

        self.repeat_stats = self._measure_repeat_behaviour()

        # Arrival chance by game age for this service, written by deploy next to
        # the CSVs. Optional: without it, overdue answers fall back to the band.
        self.hazard = None
        hazard_path = os.path.join(os.path.dirname(csv_path), "arrival_hazard.json")
        if os.path.exists(hazard_path):
            with open(hazard_path, encoding="utf-8") as f:
                hazard_file = json.load(f)
            self.hazard = hazard_file.get("by_dataset", {}).get(os.path.basename(csv_path))
            stored = hazard_file.get("return_odds", {}).get(os.path.basename(csv_path))
        else:
            stored = None

        # Chance a game that already appeared returns within a year, calibrated
        # out of time at deploy (services/return_odds.py). Without the deployed
        # table the uncalibrated one is measured here, which runs high.
        if stored:
            self.return_odds = {int(k): float(v) for k, v in stored["odds"].items()}
            self.return_calibration = stored.get("calibration")
        else:
            self.return_odds = return_odds.table(self.df, self.is_catalogue, self.data_as_of)
            self.return_calibration = None

        _log(f"Loaded {len(self.df)} games from {csv_path}")

        # Phase 5 bundle: quantile models (P10/P50/P90) + featurization maps
        # produced by pipeline.train. The feature row built in predict_new_xgb
        # must match bundle['features'] order exactly.
        with open(bundle_path, "rb") as f:
            self.bundle = pickle.load(f)
        self.median_metacritic = self.bundle.get("median_meta", 75)

    def _measure_repeat_behaviour(self):
        """How often games actually come back on this service, from its own data.

        The repeat tier used to assume a return was due once the average repeat
        interval had passed, so a game given away six years ago read "any time
        now". The data says returns are uncommon: about 12% of Epic giveaways,
        10% of Game Pass titles and 13% of PS Plus titles have ever reappeared,
        and 1% of Humble's. Measured here rather than hardcoded so it stays true
        as the data grows.
        """
        import re

        def norm(name):
            return re.sub(r"[^a-z0-9]", "", str(name).lower())

        now = pd.Timestamp(datetime.now())
        dated = self.df.dropna(subset=["added_to_service"])
        dated = dated[dated["added_to_service"] <= now]
        games = 0
        repeated = 0
        gaps = []
        for _key, group in dated.groupby(dated["game_name"].map(norm)):
            days = sorted(group["added_to_service"].unique())
            # the same event recorded twice a few weeks apart is one appearance
            days = [d for i, d in enumerate(days)
                    if i == 0 or (d - days[i - 1]).days > 45]
            games += 1
            if len(days) > 1:
                repeated += 1
                gaps.extend((days[i + 1] - days[i]).days / 30.44
                            for i in range(len(days) - 1))
        return {
            "games": games,
            "repeated": repeated,
            "rate": (repeated / games) if games else 0.0,
            "gap_p90_months": float(np.percentile(gaps, 90)) if gaps else 60.0,
        }

    def _return_chance(self, years_since):
        k = int(max(0, min(return_odds.MAX_YEARS, np.floor(years_since))))
        return self.return_odds.get(k, 0.0)

    def _precedents(self, primary, limit=3):
        """The publisher's own organic arrivals on this service, as evidence.

        Launch deals are left out for the same reason training leaves them out:
        they say nothing about how long a game without one waits. Returns the
        most recent arrivals plus the longest wait, newest first, so an answer
        of "about two years" sits next to the games that actually took that long.
        """
        if not primary:
            return []
        pub = self.df["publisher"].astype(str).str.split(",").str[0].str.strip()
        rows = self.df[(pub == primary)].dropna(subset=["added_to_service", "release_date"])
        if self.data_as_of is not None:
            rows = rows[rows["added_to_service"] <= self.data_as_of]
        wait = (rows["added_to_service"] - rows["release_date"]).dt.days
        # The launch-window cutoff travels in the bundle, set by training.
        launch_days = float((getattr(self, "bundle", None) or {}).get("launch_window_days", 0))
        # Waits past ten years are classics re-released into a catalogue, true but
        # no guide to how a new game is treated.
        rows = rows.assign(wait=wait)[(wait > launch_days) & (wait <= 3653)]
        if rows.empty:
            return []
        rows = rows.sort_values("added_to_service", ascending=False)
        rows = rows.drop_duplicates(subset=["game_name"])
        picked = rows.head(limit - 1)
        longest = rows.loc[[rows["wait"].idxmax()]]
        picked = pd.concat([picked, longest]).drop_duplicates(subset=["game_name"])
        if len(picked) < limit:
            picked = pd.concat([picked, rows]).drop_duplicates(subset=["game_name"]).head(limit)
        picked = picked.sort_values("added_to_service", ascending=False)
        return [
            {
                "game": str(r.game_name),
                "months": int(round(r.wait / 30.44)),
                "joined": r.added_to_service.strftime("%B %Y"),
            }
            for r in picked.itertuples()
        ]

    def _chance_next_year(self, age_years):
        """Share of games this old, not yet on this service, that arrive within
        the following year. None when no table was deployed."""
        if not self.hazard or age_years is None or age_years < 0:
            return None
        idx = min(int(age_years), len(self.hazard) - 1)
        return float(self.hazard[idx]["chance_next_year"])

    def _parse_date_robust(self, date_str):
        if pd.isna(date_str):
            return pd.NaT
        
        date_str = str(date_str).strip().strip('"') # Remove quotes if present
        
        formats = [
            "%m/%d/%Y",      # 01/20/2026
            "%Y-%m-%d",      # 2026-01-20
            "%B %d, %Y",     # July 17, 2025
            "%b %d, %Y",     # Jul 17, 2025
            "%d-%b-%y",      # 20-Jan-26 (rare but possible)
        ]
        
        for fmt in formats:
            try:
                return pd.to_datetime(date_str, format=fmt)
            except:
                continue
                
        # Fallback
        return pd.to_datetime(date_str, errors="coerce")

    def normalize_title(self, title):
        """Remove all punctuation except spaces, convert to lowercase"""
        return "".join(c for c in title.lower() if c.isalnum() or c.isspace())

    def extract_numbers(self, title):
        """Extract all numbers (digits and Roman numerals) from title"""
        # Strip all punctuation except spaces before searching
        cleaned_title = re.sub(r"[^a-z0-9ivxlcdm\s]", "", title.lower())
        matches = re.findall(r"\b(\d+|[ivxlcdm]+)\b", cleaned_title)
        return set(matches)

    def _check_first_party_publisher(self, publisher, game_name=None, release_date=None):
        """Check if publisher is a first-party publisher for this platform.

        game_name and release_date are needed for Call of Duty, which is decided
        by franchise and release date rather than by publisher alone.
        """
        if not publisher:
            return None

        publisher_lower = publisher.lower()

        if self.platform_name == "Xbox Game Pass":
            # Core Microsoft Studios
            ms_keywords = ["microsoft", "xbox game studios", "xbox publishing"]

            # Microsoft-owned studios. Activision-Blizzard has no blanket rule any
            # more: Call of Duty is handled by policy below, and their other titles
            # have real, varied histories the model reads better than a fixed wait.
            bethesda_keywords = ["bethesda", "zenimax"]

            # Check if it's core Microsoft
            if any(keyword in publisher_lower for keyword in ms_keywords):
                return {
                    "tier": "First-Party Publisher",
                    "category": "Day One (Xbox Game Pass Ultimate)",
                    "confidence": 99,
                    "reasoning": f"Microsoft first-party title. Available Day One on Xbox Game Pass Ultimate & PC Game Pass (Standard tier may not include Day One titles).",
                    "first_party": True,
                    "available_on": ["Xbox Game Pass Ultimate", "PC Game Pass"],
                    "predicted_months": 0.0,
                    "predicted_days": 0.0,
                    "publisher_game_count": None,
                    "publisher_consistency": None,
                    "publisher_consistency": None,
                    "sample_size": None,
                    "prediction_basis": "release_date",
                }

            # Call of Duty: decided by the April 2026 policy, keyed on the title
            # because the policy covers the franchise, not the publisher.
            if game_name and "call of duty" in str(game_name).lower():
                release_dt = (
                    pd.to_datetime(release_date, errors="coerce") if release_date else pd.NaT
                )

                # Pre-policy Call of Duty (and anything with no usable release date)
                # is already on the service and in the data. Fall through to the
                # historical lookup rather than inventing a fresh year-long wait.
                if pd.isna(release_dt) or release_dt < COD_POLICY_START:
                    return None

                arrival = release_dt + timedelta(days=COD_GAMEPASS_DELAY_DAYS)
                days_remaining = (arrival - pd.Timestamp(datetime.now())).days

                if days_remaining <= 0:
                    return {
                        "tier": "Call of Duty (April 2026 Game Pass Policy)",
                        "category": "Available Now (Should Already Be Added)",
                        "confidence": 70,
                        "reasoning": f"{game_name} released over a year ago. New Call of Duty titles join Game Pass about a year after release under the policy announced in April 2026, so this should already be in the catalogue.",
                        "first_party": True,
                        "available_on": ["Xbox Game Pass Ultimate", "PC Game Pass"],
                        "predicted_months": 0.0,
                        "predicted_days": 0.0,
                        "publisher_game_count": None,
                        "publisher_consistency": None,
                        "sample_size": None,
                        "prediction_basis": "policy",
                    }

                return {
                    "tier": "Call of Duty (April 2026 Game Pass Policy)",
                    "category": self._months_to_bucket(days_remaining / 30.44),
                    "confidence": 70,
                    "reasoning": f"{game_name} does not launch into Game Pass. Since April 2026 new Call of Duty releases skip day one and join Game Pass Ultimate and PC Game Pass roughly a year later, putting this around {arrival.strftime('%B %Y')}.",
                    "first_party": True,
                    "available_on": ["Xbox Game Pass Ultimate", "PC Game Pass"],
                    "predicted_months": round(days_remaining / 30.44, 1),
                    "predicted_days": float(days_remaining),
                    "projected_arrival": arrival.strftime("%B %Y"),
                    "publisher_game_count": None,
                    "publisher_consistency": None,
                    "sample_size": None,
                    "prediction_basis": "policy",
                }

            # Bethesda / ZeniMax: Microsoft-owned, and post-acquisition titles go
            # day one. Gated on release date for the same reason Call of Duty is -
            # tier 1 runs before the historical lookup, so an ungated rule would
            # overwrite the real arrival history of pre-2021 titles.
            if any(keyword in publisher_lower for keyword in bethesda_keywords):
                beth_release = (
                    pd.to_datetime(release_date, errors="coerce") if release_date else pd.NaT
                )
                if pd.isna(beth_release) or beth_release < ZENIMAX_ACQUISITION:
                    return None
                return {
                    "tier": "Microsoft-Owned (Bethesda/ZeniMax)",
                    "category": "Day One (Xbox Game Pass Ultimate)",
                    "confidence": 90,
                    "reasoning": f"{publisher} is owned by Microsoft. Post-acquisition titles launch on Game Pass day one (requires Ultimate or PC Game Pass).",
                    "first_party": True,
                    "available_on": ["Xbox Game Pass Ultimate", "PC Game Pass"],
                    "predicted_months": 0.0,
                    "predicted_days": 0.0,
                    "publisher_game_count": None,
                    "publisher_consistency": None,
                    "publisher_consistency": None,
                    "sample_size": None,
                    "prediction_basis": "release_date",
                }

        elif self.platform_name == "PS Plus Extra":
            # No bare "sie": it is a substring of Sierra Games and Sierra On-Line,
            # which were being classified as Sony first-party and handed an
            # 18-month PS Plus estimate. "sony" already covers Sony Interactive
            # Entertainment, so the short form bought nothing.
            sony_keywords = ["sony", "playstation studios", "sony computer"]
            if any(keyword in publisher_lower for keyword in sony_keywords):
                return {
                    "tier": "First-Party Publisher",
                    "category": "Likely (within 12-24 months)",
                    "confidence": 75,
                    "reasoning": f"Sony first-party title from {publisher}. PlayStation Studios games typically join PS Plus Extra catalog within 12-24 months.",
                    "first_party": True,
                    "predicted_months": 18.0,
                    "predicted_days": 540.0,
                    "publisher_game_count": None,
                    "publisher_consistency": None,
                    "publisher_consistency": None,
                    "sample_size": None,
                    "prediction_basis": "release_date",
                }

        return None

    def _answer_grain(self, out):
        """Which answer shape this prediction supports.

        Rule and history answers get no band: a policy verdict's risk is the
        policy changing, not statistical spread, and a repeat interval comes from
        the game's own history rather than the model.
        """
        if out.get("prediction_basis") == "policy" or out.get("first_party"):
            return "rule"

        outlook = out.get("repeat_outlook")
        if outlook == "announced":
            return "announced"
        if outlook == "available":
            return "available"
        if outlook == "unlikely":
            return "unlikely"
        if outlook == "may-return":
            return "may-return"

        tier = str(out.get("tier") or "").lower()
        if "repeat" in tier or "historical" in tier:
            return "repeat"
        if "not on" in tier or "exclusive" in tier or "compat" in tier or "platform check" in tier:
            return "ineligible"

        lo = out.get("predicted_months_low")
        hi = out.get("predicted_months_high")
        mid = out.get("predicted_months")
        if lo is None or hi is None or mid is None:
            return "no-interval"

        # The estimate has passed. Whether that means "soon" depends on how often
        # games this old actually still arrive on this service, which is measured
        # rather than assumed - see pipeline/hazard.py.
        if mid <= 0:
            chance = self._chance_next_year(out.get("game_age_years"))
            out["chance_next_year"] = chance
            if chance is None:
                return "fading" if hi <= 0 else "window"
            if chance >= WINDOW_CHANCE:
                return "window"
            if chance >= LONG_SHOT_CHANCE:
                return "fading"
            return "unlikely-soon"
        # Due within about six weeks, with the window already open: that is
        # "any time now" too, and naming the current month says it less clearly.
        if mid <= 1.5 and lo <= 0:
            return "window"
        width = float(hi) - float(lo)
        if width < GRAIN_MONTH_MAX:
            return "month"
        if width < GRAIN_YEAR_MAX:
            return "year"
        if width < GRAIN_FLOOR_MAX:
            return "floor"
        return "suppressed"

    def _basis_line(self, out, publisher):
        """One short sentence saying what the answer rests on.

        This replaces the confidence percentage. That number was a stack of
        hand-picked constants and was not the probability of any event, so
        nothing could ever show it wrong. A reader can check "based on 34
        previous games" against the publisher stats on the same page.
        """
        grain = out.get("grain")
        pub = (str(publisher).split(",")[0].strip() if publisher else "")

        if grain == "rule":
            tier = str(out.get("tier") or "")
            if "call of duty" in tier.lower():
                return ("Announced policy: new Call of Duty releases join Game Pass "
                        "about a year after launch")
            if "bethesda" in tier.lower():
                return "Microsoft-owned: new releases launch on Game Pass day one"
            if self.platform_name == "Xbox Game Pass":
                return "Microsoft first-party: launches on Game Pass day one"
            if self.platform_name == "PS Plus Extra":
                return ("Sony first-party: usually reaches PS Plus Extra a year or "
                        "more after release")
            return tier or "Publisher policy rather than a forecast"
        if grain == "ineligible":
            return "Not available on this platform"
        as_of = self.data_as_of.strftime("%d %B %Y").lstrip("0")
        if grain == "announced":
            return (f"Officially announced for {out.get('arriving_on')}, as of our "
                    f"last update ({as_of})")
        if grain == "available":
            if out.get("leaving_on"):
                return (f"Scheduled to leave {self.platform_name} on "
                        f"{out['leaving_on']}")
            return (f"In the {self.platform_name} catalogue as of our last update "
                    f"({as_of}). It may have left since.")
        if grain in ("unlikely", "may-return") and out.get("chance_next_year") is not None:
            c = out["chance_next_year"]
            share = "Fewer than 1 in 100" if c < 0.01 else f"About {round(c * 100)} in 100"
            yrs = out.get("years_since_last")
            if yrs is None:
                ago = ""
            elif yrs < 1:
                ago = ", under a year ago"
            else:
                whole = int(yrs)
                ago = f", {whole} year{'s' if whole != 1 else ''} ago"
            times = out.get("sample_size") or 1
            if self.is_catalogue:
                runs = f"On {self.platform_name} {times} times, last" if times > 1 else "Left"
                verb = f"{runs} leaving in" if times > 1 else "Left " + self.platform_name + " in"
                lead = f"{verb} {out.get('last_run_ended')}{ago}" if times > 1 else f"Left {self.platform_name} in {out.get('last_run_ended')}{ago}"
                return (f"{lead}. {share} games that left that long ago come back within a year")
            lead = (f"Given away {times} times, last in {out.get('last_appearance_date')}{ago}" if times > 1
                    else f"Given away in {out.get('last_appearance_date')}{ago}")
            return (f"{lead}. {share} games given away that long ago are given away again within a year")
        if grain == "unlikely":
            done, total = out.get("games_returned"), out.get("games_on_service")
            when = out.get("last_appearance_date")
            # Game Pass and PS Plus are catalogues a game joins and leaves; Epic
            # and Humble hand a game out once. "Given away" is only true of those.
            lead = (f"Was on {self.platform_name} from {when}" if self.is_catalogue
                    else f"Given away in {when}")
            if done is not None and total:
                if self.is_catalogue:
                    return (f"{lead}. Only {done} of the {total} games that have been on "
                            f"{self.platform_name} have ever come back")
                return (f"{lead}. Only {done} of the {total} games {self.platform_name} "
                        f"has given away have ever been given away again")
            return (f"Already appeared in {out.get('last_appearance_date')}, and "
                    f"repeats have not happened on {self.platform_name}")
        if grain == "repeat":
            n = out.get("sample_size")
            if n and n > 1:
                return f"This game has been given away {n} times before"
            return "Based on this game's own history on the service"

        chance = out.get("chance_next_year")
        if grain in ("window", "fading", "unlikely-soon") and chance is not None:
            age = out.get("game_age_years")
            per100 = max(1, round(chance * 100)) if chance > 0 else 0
            age_txt = f"{age:.0f}-year-old " if age else ""
            return (f"About {per100} in 100 {age_txt}games not yet on "
                    f"{self.platform_name} arrive there within a year")

        n = out.get("publisher_game_count")
        if not n:
            return ("Based on the overall average - we have not seen this "
                    "publisher before")
        games = "game" if n == 1 else "games"
        if pub:
            return f"Based on {n} previous {games} from {pub}"
        return f"Based on {n} previous {games} from this publisher"

    def _calculate_confidence(
        self,
        sample_size,
        variance_coefficient=None,
        has_metacritic=False,
        is_repeat=False,
    ):
        if is_repeat:
            if sample_size >= 3:
                base = 85
            elif sample_size == 2:
                base = 75
            else:
                base = 65
            base = int(base * self.repeat_confidence_mult)
        else:
            if sample_size >= 20:
                base = 80
            elif sample_size >= 10:
                base = 70
            elif sample_size >= 5:
                base = 60
            elif sample_size >= 3:
                base = 50
            else:
                base = 40

        if variance_coefficient is not None:
            if variance_coefficient < 0.3:
                base += 10
            elif variance_coefficient < 0.5:
                base += 5
            elif variance_coefficient > 0.8:
                base -= 10

        if has_metacritic:
            base += 5

        base = int(base * self.model_quality_mult)
        return max(min(int(base), self.max_confidence_cap), 5)

    def _months_to_bucket(self, months):
        if months <= 0:
            return "Good chance of coming soon (Past Typical Date)"
        elif months <= 6:
            return "within 6 months"
        elif months <= 12:
            return "within 6-12 months"
        elif months <= 24:
            return "more than 12 months"
        elif months <= 48:
            return "2-3 years"
        else:
            return "more than 3 years"

    def check_if_appeared(self, game_name):
        """Check if game has appeared in service before - with fuzzy matching"""

        # First try exact match
        appearances = self.df[self.df["game_name"].str.lower() == game_name.lower()]

        # Same game, different edition name
        if len(appearances) == 0:
            base = EDITION_SUFFIX.sub("", game_name).strip().lower()
            stripped = self.df["game_name"].astype(str).map(
                lambda n: EDITION_SUFFIX.sub("", n).strip().lower()
            )
            appearances = self.df[stripped == base]
            if len(appearances):
                _log(f"  Edition match: '{game_name}' ~ '{appearances['game_name'].iloc[0]}'")

        # If no exact match, try fuzzy matching
        if len(appearances) == 0:
            best_match = None
            best_score = 0
            threshold = 0.90  # Threshold for fuzzy matching

            # Extract numbers from query
            query_numbers = self.extract_numbers(game_name)
            normalized_query = self.normalize_title(game_name)

            for csv_game_name in self.df["game_name"].unique():
                normalized_csv = self.normalize_title(csv_game_name)
                similarity = SequenceMatcher(
                    None, normalized_query, normalized_csv
                ).ratio()

                csv_numbers = self.extract_numbers(csv_game_name)

                # Only accept match if extracted numbers are identical
                if (
                    similarity > best_score
                    and similarity >= threshold
                    and query_numbers == csv_numbers
                ):
                    best_score = similarity
                    best_match = csv_game_name

            if best_match:
                _log(
                    f"  Fuzzy match: '{game_name}' ~ '{best_match}' ({best_score:.0%})"
                )
                appearances = self.df[
                    self.df["game_name"].str.lower() == best_match.lower()
                ]
            else:
                _log(f"  No match found for '{game_name}'")
                return None
        else:
            _log(f"  Exact match: '{game_name}'")

        if len(appearances) == 0:
            return None

        # Catalogue membership, stated only where the data makes it certain:
        #   joined by the collection date, removal date announced and still ahead
        #       -> on the service, leaving on that date
        #   joined by the collection date, no removal date
        #       -> on the service AS OF the collection date (it may have left since)
        #   arrival dated after the collection date
        #       -> officially announced, not yet a fact
        # A removal date that has already passed means gone, whatever else is true.
        on_now = False
        leaving_on = None
        announced_for = None
        if self.is_catalogue:
            now = pd.Timestamp(datetime.now())
            as_of = self.data_as_of
            added = appearances["added_to_service"]
            removed = appearances["removed_from_service"]
            current = (added <= as_of) & (removed.isna() | (removed > now))
            if current.any():
                on_now = True
                future_removals = removed[current & removed.notna()]
                if len(future_removals):
                    leaving_on = future_removals.min()
            upcoming = added[(added > as_of) & (removed.isna() | (removed > added))]
            if not on_now and len(upcoming):
                announced_for = upcoming.min()

        # Parse dates from the parsed 'added_to_service' column
        dates = appearances["added_to_service"].dropna().sort_values()
        if len(dates) == 0:
            return {
                "appeared": True,
                "repeat_count": len(appearances),
                "last_appearance": None,
            }

        ended = appearances["removed_from_service"].dropna()
        ended = ended[ended <= pd.Timestamp(datetime.now())]
        result = {
            "appeared": True,
            "repeat_count": len(dates),
            "last_appearance": dates.iloc[-1],
            "last_removed": ended.max() if len(ended) else None,
            "on_service_now": on_now,
            "leaving_on": leaving_on,
            "announced_for": announced_for,
        }

        if len(dates) >= 2:
            intervals = [
                (dates.iloc[i + 1] - dates.iloc[i]).days for i in range(len(dates) - 1)
            ]
            result["avg_interval_months"] = np.mean(intervals) / 30
            result["cv"] = (
                np.std(intervals) / np.mean(intervals) if np.mean(intervals) > 0 else 0
            )

        return result

    def predict_repeat(self, game_name):
        """TIER 1: Check if game appeared before - MOST RELIABLE"""
        try:
            history = self.check_if_appeared(game_name)
            if not history or not history.get("appeared"):
                _log(f"  {game_name}: Not in history")
                return None

            last_appearance = history.get("last_appearance")
            if last_appearance is None or pd.isna(last_appearance):
                _log(f"  {game_name}: In history but no date")
                return None

            months_since = (datetime.now() - last_appearance).days / 30
            _log(f"  {game_name}: Last appeared {months_since:.1f} months ago")

            as_of_str = self.data_as_of.strftime("%d %B %Y").lstrip("0")

            # Officially announced as joining: a published date, not a forecast.
            if history.get("announced_for") is not None:
                when = history["announced_for"]
                return {
                    "category": f"Joining {self.platform_name} {when.strftime('%B %Y')}",
                    "confidence": 95,
                    "predicted_months": 0.0,
                    "reasoning": f"Announced to join {self.platform_name} on {when.strftime('%d %B %Y').lstrip('0')}, as of our last update ({as_of_str}).",
                    "sample_size": history["repeat_count"],
                    "tier": "Historical Lookup (Announced)",
                    "repeat_outlook": "announced",
                    "arriving_on": when.strftime("%d %B %Y").lstrip("0"),
                    "recently_appeared": False,
                    "prediction_basis": "catalogue",
                }

            # In the catalogue as of the last collection. Said as of that date,
            # because a blank removal date only proves membership then.
            if history.get("on_service_now"):
                leaving = history.get("leaving_on")
                leaving_str = (leaving.strftime("%d %B %Y").lstrip("0")
                               if leaving is not None else None)
                reasoning = (
                    f"In the {self.platform_name} catalogue since "
                    f"{last_appearance.strftime('%B %Y')}. "
                    + (f"Scheduled to leave on {leaving_str}."
                       if leaving_str else
                       f"No removal date had been announced as of our last update ({as_of_str}).")
                )
                return {
                    "category": f"On {self.platform_name}" + (f" until {leaving_str}" if leaving_str else ""),
                    "confidence": 95,
                    "predicted_months": 0.0,
                    "reasoning": reasoning,
                    "sample_size": history["repeat_count"],
                    "tier": "Historical Lookup (On Service)",
                    "repeat_outlook": "available",
                    "leaving_on": leaving_str,
                    "recently_appeared": True,
                    "months_since_last": float(months_since),
                    "last_appearance_date": last_appearance.strftime("%B %Y"),
                    "prediction_basis": "catalogue",
                }

            # Humble used to have its own "never repeats" rule. It does repeat,
            # rarely (Hollow Knight, Shenmue I & II, Wizard of Legend), so it
            # goes through the same measured return odds as every service.

            last_appearance = history.get("last_appearance")
            if last_appearance is None or pd.isna(last_appearance):
                _log(f"  {game_name}: In history but no date")
                return None

            months_since = (datetime.now() - last_appearance).days / 30
            _log(f"  {game_name}: Last appeared {months_since:.1f} months ago")

            stats = self.repeat_stats
            last_str = last_appearance.strftime("%B %Y")

            # Most games never come back. A single past appearance is therefore
            # evidence it happened, not a forecast that it will happen again - and
            # a game that HAS returned before but is now far past its own rhythm
            # has most likely dropped out of rotation.
            # A dated repeat forecast needs a game with a steady rhythm of its
            # own: three or more runs, gaps that agree with each other, and not
            # already well past the usual gap. Anything looser is answered with
            # the measured odds, because having returned once does not
            # measurably make a game more likely to return again.
            rotating = (
                history["repeat_count"] >= 3
                and history.get("cv", 1.0) <= 0.5
                and months_since <= 1.5 * history.get("avg_interval_months", self.avg_repeat_interval)
            )
            if not rotating:
                # The measured chance of a return within a year, counted from
                # when the last run ended for a catalogue and from the giveaway
                # for Epic. Uncommon everywhere, but not zero, and highest in
                # the first few years.
                ref = history.get("last_removed") if self.is_catalogue else last_appearance
                if ref is None or pd.isna(ref):
                    ref = last_appearance
                years_since = (datetime.now() - ref).days / 365.25
                chance = self._return_chance(years_since)
                may_return = chance >= LONG_SHOT_CHANCE
                ended_str = ref.strftime("%B %Y")
                return {
                    "category": "Could return" if may_return else "Unlikely to return",
                    "confidence": 80,
                    "predicted_months": None,
                    "reasoning": (
                        f"Last on {self.platform_name} until {ended_str}, "
                        f"{years_since:.1f} years ago. About {max(1, round(chance * 100))} in 100 games "
                        f"that left it that long ago have come back within a year. "
                        f"{stats['repeated']} of the {stats['games']} games that have been on it have ever come back."
                        if self.is_catalogue else
                        f"Given away free on {self.platform_name} in {last_str}, "
                        f"{years_since:.1f} years ago. About {max(1, round(chance * 100))} in 100 games "
                        f"given away that long ago were given away again within a year. "
                        f"{stats['repeated']} of the {stats['games']} games it has given away have been given away more than once."
                    ),
                    "sample_size": history["repeat_count"],
                    "tier": "Historical Lookup (Return Odds)",
                    "repeat_outlook": "may-return" if may_return else "unlikely",
                    "chance_next_year": float(chance),
                    "years_since_last": round(float(years_since), 1),
                    "last_run_ended": ended_str,
                    "return_rate": stats["rate"],
                    "games_on_service": stats["games"],
                    "games_returned": stats["repeated"],
                    "recently_appeared": months_since <= 12,
                    "months_since_last": float(months_since),
                    "last_appearance_date": last_str,
                    "prediction_basis": "history",
                }

            if history["repeat_count"] == 1:
                predicted_months = max(0, self.avg_repeat_interval - months_since)
                confidence = self._calculate_confidence(1, None, False, True)
                reasoning = f"Appeared once {months_since:.1f} months ago on {self.platform_name}. Avg repeat interval: ~{self.avg_repeat_interval:.0f} months."
            else:
                avg_interval = history.get(
                    "avg_interval_months", self.avg_repeat_interval
                )
                predicted_months = max(0, avg_interval - months_since)
                confidence = self._calculate_confidence(
                    history["repeat_count"], history.get("cv"), False, True
                )
                reasoning = f"Appeared {history['repeat_count']} times. Avg interval: {avg_interval:.0f} months. Last: {months_since:.0f} months ago. Prediction is estimated wait time from today."

            # Check if game appeared recently (within 12 months)
            recently_appeared = months_since <= 12

            if self.disclaimer:
                reasoning += f" {self.disclaimer}"

            return {
                "category": self._months_to_bucket(predicted_months),
                "confidence": confidence,
                "predicted_months": float(predicted_months),
                "reasoning": reasoning,
                "sample_size": history["repeat_count"],
                "tier": "Historical Lookup (Repeat Pattern)",
                "repeat_outlook": "rotating",
                "recently_appeared": recently_appeared,
                "recently_appeared": recently_appeared,
                "months_since_last": float(months_since),
                "prediction_basis": "wait_time",
                "projected_arrival": (datetime.now() + timedelta(days=float(predicted_months * 30))).strftime("%B %Y"),
            }
        except Exception as e:
            _log(f"Error in predict_repeat: {e}")
            import traceback

            traceback.print_exc()
            return None

    def _remaining_days(self, total_days, release_date_obj, now):
        """Convert a total-wait-from-release into remaining-from-today."""
        if pd.notna(release_date_obj):
            if release_date_obj > now:
                return (release_date_obj - now).days + total_days
            return total_days - (now - release_date_obj).days
        return total_days

    def predict_new_xgb(
        self, game_name, publisher, metacritic_score=None, release_date=None
    ):
        """TIER 2: predict a new game with the quantile bundle (P10/P50/P90).

        Unseen publishers no longer hard-fail; they fall back to the platform-wide
        prior (global mean wait, zero publisher history) with reduced confidence
        and a wide interval - the honest "we don't know much" answer."""
        b = self.bundle
        primary = str(publisher).split(",")[0].strip() if publisher else ""
        known = primary in b["te_map"]

        pub_te = float(b["te_map"].get(primary, b["global_mean_days"]))
        pub_count = int(b["pub_count"].get(primary, 0))
        pub_cv = float(b["pub_cv"].get(primary, 0.5))
        pub_avg_days = float(b.get("pub_avg_days", {}).get(primary, b["global_mean_days"]))
        meta_score = metacritic_score if metacritic_score else self.median_metacritic

        rel_obj = pd.to_datetime(release_date, errors="coerce")
        if pd.notna(rel_obj):
            rel_year, rel_month, rel_quarter = rel_obj.year, rel_obj.month, rel_obj.quarter
        else:
            rel_year, rel_month, rel_quarter = b["rel_year_med"], 6, 2
        # Same clamp as training, read from the bundle so the two cannot drift.
        rel_year = min(float(rel_year), float(b.get("rel_year_cap", rel_year)))

        feat = {
            "metacritic_score": float(meta_score),
            "pub_te": pub_te,
            "pub_count": float(pub_count),
            "pub_cv": pub_cv,
            "rel_year": float(rel_year),
            "rel_month": float(rel_month),
            "rel_quarter": float(rel_quarter),
        }
        X = np.array([[feat[c] for c in b["features"]]])
        # Conformal widening, applied in LOG space before exponentiating so it
        # scales the band multiplicatively. Only the outer quantiles move; the
        # median is the point estimate and must not shift. Bundles predating
        # calibration have no offset, so they degrade to the raw band.
        cqr = float(b.get("cqr_offset", 0.0) or 0.0)
        q_lo, q_hi = min(b["quantiles"]), max(b["quantiles"])
        q_days = {}
        for q in b["quantiles"]:
            log_pred = float(b["models"][str(q)].predict(X)[0])
            if q == q_lo:
                log_pred -= cqr
            elif q == q_hi:
                log_pred += cqr
            q_days[q] = float(np.exp(log_pred))
        # The three quantile models are fitted independently, so nothing forces
        # them into order - on some inputs the P50 comes out ABOVE its own P90,
        # which renders as "6 months, range 0-5 months". Sorting restores the one
        # ordering an interval must have. Standard practice for independently
        # fitted quantile regression, and cheaper than constraining the fit.
        p10_total, p50_total, p90_total = sorted(
            (q_days[0.1], q_days[0.5], q_days[0.9])
        )

        now = datetime.now()
        # The window itself, as absolute dates and NOT clamped to today. The
        # months-from-now fields below floor at zero, which hides where the
        # window actually opened - and "you are inside a window that opened in
        # March" is more useful than "any time now".
        if pd.notna(rel_obj):
            window_start = (rel_obj + timedelta(days=float(p10_total))).strftime("%B %Y")
            window_end = (rel_obj + timedelta(days=float(p90_total))).strftime("%B %Y")
        else:
            window_start = window_end = None
        # How far through that window today falls, 0 to 1, so the UI can place a
        # "you are here" marker without parsing month names (browsers disagree).
        window_progress = None
        if pd.notna(rel_obj) and p90_total > p10_total:
            elapsed = (now - rel_obj).days
            window_progress = min(1.0, max(0.0, (elapsed - p10_total) / (p90_total - p10_total)))
        days_remaining = self._remaining_days(p50_total, rel_obj, now)
        low_days = self._remaining_days(p10_total, rel_obj, now)
        high_days = self._remaining_days(p90_total, rel_obj, now)
        months_remaining = days_remaining / 30
        low_months = max(0.0, low_days / 30)
        high_months = max(0.0, high_days / 30)
        basis = "wait_time" if pd.notna(rel_obj) else "from_release"

        time_context = ""
        if pd.notna(rel_obj):
            if rel_obj > now:
                d = (rel_obj - now).days
                time_context = f"Releases in {d} days. Typical wait ~{p50_total / 30:.1f} months after release."
            else:
                d = (now - rel_obj).days
                if days_remaining <= 0:
                    time_context = f"Released {d} days ago; typical wait ~{p50_total:.0f} days. Already past the usual window."
                else:
                    time_context = f"Released {d} days ago; typical wait ~{p50_total:.0f} days."

        confidence = self._calculate_confidence(pub_count, pub_cv, metacritic_score is not None, False)
        if not known:
            confidence = max(5, int(confidence * 0.5))

        category = self._months_to_bucket(months_remaining)

        reasoning = ""
        if time_context:
            reasoning += time_context + "\n"
        reasoning += f"Most likely ~{max(0, months_remaining):.0f} months (range {low_months:.0f}-{high_months:.0f} months).\n"
        if known:
            reasoning += f"Publisher '{primary}' has {pub_count} games on {self.platform_name}."
        else:
            reasoning += f"No history for publisher '{primary}' on {self.platform_name}; estimate uses overall {self.platform_name} patterns (low confidence)."
        if self.disclaimer:
            reasoning += f" {self.disclaimer}"

        return {
            "category": category,
            "confidence": confidence,
            "predicted_months": float(months_remaining),
            "window_start": window_start,
            "window_end": window_end,
            "window_progress": window_progress,
            "game_age_years": (
                round((now - rel_obj).days / 365.25, 1)
                if pd.notna(rel_obj) and rel_obj <= now else None
            ),
            "predicted_months_low": float(low_months),
            "predicted_months_high": float(high_months),
            "predicted_days": float(days_remaining),
            "reasoning": reasoning,
            "publisher_game_count": pub_count,
            "publisher_consistency": pub_cv,
            "publisher_known": bool(known),
            "precedents": self._precedents(primary),
            "tier": "XGBoost ML Prediction (New Game)",
            "prediction_basis": basis,
            "publisher_avg_wait_days": pub_avg_days,
            "predicted_total_days": float(p50_total),
            "metacritic_score_used": float(meta_score),
            "projected_arrival": (now + timedelta(days=float(days_remaining))).strftime("%B %Y"),
            "projected_arrival_low": (now + timedelta(days=float(max(0, low_days)))).strftime("%B %Y"),
            "projected_arrival_high": (now + timedelta(days=float(max(0, high_days)))).strftime("%B %Y"),
        }

    def predict(
        self,
        game_name,
        publisher=None,
        metacritic_score=None,
        platforms=None,
        release_date=None,
    ):
        """Predict, then annotate with how the answer should be presented.

        A thin wrapper so every one of the cascade's exit points gets grain and
        basis without each having to remember to add them.
        """
        out = self._predict_core(
            game_name,
            publisher=publisher,
            metacritic_score=metacritic_score,
            platforms=platforms,
            release_date=release_date,
        )
        if isinstance(out, dict):
            out["grain"] = self._answer_grain(out)
            # The bucket label comes from the months-remaining arithmetic, which
            # knows nothing about how likely an overdue game still is. Left alone
            # it reads "Good chance of coming soon" next to a 1-in-100 answer.
            overdue_label = {
                "window": "Could be any time now",
                "fading": "Possible, but getting less likely",
                "unlikely-soon": "Unlikely soon",
            }.get(out["grain"])
            if overdue_label:
                out["category"] = overdue_label
            out["basis"] = self._basis_line(out, publisher)
            out["data_as_of"] = self.data_as_of.strftime("%Y-%m-%d")
            if self.next_update_by:
                out["next_update_by"] = self.next_update_by
        return out

    def _predict_core(
        self,
        game_name,
        publisher=None,
        metacritic_score=None,
        platforms=None,
        release_date=None,
    ):
        """The four-tier cascade. First tier that answers, wins."""

        # PRIORITY 1: First-party publisher check
        if publisher:
            first_party_result = self._check_first_party_publisher(
                publisher, game_name=game_name, release_date=release_date
            )
            if first_party_result:
                # For Xbox first-party, check if game is already released. Skipped
                # for policy verdicts (Call of Duty), which already account for the
                # release date and must not be rewritten as a day-one release.
                if (
                    self.platform_name == "Xbox Game Pass"
                    and release_date
                    and first_party_result.get("prediction_basis") != "policy"
                ):
                    try:
                        release_dt = pd.to_datetime(release_date, errors="coerce")
                        if pd.notna(release_dt):
                            now = datetime.now()

                            if release_dt > now:
                                # Game hasn't released yet - Day One
                                days_until_release = (release_dt - now).days
                                first_party_result["category"] = (
                                    "Day One (Available at Game Release)"
                                )
                                first_party_result["reasoning"] = (
                                    f"Microsoft first-party title. Will be available Day One on Xbox Game Pass when it releases in {days_until_release} days."
                                )
                            else:
                                # Game already released - should be available now
                                days_since_release = (now - release_dt).days
                                first_party_result["category"] = (
                                    "Available Now (Very Soon if Not Yet Added)"
                                )
                                first_party_result["reasoning"] = (
                                    f"Microsoft first-party title released {days_since_release} days ago. Should already be available on Xbox Game Pass Ultimate and PC Game Pass, or coming very soon."
                                )
                    except Exception as e:
                        _log(f"Error parsing release date: {e}")

                return {
                    "game_name": game_name,
                    "publisher": publisher,
                    **first_party_result,
                }

        # PRIORITY 2: Platform compatibility check (OPTIONAL)
        if self.platform_check and platforms:
            try:
                platform_result = self.platform_check(platforms, self.platform_name)
                if platform_result:
                    return {"game_name": game_name, **platform_result}
            except Exception as e:
                _log(f"Platform check failed: {e}")

        # PRIORITY 3: Check for repeat pattern (old games)
        try:
            repeat_pred = self.predict_repeat(game_name)
            if repeat_pred:
                _log(f"[ok] Using repeat pattern for {game_name}")
                return {"game_name": game_name, **repeat_pred}
        except Exception as e:
            _log(f"Repeat prediction error: {e}")

        # PRIORITY 4: XGBoost prediction for NEW games
        if not publisher:
            return {
                "game_name": game_name,
                "tier": "Unknown",
                "category": "unknown (no record of publisher in service)",
                "confidence": 0,
                "reasoning": "No publisher provided and no historical data available.",
            }

        _log(f"-> {game_name} not in history, using ML prediction")
        new_pred = self.predict_new_xgb(
            game_name, publisher, metacritic_score, release_date
        )
        return {"game_name": game_name, "publisher": publisher, **new_pred}
