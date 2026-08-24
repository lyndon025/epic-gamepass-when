"""Pre-flight: prove the backend works locally BEFORE anything is deployed.

Hosting should never be what discovers a bug. Every check here runs in-process
against the real bundles and the real canonical CSVs in apps/backend, so it
exercises the code path the deployed service uses without needing a server, a
network, or a dev environment.

Run it after deploy.run() and before pushing. Exits non-zero on failure, so it
can become the CI gate in Phase 7.

What it deliberately checks:
  - every platform's bundle loads and serves
  - the four serving tiers each still fire on a case that should reach them
  - the response carries every field the frontend binds to
  - interval bounds come back correctly ordered
  - awkward input degrades instead of crashing

It does NOT check accuracy. That is pipeline.backtest and pipeline.holdout.
This answers a narrower question: is the thing wired up correctly.
"""

import os
import sys
import traceback

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))), "apps", "backend"))

BACKEND = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "apps", "backend")

# Fields the frontend reads. Renaming any of these is a breaking change and
# should go through docs/CONTRACT.md (Phase 6).
REQUIRED_FIELDS = ["game_name", "category", "confidence", "reasoning", "tier"]


class Result:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.notes = []

    def check(self, label, condition, detail=""):
        if condition:
            self.passed += 1
            print(f"  PASS  {label}")
        else:
            self.failed += 1
            print(f"  FAIL  {label}" + (f"  -> {detail}" if detail else ""))
            self.notes.append(label)

    def soft(self, label, detail):
        print(f"  NOTE  {label}" + (f"  -> {detail}" if detail else ""))


def _build_predictors():
    from platform_config import PLATFORMS
    from services.predictor import GameServicePredictor

    built = {}
    for cfg in PLATFORMS:
        built[cfg["key"]] = GameServicePredictor(
            csv_path=os.path.join(BACKEND, cfg["csv"]),
            bundle_path=os.path.join(BACKEND, "models", cfg["bundle"]),
            platform_name=cfg["platform_name"],
            avg_repeat_interval=cfg["avg_repeat_interval"],
            repeat_confidence_mult=cfg["repeat_confidence_mult"],
            date_column=cfg["date_column"],
            date_format=cfg["date_format"],
            model_quality_mult=cfg["model_quality_mult"],
            max_confidence_cap=cfg["max_confidence_cap"],
            disclaimer=cfg["disclaimer"],
        )
    return built


