import pickle
import pandas as pd
import numpy as np
import re
from difflib import SequenceMatcher
from datetime import datetime, timedelta
import os

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
COD_POLICY_START = pd.Timestamp("2026-04-01")
COD_GAMEPASS_DELAY_DAYS = 365


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

        print(f"Loaded {len(self.df)} games from {csv_path}")

        # Phase 5 bundle: quantile models (P10/P50/P90) + featurization maps
        # produced by pipeline.train. The feature row built in predict_new_xgb
        # must match bundle['features'] order exactly.
        with open(bundle_path, "rb") as f:
            self.bundle = pickle.load(f)
        self.median_metacritic = self.bundle.get("median_meta", 75)

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

            # Check if it's Bethesda (Microsoft-owned since 2021)
            if any(keyword in publisher_lower for keyword in bethesda_keywords):
                return {
                    "tier": "Microsoft-Owned (Bethesda/ZeniMax)",
                    "category": "Very Likely (Within 6 Months)",
                    "confidence": 90,
                    "reasoning": f"{publisher} is owned by Microsoft. Most titles join Game Pass Day One (requires Ultimate or PC Game Pass).",
                    "first_party": True,
                    "available_on": ["Xbox Game Pass Ultimate", "PC Game Pass"],
                    "predicted_months": 3.0,
                    "predicted_days": 90.0,
                    "publisher_game_count": None,
                    "publisher_consistency": None,
                    "publisher_consistency": None,
                    "sample_size": None,
                    "prediction_basis": "release_date",
                }

        elif self.platform_name == "PS Plus Extra":
            sony_keywords = ["sony", "playstation studios", "sie", "sony interactive"]
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
                print(
                    f"  Fuzzy match: '{game_name}' ≈ '{best_match}' ({best_score:.0%})"
                )
                appearances = self.df[
                    self.df["game_name"].str.lower() == best_match.lower()
                ]
            else:
                print(f"  No match found for '{game_name}'")
                return None
        else:
            print(f"  Exact match: '{game_name}'")

        if len(appearances) == 0:
            return None

        # Parse dates from the parsed 'added_to_service' column
        dates = appearances["added_to_service"].dropna().sort_values()
        if len(dates) == 0:
            return {
                "appeared": True,
                "repeat_count": len(appearances),
                "last_appearance": None,
            }

        result = {
            "appeared": True,
            "repeat_count": len(dates),
            "last_appearance": dates.iloc[-1],
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
                print(f"  {game_name}: Not in history")
                return None

            last_appearance = history.get("last_appearance")
            if last_appearance is None or pd.isna(last_appearance):
                print(f"  {game_name}: In history but no date")
                return None

            months_since = (datetime.now() - last_appearance).days / 30
            print(f"  {game_name}: Last appeared {months_since:.1f} months ago")

            # --- HUMBLE BUNDLE SPECIAL LOGIC ---
            if self.platform_name == "Humble Choice":
                # Calculate theoretical wait time if it WERE to repeat
                if history["repeat_count"] == 1:
                    theoretical_months = max(0, self.avg_repeat_interval - months_since)
                else:
                    avg_interval = history.get("avg_interval_months", self.avg_repeat_interval)
                    theoretical_months = max(0, avg_interval - months_since)

                last_date_str = last_appearance.strftime("%B %Y")

                return {
                    "category": "Very unlikely (Already Appeared)",
                    "confidence": 95,
                    "predicted_months": 0,
                    "reasoning": f"This game has already appeared in a Humble Choice/Monthly bundle ({last_date_str}). Repeat appearances have never happened before (as of January 2026).",
                    "sample_size": history["repeat_count"],
                    "tier": "Historical Lookup (Humble No-Repeat Rule)",
                    "recently_appeared": False,
                    "months_since_last": 0,
                    "theoretical_wait_time": theoretical_months, # For technical display
                    "theoretical_wait_time": theoretical_months, # For technical display
                    "last_appearance_date": last_date_str,
                    "prediction_basis": "wait_time",
                }
            # -----------------------------------

            last_appearance = history.get("last_appearance")
            if last_appearance is None or pd.isna(last_appearance):
                print(f"  {game_name}: In history but no date")
                return None

            months_since = (datetime.now() - last_appearance).days / 30
            print(f"  {game_name}: Last appeared {months_since:.1f} months ago")

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
                "recently_appeared": recently_appeared,
                "recently_appeared": recently_appeared,
                "months_since_last": float(months_since),
                "prediction_basis": "wait_time",
                "projected_arrival": (datetime.now() + timedelta(days=float(predicted_months * 30))).strftime("%B %Y"),
            }
        except Exception as e:
            print(f"Error in predict_repeat: {e}")
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
        q_days = {q: float(np.exp(b["models"][str(q)].predict(X)[0])) for q in b["quantiles"]}
        p10_total, p50_total, p90_total = q_days[0.1], q_days[0.5], q_days[0.9]

        now = datetime.now()
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
            "predicted_months_low": float(low_months),
            "predicted_months_high": float(high_months),
            "predicted_days": float(days_remaining),
            "reasoning": reasoning,
            "publisher_game_count": pub_count,
            "publisher_consistency": pub_cv,
            "publisher_known": bool(known),
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
        """Main prediction method - Priority checks"""

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
                        print(f"Error parsing release date: {e}")

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
                print(f"Platform check failed: {e}")

        # PRIORITY 3: Check for repeat pattern (old games)
        try:
            repeat_pred = self.predict_repeat(game_name)
            if repeat_pred:
                print(f"✓ Using repeat pattern for {game_name}")
                return {"game_name": game_name, **repeat_pred}
        except Exception as e:
            print(f"Repeat prediction error: {e}")

        # PRIORITY 4: XGBoost prediction for NEW games
        if not publisher:
            return {
                "game_name": game_name,
                "tier": "Unknown",
                "category": "unknown (no record of publisher in service)",
                "confidence": 0,
                "reasoning": "No publisher provided and no historical data available.",
            }

        print(f"→ {game_name} not in history, using ML prediction")
        new_pred = self.predict_new_xgb(
            game_name, publisher, metacritic_score, release_date
        )
        return {"game_name": game_name, "publisher": publisher, **new_pred}