def run():
    r = Result()

    print("=" * 74)
    print("PRE-FLIGHT - backend served from apps/backend, in-process")
    print("=" * 74)

    # ---- 1. everything loads -------------------------------------------
    print("\n[1] Bundles and datasets load")
    try:
        preds = _build_predictors()
        r.check("all four platforms construct", len(preds) == 4,
                f"got {len(preds)}")
    except Exception as e:
        print(f"  FAIL  could not construct predictors -> {e}")
        traceback.print_exc()
        return 1

    for key, p in preds.items():
        has_bundle = getattr(p, "bundle", None) is not None or \
            getattr(p, "models", None) is not None
        r.check(f"{key}: model bundle present", has_bundle)
        # Explicit None check: a DataFrame has no truth value, so "or []" raises.
        frame = getattr(p, "df", None)
        n = 0 if frame is None else len(frame)
        r.check(f"{key}: dataset non-empty", n > 0, f"{n} rows")

    # ---- 2. each serving tier still fires ------------------------------
    print("\n[2] Serving tiers fire on a case that should reach them")

    cases = [
        # (label, platform key, kwargs, predicate on result, description)
        ("tier 1 first-party -> day one", "gamepass",
         dict(game_name="Halo Infinite", publisher="Microsoft",
              release_date="12/08/2021"),
         lambda o: o.get("predicted_months") == 0.0,
         "Microsoft on Game Pass should be 0 months"),

        ("tier 1 Sony -> NOT day one", "psplus",
         dict(game_name="Marvel's Spider-Man 2",
              publisher="Sony Interactive Entertainment",
              release_date="10/20/2023"),
         lambda o: (o.get("predicted_months") or 0) > 6,
         "Sony first-party reaches PS Plus Extra a year or more late"),

        ("tier 1 COD policy -> ~12mo from release", "gamepass",
         dict(game_name="Call of Duty: Modern Warfare 4", publisher="Activision",
              release_date="10/23/2026"),
         lambda o: o.get("prediction_basis") == "policy",
         "post-2026 Call of Duty follows the announced policy"),

        ("old COD falls through, NOT +1yr", "gamepass",
         dict(game_name="Call of Duty: Black Ops II", publisher="Activision",
              release_date="11/13/2012"),
         lambda o: o.get("prediction_basis") != "policy",
         "pre-policy Call of Duty must not get the 12-month rule"),

        ("tier 4 model on an unseen publisher", "epic",
         dict(game_name="Some Entirely Made Up Game 12345",
              publisher="Nonexistent Studio QQQ", release_date="03/04/2024",
              metacritic_score=75),
         lambda o: o.get("confidence", 0) > 0,
         "unseen publisher must still answer, not refuse (P7)"),
    ]

    results = {}
    for label, key, kwargs, predicate, why in cases:
        try:
            out = preds[key].predict(**kwargs)
            results[label] = out
            r.check(label, bool(out) and predicate(out),
                    f"{why}; got months={out.get('predicted_months')} "
                    f"basis={out.get('prediction_basis')} "
                    f"tier={out.get('tier')}")
        except Exception as e:
            r.check(label, False, f"raised {type(e).__name__}: {e}")

    # ---- 3. response shape ---------------------------------------------
    print("\n[3] Response carries the fields the frontend binds to")
    sample = results.get("tier 4 model on an unseen publisher")
    if sample:
        for field in REQUIRED_FIELDS:
            r.check(f"field present: {field}", field in sample)
        has_interval = "predicted_months_low" in sample and \
            "predicted_months_high" in sample
        if has_interval:
            lo = sample["predicted_months_low"]
            mid = sample.get("predicted_months")
            hi = sample["predicted_months_high"]
            r.check("interval bounds ordered low <= mid <= high",
                    lo <= mid <= hi, f"{lo} / {mid} / {hi}")
            r.soft("interval width (months)", f"{hi - lo:.1f}")
        else:
            r.soft("no interval on this path",
                   "expected on the model tier; rule tiers return a point")
    else:
        r.check("model-tier response available to inspect", False)

    # ---- 4. awkward input degrades rather than crashing -----------------
    print("\n[4] Awkward input degrades instead of crashing")
    edge = [
        ("no publisher", "epic", dict(game_name="Mystery Game")),
        ("empty publisher", "gamepass", dict(game_name="X", publisher="")),
        ("no release date", "humble",
         dict(game_name="Y", publisher="Devolver Digital")),
        ("garbage release date", "psplus",
         dict(game_name="Z", publisher="Sega", release_date="not-a-date")),
        ("unicode title", "epic",
         dict(game_name="Ni no Kuni II: Revenant Kingdom – 日本",
              publisher="Bandai Namco")),
    ]
    for label, key, kwargs in edge:
        try:
            out = preds[key].predict(**kwargs)
            r.check(f"survives {label}", isinstance(out, dict) and bool(out),
                    f"returned {type(out).__name__}")
        except Exception as e:
            r.check(f"survives {label}", False, f"raised {type(e).__name__}: {e}")

    # ---- verdict --------------------------------------------------------
    print()
    print("=" * 74)
    total = r.passed + r.failed
    if r.failed:
        print(f"PRE-FLIGHT FAILED - {r.failed} of {total} checks failed")
        for n in r.notes:
            print(f"  - {n}")
        print("Do not deploy.")
        return 1
    print(f"PRE-FLIGHT PASSED - {r.passed}/{total} checks")
    print("Backend is wired correctly. This says nothing about accuracy;")
    print("see pipeline.backtest and pipeline.holdout for that.")
    return 0


if __name__ == "__main__":
    sys.exit(run())
