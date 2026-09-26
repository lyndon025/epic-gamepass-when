Plan version: v3.3

Phase 1 progress (2026-06-01): monorepo created in place by reusing the frontend
repo (D-009) and relocating its .git to the project root; frontend moved to
apps/frontend (history preserved via rename detection); backend subtree-merged
into apps/backend (D-008); training workbench brought under version control; RAWG
key scrubbed to env (D-006). Base directory tidied: orphaned root files moved to
legacy/, CONFIDENCE_EXPLANATION.md moved to docs/CONFIDENCE.md. Pre-overhaul
bundles saved to _epicgamepass_archive/. Remaining for Phase 1: owner runs the
hosting cutover (docs/CUTOVER.md) and the dev push. All work is on branch
phase-1-monorepo; nothing pushed yet.

Phase 1 dev verification (2026-06-05): monorepo pushed to `dev` (origin/dev). Dev
backend stood up on Render via Docker (`apps/backend/Dockerfile`, python:3.11-slim
- avoids the Node auto-detect + numpy-wheel issue on the monorepo); `/api/health`
returns healthy with all four models. Vercel root dir set to `apps/frontend` and a
Preview-scope `BACKEND_API_URL` points the dev frontend at the dev backend. Verified
end-to-end on `epic-gamepass-when-git-dev-...vercel.app`: a real PS Plus prediction
(Marvel's Spider-Man, Sony first-party tier) rendered correctly. Remaining for
Phase 1: prod promotion (CUTOVER Part 6), at the owner's discretion.

August 2026 refresh (2026-08-24): all four datasets brought current after an
eight-month gap - Xbox 2280, PSPlus 2745, Epic 625, Humble 1237 rows (341 new
arrivals, 267 usable after training filters). Required an Epic parser rewrite
(the PC Gamer article changed layout and the old parser extracted zero rows)
and converting the two community sheets from xlsx. The pre-refresh v5 bundles
are frozen in models/frozen/v5_2026-06-10/ as the out-of-time holdout baseline
(D-016). The Call of Duty serving rule was corrected against Microsoft's April
2026 policy (D-015). Site v2.0 shipped backend warm-up, staged cold-start
messaging, and a refreshed About page. NOT yet done: retrain on the new data,
the holdout evaluation itself, and the deploy sync - apps/backend still holds
June data and June models, deliberately consistent with each other.

Two known data-quality defects are recorded but deliberately NOT fixed yet
(D-016): the Humble genre filter drops 4 real games while admitting 23
annotation fragments, and APPEND dedupes on name alone so repeat giveaways lose
every appearance but their first. Both alter historical training data, which
would contaminate the frozen-model comparison, so they are batched into the
retrain.

# Epic Game Pass When? - Overhaul Plan

## Goal

Turn three loosely-coupled pieces (an unversioned model-training workbench, a
Flask backend repo, and a React frontend repo) into ONE workflow: the owner
updates raw data, runs one command, and new models + data flow automatically to
backend and frontend and deploy to dev. Production stays a manual merge.

## Current system (as found, 2026-06-01)

Serving path: React (Vercel) -> its own /api/predict serverless proxy
(epicgamepasswhen/api/predict.js) -> Supabase cache check -> Flask backend
(epicgamepasswhen-backend, on Render/Fly) -> GameServicePredictor. Leaderboard
and cache live in Supabase; a Vercel cron cleans the cache daily. RAWG search
runs client-side with rotating keys.

Model pipeline (manual, run by hand in order):
  1. process_new_data.py  raw dumps -> *_Processed.csv
  2. enrich_and_merge.py  RAWG-fill publisher/score, merge to canonical CSVs
  3. train_models.py      per-platform XGBoost on log(days_to_service), save pkl
  4. deploy_models.py     copy CSVs + models into the backend folder
  5. manual git push of the backend repo -> Render redeploys; frontend separate.

Prediction logic (services/predictor.py) is a 4-tier cascade:
  Tier 1 first-party publisher rules (Microsoft/Sony hardcoded)
  Tier 2 platform compatibility check (is it on PC / Xbox / PlayStation)
  Tier 3 historical repeat lookup (game seen before -> interval-based estimate)
  Tier 4 XGBoost regression for new games (publisher-stats features)
Confidence is a hand-tuned heuristic (see CONFIDENCE_EXPLANATION.md), not a
calibrated probability.

## Problems identified (the "why" behind the phases)

P1 Config drift: per-platform constants (avg_repeat_interval, model_quality_mult,
   max_confidence_cap, repeat_confidence_mult) are duplicated in train_models.py
   AND app.py and DISAGREE; the train-side copy is dead (never used). -> D-004
P2 Epic deploy bug: backend Epic predictor reads publisher_statistics.csv /
   publisher_encoder.pkl (unsuffixed) but training+deploy write the *_epic
   suffixed versions, so the Epic encoder/stats never refresh on retrain and can
   desync from the model. -> D-005
P3 No backtesting: random 80/20 split on a time-to-event target leaks future into
   past; reported R2/MAE are optimistic; no baseline; confidence is uncalibrated. -> D-002
P4 Ships the weaker model: the saved model is fit only on 80% of data, never
   refit on the full set before saving. -> D-002 / Phase 5
P5 Secrets/paths in code: RAWG key hardcoded in enrich_and_merge.py; absolute
   i:\Lyndon\... paths in every script. -> D-006
P6 Fragmentation: three repos; the training code (most valuable IP) is not
   version-controlled at all. -> D-001
P7 Thin features + hard fail on unseen publisher (confidence 0). -> D-002 / Phase 5
P8 Brittle scrapers: ingest uses hardcoded column indices and fragile heuristics;
   no schema validation, so a bad scrape can silently poison training. -> Phase 3/4
P9 numpy.float32 from xgb_model.predict() passed to timedelta(days=...) raised
   TypeError, crashing the XGBoost new-game prediction path. Was masked because the
   stale Epic encoder (P2) rejected most publishers before they reached that code;
   fixing P2 surfaced it. -> D-010 (fixed in Phase 2)

## Phase roadmap

Phase 0 - Workflow bootstrap. AGENTS.md, docs/PLAN.md, README.md, Decision Log.
  Verify: files exist and are accurate. (In progress.)

Phase 1 - Monorepo consolidation. Decide history-preservation approach; init the
  root git repo; move frontend/backend/pipeline/data/models into the target
  layout; reconfigure Vercel (frontend subdir) and Render/Fly (backend subdir) to
  build from the monorepo dev branch; archive the old repos.
  Verify: clean checkout builds frontend and runs backend from subdirs; dev deploy
  green on both hosts.

Phase 2 - Unify config + fix bugs. Single source of truth for per-platform serving
  constants in apps/backend/platform_config.py (D-004); the Docker build context is
  apps/backend, so the config lives there, not at the repo root. app.py builds all
  predictors from it. Fix the Epic encoder/stats mismatch (P2/D-005) and the float32
  timedelta crash it surfaced (P9). Dead/divergent constants removed from
  train_models.py. (RAWG key already scrubbed in Phase 1; remaining absolute-path
  scrub deferred to Phase 3 with the pipeline reorg.)
  Status: DONE, dev-verified (2026-06-05). Local in-process Flask test passed;
  then verified on the dev environment - Epic prediction for Devolver Digital
  returned "XGBoost ML Prediction (New Game)" with a projected arrival and full
  publisher stats (13 games), no crash and no "unknown publisher". The exact path
  the Epic encoder fix repairs.

Phase 3 - Pipeline refactor. Fold the four root scripts into an importable
  pipeline/ package (config, ingest, enrich, train, deploy) orchestrated by
  run.ipynb (D-012). Reorganize data into data/{raw,processed,canonical,backups}
  and models/; remove absolute paths (D-006). Behavior-preserving (no methodology
  change yet). Schema validation on ingest (P8) deferred to Phase 4.
  Status (2026-06-05): implemented + verified locally - pipeline imports cleanly;
  train.run() reproduced all four models from data/canonical (Xbox MAE 1167d/R2
  0.44, PSPlus 1153d/0.15, Epic 518d/0.46, HB 321d/0.45 - weak, motivating Phase
  4/5); deploy.run() synced 16 files with zero diff to apps/backend; backend still
  loads and serves the Epic XGBoost path. Pending: dev verify.
  Verify: run.ipynb runs top-to-bottom; deploy leaves apps/backend in sync; dev
  backend serves after a push.

Phase 4 - Backtesting. DONE (local), 2026-06-05. pipeline/backtest.py does
  expanding-window walk-forward CV with train-only feature computation, vs two
  baselines (global-median, publisher-median), and reports the old random-split
  MAE for contrast. Wired into run.ipynb as stage 4 with a beats-baseline warning.
  FINDING (D-013): on honest walk-forward MAE the current XGBoost models do NOT
  beat the publisher-median baseline on any platform - Xbox 1796 vs 1702, PSPlus
  1554 vs 1492, Epic 1053 vs 973 (global), Humble 505 vs 488 (global). The old
  random-split MAE was ~2x optimistic (e.g. Xbox 1167 vs 1796). The quality gate
  is advisory for now (the live model fails it) and becomes the Phase 5 bar.
  Verify: backtest report produced for all four platforms with real numbers (done).

Phase 5 - Model upgrade. DONE (local), 2026-06-05. Richer features chosen over
  AFT survival (owner pick): smoothed target-encoded publisher + release
  seasonality. XGBoost quantile regression (P10/P50/P90) for honest intervals;
  trains on all data; unseen-publisher fallback to the global prior. Bundle
  artifact format (model_<key>.pkl); backend predictor + platform_config + deploy
  rewired; backtest aligned to v2; old artifacts removed. Fallback policy
  (D-002 question): the backtest decides per platform - currently the model wins
  on all 4, so the model serves everywhere; the publisher-median baseline stays
  the safety net the gate would fall back to. Genre/tags/#platforms (need RAWG
  re-enrichment) deferred - target-encoding + seasonality already clear the bar.
  Verified locally: backend serves intervals on the XGBoost path, unseen publisher
  falls back (no more confidence 0), first-party/repeat tiers intact, backtest gate
  passes on all platforms. Pending: dev verify (eyeball intervals in the UI is Phase 6).

Phase 6 - Frontend/backend wiring. Surface intervals in the API + UI; freeze the
  output schema in docs/CONTRACT.md (versioned).
  Verify: end-to-end prediction shows an interval in the UI; contract documented.

Phase 7 - End-to-end automation. pipeline/run.py runs ingest->enrich->train->
  backtest(gate)->deploy->commit->push dev. CI on the monorepo. Prod stays manual.
  Verify: a single command takes a new raw dump all the way to a live dev deploy.

## Decision Log (APPEND-ONLY)

| ID | Date | Decision | Rationale | Supersedes |
|---|---|---|---|---|
| D-001 | 2026-06-01 | Consolidate frontend + backend + training pipeline into ONE monorepo at the project root. | "One workflow" requires a single source of truth; three repos (one unversioned) make a single update impossible. Chosen over keeping 3 repos with cross-pushing. | - |
| D-002 | 2026-06-01 | Full ML methodology upgrade: time-based backtesting + naive baselines + prediction intervals (quantile or AFT survival) + richer features + graceful unseen-publisher fallback; ship is gated on the backtest. | Current random split leaks future into past and the confidence number is uncalibrated; intervals + backtesting make predictions honest and trustworthy before the next data update. | - |
| D-003 | 2026-06-01 | pipeline/run.py auto-commits and auto-pushes to the dev branch on a gated, successful run; production is always a manual merge by the owner. | Owner wants data updates to reach dev with no manual steps, while retaining a human gate before production. | - |
| D-004 | 2026-06-01 | ONE source of truth for per-platform constants in pipeline/config.py; training and serving both import it. | P1: constants are duplicated across train_models.py and app.py and disagree; the train-side copy is dead code. | - |
| D-005 | 2026-06-01 | Standardize model-artifact naming and add a per-model metadata.json registry; fix the Epic encoder/stats deploy mismatch. | P2: backend reads unsuffixed Epic encoder/stats that training/deploy never refresh, risking silent model/encoder desync. | - |
| D-006 | 2026-06-01 | No secrets or machine-absolute paths in code; RAWG/Supabase keys via env, paths via config. | P5: RAWG key and absolute i:\Lyndon\... paths are committed in the scripts; not portable and a secret leak. | - |
| D-007 | 2026-06-01 | Adopt the durable agentic workflow (AGENTS.md + this Decision Log + phase branch/tag discipline). | Objective and conventions must survive context loss; nothing important should live only in chat. | - |
| D-008 | 2026-06-01 | Preserve full git history when consolidating: subtree-merge the backend (and relocate the frontend) so commit history survives in the monorepo. | Owner wants git log continuity, not a clean-slate start. | - |
| D-009 | 2026-06-01 | Reuse the existing frontend repo (lyndon025/epic-gamepass-when) as the monorepo root; backend is subtree-merged into apps/backend; old backend repo becomes an archive. | Keeps the existing Vercel link to that repo; one repo to rule them all. | - |
| D-010 | 2026-06-05 | Per-platform serving constants live only in apps/backend/platform_config.py; app.py builds predictors from it; Epic uses the matched *_epic artifacts; cast model day-counts to native float before timedelta(). | Phase 2: implements D-004 (one source of truth, kills train/serve drift), D-005 (Epic encoder/stats now match the model), and fixes P9 (float32 timedelta crash on the XGBoost path). | partially implements D-004, D-005 |
| D-011 | 2026-06-05 | Dev-first delivery: Phases 2-5 are built and verified on the dev environment and promoted to prod together at the end (CUTOVER Part 6), rather than promoting each phase. Per-phase main fast-forward + version tags are batched at that single prod promotion. | The dev environment exists to validate the improvements before they reach prod; promoting per-phase would lose the "prod = last known-good" separation and add churn. Deviates from the per-phase tag step in AGENTS section 4. | refines AGENTS section 4/5 |
| D-012 | 2026-06-05 | The pipeline is an importable pipeline/ package (config, ingest, enrich, train, deploy) orchestrated by a Jupyter notebook (run.ipynb), not a Makefile/run.py. Data reorganized into data/{raw,processed,canonical,backups} and models/; absolute paths removed. | Phase 3 (D-001, D-006): owner prefers a notebook orchestrator (matches how the project has been run); logic stays in modules so it remains testable. Headless entrypoint (papermill/nbconvert) deferred to Phase 7. | implements D-001, D-006 |
| D-013 | 2026-06-05 | Adopt time-based walk-forward backtesting (pipeline/backtest.py) as the accuracy source of truth; the bar for shipping an ML model is beating the publisher-median baseline. Today no platform's XGBoost model clears that bar, and the old random-split MAE was ~2x optimistic. | Phase 4 (P3): a time-to-event target needs temporal validation; the random split leaked the future. This sets a concrete, honest target for the Phase 5 model upgrade and prevents shipping a model that is worse than a trivial baseline. | resolves P3 |
| D-014 | 2026-06-05 | Phase 5 shipping model: per-platform XGBoost QUANTILE bundle (P10/P50/P90) on v2 features (smoothed target-encoded publisher + release-date seasonality + pub stats + metacritic), saved as one models/model_<key>.pkl. Trains on ALL data (fixes P4). Unseen publishers fall back to the global prior with reduced confidence + wide interval instead of "unknown" (fixes P7). Backend returns prediction intervals (predicted_months_low/high, projected_arrival_low/high). Old per-artifact files (xgb_*, encoder_*, stats_*) retired. | Clears the D-013 bar - beats the publisher-median baseline on all 4 platforms in walk-forward backtest (Xbox 947 vs 1702, PSPlus 1201 vs 1492, Epic 655 vs 973, Humble 427 vs 488) and gives honest ranges instead of a point + heuristic confidence. (D-002) | supersedes D-005 artifact naming; resolves P4, P7 |
| D-015 | 2026-08-24 | Call of Duty is predicted from Microsoft's announced April 2026 Game Pass policy: matched on TITLE (the policy covers the franchise, not the publisher), gated to releases on or after 2026-04-01, and answered as release + ~12 months. The blanket Activision-Blizzard 3-month rule is removed; their other titles go to the model. | The blanket rule encoded a 2023 acquisition assumption that reality did not follow, and returned a confident 3 months (conf 85) for every match. The data cannot answer this instead: the only two Call of Duty examples in it (Black Ops 6, Black Ops 7) are day-one arrivals under the OLD policy, and no post-policy example exists until Modern Warfare 4 lands around late 2027 - so deleting the rule outright would make the model predict fast arrivals from two obsolete rows. The date gate is load-bearing because tier 1 runs BEFORE the historical lookup: an ungated rule would push a 2012 title a year into the future and override its real history. | supersedes the Activision part of D-010 |
| D-016 | 2026-08-24 | Post-refresh accuracy is measured by an OUT-OF-TIME HOLDOUT against the frozen bundles in models/frozen/v5_2026-06-10/, evaluated from a frozen decision point (fix a date, predict what was then pending, check what happened) with still-pending games treated as right-censored rather than discarded. Interval coverage - how often truth lands inside P10-P90 - is reported alongside MAE. The two known data-quality defects are deferred to the retrain. | The walk-forward backtest (D-013) simulates the past; this is the first test against data that did not exist when the model was built, so no leakage is possible. Filtering test rows by "arrived during the window" would condition the sample on having arrived, excluding every slow arrival still pending and flattering the score - hence the frozen decision point. Coverage is preferred over MAE on the thin platforms because it is a falsifiable claim that stays stable at ~50-90 rows. The defects are deferred because fixing them changes historical extraction, which would contaminate the comparison against a model trained on the old extraction. | extends D-013 |
| D-017 | 2026-08-24 | Predictions are stored as ABSOLUTE dates (p10/p50/p90) plus computed_at, data_through and model_version, in a table SEPARATE from the 24h `cache`; relative months are derived at render. Precompute covers every canonical title plus top leaderboard demand, with RAWG most-added as optional top-up. An append-only prediction log provides prospective validation once the holdout is spent. No re-platforming of the backend. | Relative months decay daily, which is the actual reason the current cache needs a 24h TTL; absolute dates do not rot, so the TTL becomes "until the next model refresh". The separate table is required because the existing cron deletes everything in `cache` older than a day. data_through is stamped separately from computed_at because it is what actually bounds the model's knowledge - a fresh prediction from a stale model looks current otherwise. Prospective validation, not A/B testing: the outcome takes 1-3 years to observe and there is no user preference to optimise. Re-platforming to Vercel or Cloudflare is rejected because the Python ML stack fits serverless badly and the precompute makes the question moot - the backend becomes a rarely-hit fallback. | - |
| D-018 | 2026-08-24 | The shipping model stays the CONFORMAL-CALIBRATED QUANTILE bundle. Two alternatives were built and measured against the out-of-time holdout and both lost: censored AFT survival regression, and a measured bias shift applied to the quantile median. Neither is adopted. | AFT fixes the early bias (Xbox median signed error -482d -> -52d), confirming the bias is a mis-specified target rather than a tuning fault, but it degrades ranking (concordance 0.81 -> 0.73 Xbox, 0.87 -> 0.74 PSPlus) and collapses where censoring dominates - Epic at 88% censored and Humble at 76% produced median errors of 267 and 128 months with bias overshooting to +8135 and +3905 days. The bias shift improved bias (-334d -> +110d) but WIDENED bands (79mo -> 109mo) and destabilised coverage per platform (Epic 80% -> 65%), because the bias itself drifts and a stale estimate overshoots. Note the evaluation handicaps any unbiased model: the test set contains only games that arrived, so it shares the survivorship bias being corrected for - hence concordance and median error rather than MAE. | supersedes nothing; closes the D-016 investigation |
| D-019 | 2026-08-24 | Fixing the early bias requires RAWG platform enrichment (to drop genuinely ineligible censored candidates) or adaptive correction driven by the live prediction log. No further bias fix is attempted against the 261-row holdout, which has now scored four configurations and is treated as spent. | Publisher keywords cannot express platform availability, so ineligible games enter the censored set as noise and bias it late - that is the main obstacle to AFT working, and only platform data fixes it. Drift is what defeated both cheap corrections, and adaptive conformal from logged outcomes is the standard answer to drift. Continuing to select models against the same holdout rows converts a test set into a training set through analyst choices. | extends D-017 |
| D-020 | 2026-09-25 | A passed estimate no longer means "any time now". The answer is chosen from a measured table of how often games of that age, not yet on that service, arrive within a year (pipeline/hazard.py, regenerated by deploy): 8%+ is `window`, 3-8% `fading`, under 3% `unlikely-soon`. The repeat tier stops assuming a return is due: catalogue games on the service now answer `available`, and games that appeared before answer `unlikely` unless they have returned before and are still inside their own rhythm. | The old logic clamped "interval minus time since" to zero, so a game given away six years ago read "any time now". The data says the opposite: 7 of 621 Epic giveaways (1%), 158 of 2,115 Game Pass titles (7%) and 312 of 2,397 PS Plus titles (13%) have ever come back, and an 8-year-old game not yet on Epic has about a 1% yearly chance. 751 Game Pass and 981 PS Plus games were on the service while the site predicted when they would arrive, because removal dates were never read. The thresholds are applied to measured rates rather than chosen as a waiting-time cutoff, so the decay is whatever each service actually shows - Humble falls off a cliff after four years, PS Plus keeps picking up old games at 4-5% a year. | refines D-017 |
| D-021 | 2026-09-25 | Data is refreshed QUARTERLY, and the site states when it was collected and when the next update is due. The Game Pass and PS Plus sheets are downloaded automatically by pipeline.fetch (both are public Google Sheets; the PS Plus link is taken from the Game Pass sheet itself), which also refuses to ingest if the sheet's column layout has shifted. Catalogue membership is stated only as far as the data proves it: "as of our last update" when no removal date exists, "leaving <date>" when one is announced, "joining <date>" for announced arrivals. | Owner decision on cadence. Stating membership as "on the service now" was a prediction dressed as a fact - a blank removal date only proves the game was there on the day the sheet was read. Automating the two sheet downloads removes the manual export from every quarterly refresh; Epic and Humble have no equivalent source and are still assembled by hand. The date written by fetch, not the newest arrival in the data, is what "last update" means, and deploy publishes it to both backend and frontend so no date is hardcoded in the UI. | refines D-020 |
| D-022 | 2026-09-25 | Production backend is a new Render service, `epicgamepasswhen-backend-prod` (Docker, this monorepo, branch `main`, root `apps/backend`), and Vercel's Production-scope `BACKEND_API_URL` points at it. The previous prod service, `epicgamepasswhen-backend` (native Python, built from the pre-monorepo backend repo), is retired once production has run cleanly for a day. Promotion order: new backend healthy first, then the Production env var, then the fast-forward of `main`, so the new site and new backend go live in one step. | The old service could not simply be repointed: it is a native Python runtime, and the monorepo backend builds as Docker, which Render fixes at service creation - the same reason the dev service was created fresh in Phase 1. Its address was also recorded wrongly in CUTOVER.md (`epic-gamepass-when.onrender.com`, which serves nothing); the live address was found in the production bundle. Ordering the switch so both halves change together keeps production consistent throughout, per the prime directive. | completes D-011 (prod promotion) |
| D-023 | 2026-09-25 | The forecast is trained and gated on ORGANIC arrivals only: arrivals more than 60 days after release (`LAUNCH_WINDOW_DAYS`). Release year enters the model clamped to four years before the newest arrival in the training data (`REL_YEAR_LOOKBACK`); the cap and the cutoff are stored in the bundle and applied at serve time from there. Model answers now list the publisher's own earlier arrivals on that service (`precedents`). Only a real Metacritic score is sent to the model. | Launch deals are agreed before release and answered from the catalogue ("joining <date>"), yet they were over half of recent Game Pass arrivals, so the model learned that any recent release arrives within weeks - GTA VI came out as January 2027 on Game Pass. Excluding them improves every service on its own: walk-forward MAE and held-out accuracy both get better. The release-year clamp answers a separate problem that no test on arrived games can measure: a game released last year can only be in the data if it already arrived, so recent years show only short waits. It costs a little on the holdout (1-year hit rate: Game Pass 5 to 4 in 10, PS Plus 5 to 4, Epic 5 to 3) and moves big new releases to plausible waits (GTA VI on Game Pass about 17 months after release rather than 12, PS Plus about 29 rather than 15). Owner chose plausibility on unreleased marquee games over the holdout gain; the track record shown on the site is re-measured on this configuration rather than carried over. Precedents let a reader check the estimate against the games it learned from. The frontend was converting a RAWG player rating (0-5) into a Metacritic score, or defaulting to 75; those are a different scale and population. The PS Plus row for Grounded: Fully Yoked Edition credited it to Rockstar Games, which surfaced as a Rockstar precedent; corrected to Xbox Game Studios / Obsidian. Gate: all four pass (walk-forward MAE vs best baseline: Game Pass 1013 vs 1729, PS Plus 912 vs 1145, Epic 774 vs 991, Humble 459 vs 520). | refines D-002 |
| D-024 | 2026-09-26 | Game popularity (RAWG `added`) is collected for every catalogue game by pipeline/popularity.py and shown on the site as a HYPE meter - the game's percentile among catalogue games released the same year (+-1 year pooled) - next to separate CRITICS (Metacritic) and PLAYERS (RAWG rating) meters. It is display-only; the forecast does not use it. Matching is graded (high / medium / low / not_a_game): cleaned titles, top five results scored on name and release year, sequels never match predecessors, inexact matches to zero-follower entries rejected. Only high and medium are used (92% of games). | Owner asked whether hype and rating could push big releases later. Tested under the walk-forward gate on full data, hype as a feature moved MAE -15 (Game Pass), -5 (PS Plus), +30 (Epic), -7 (Humble) days - no consistent gain - and its Game Pass effect ran in the direction a leak would produce: counts are measured today, after arrival, and an arrival brings players. Per D-002 a feature ships only on a consistent gate gain, so it informs the reader instead of the model. Top-hit-only matching was about 80% reliable (wrong games, in-game item drops, itch.io namesakes); a spot check of the graded matcher found 23 of 25 inexact accepted matches correct and exact matches all correct, and both miss patterns found (sequel, zero-follower namesake) now have a rule. Raw counts are ranked within year because they mostly encode age (GTA V 22,730 vs a 2025 AAA release at 391). | refines D-002 |
| D-025 | 2026-09-26 | The Hype / Critics / Players meters are removed; the game card returns to plain Publisher, Metacritic, Player rating and Release lines. pipeline/popularity.py and data/canonical/rawg_popularity.csv are kept as a data asset but nothing on the site reads them, deploy no longer publishes a reference table, and the quarterly notebook no longer runs the lookup. | Owner decision: the plain card is enough. Since the meters never influenced the forecast (D-024), removing them changes no prediction. The graded matches stay because they can flag canonical rows whose release date came from a wrong RAWG match. | supersedes D-024 (display) |
| D-026 | 2026-09-26 | Production promoted to dev at `a90add7`: share-as-image, organic training with the release-year clamp and publisher precedents (D-023), the real-Metacritic-only fix, and the plain game card (D-025). CONTRACT v1.3. The production Render service `epicgamepasswhen-backend-prod` now tracks branch `main`. | It had been created tracking `dev`, so from 2026-09-25 every dev push also redeployed the production backend - D-023's model was serving production before this promotion (additive fields only, so nothing broke). Production must follow `main` only, per the prime directive; the owner switched the branch before this fast-forward, and the switch was verified by the production backend answering with the pre-D-023 model. | completes D-022 |
| D-027 | 2026-09-26 | Every prediction has its own address, `/p/<service>/<rawg-slug>` (services: epic, gamepass, psplus, humble). Opening one loads the game from RAWG by slug (following RAWG's rename redirects) and predicts it; the address bar is rewritten to it after every prediction. The share image carries a QR code in its bottom-right corner that opens that page, and the share dialog adds Copy link. Games entered by hand have no slug and link to the site root. The Epic and Humble "unlikely to return" wording now says a game was given away and how many giveaways were ever repeated, rather than borrowing the catalogue phrasing. | Owner request: a scanned or clicked share should land on the answer, not an empty search box. Predictions from a link go through the same cached proxy as a search, so they add no backend load beyond a normal visit. The QR uses whole 4px modules (a 148px square) and was decoded from a headless render at full and half size. No output schema change. | refines the share feature |
| D-028 | 2026-09-26 | Production promoted with D-027: prediction pages, the QR code on the share image, Copy link, and the giveaway wording for Epic and Humble. | Owner approved after dev verification (headless render of a linked prediction, a broken link, and QR decoding at full and half size; pre-flight 32/32). | completes D-027 |
| D-029 | 2026-09-26 | The home page and the shared nav take the "Console home, today's order" design (mock 17 of the redesign round): a dark page with the chosen game's art blurred behind it, service tiles that fill with the selected service's colour, the search as the largest tile, the game card, then Prediction Results as ONE card with its sections as outlined panels. Share appears twice: a round icon button in the results header and a full-width white button on the answer panel. The whole page recolours to the selected service (Epic uses an off-white accent, since its brand black vanishes on dark). Styles live in apps/frontend/src/styles/console.css, every class prefixed cx- so none collide with Tailwind utilities; About, Statistics and Donate keep their existing content under the new nav and background. Behaviour is unchanged: prediction links, the share image and QR, precedents, track record and data date all work as before. | Owner found the previous look "vibe coded" (purple-pink gradients, glass cards, emoji, everything centred) and picked this design after three mock rounds; the owner asked for the results in one card and for search and share to be impossible to miss. Checked in a real browser at 1280px and 390px: a dated forecast, an Epic "unlikely to return" answer and a catalogue "on the service now" answer. | owner decision |
| D-030 | 2026-09-26 | Precomputed answers are live. pipeline.rawg_details fetches, for every catalogue game RAWG can be matched to, the same details endpoint the site uses; pipeline.precompute runs each game through the backend's own /api/predict route (Flask test client) for all four services and writes the answers, with the inputs they came from, to apps/frontend/api/_precomputed/ in 16 shards per service. The Vercel /api/predict function serves a stored answer only when the request's slug, name, publisher, Metacritic, release date and platforms match exactly, and only within 120 days of generation; otherwise it falls through to the Supabase cache and then the backend. meta.json carries a hash of every backend file that shapes an answer, and pre-flight fails if it no longer matches. The site now sends the RAWG slug with each request. | Owner is satisfied with the model and wants the backend to stop being load-bearing: the Render service sleeps when idle and the first request after a quiet spell waited up to a minute. Serving through the real route, with an exact-input match, means a stored answer cannot differ from a live one; the hash check means a retrain or a code change cannot ship with the previous answers. Games outside the catalogue, manual entries and games whose RAWG details changed since the fetch are still answered live. | supersedes the precompute-deferred note |
| D-031 | 2026-09-27 | The backend reports a build fingerprint (`backend_version`, apps/backend/backend_version.py) with every answer and on /api/health; pipeline.precompute stamps the same value on the stored answers. The proxy keys saved answers by that build and saves a live answer only when its `backend_version` matches, and Technical details show where an answer came from. The share image's background art is a blurred colour wash instead of a second, differently cropped copy of the art. | A share image showed the pre-D-029 wording under the v1.4 cache key: the site redeploys in seconds and the Render backend in minutes, so a request in between got the old build's answer and saved it for a day under the new key. Keying and gating on the build closes that window for every future push, and removes the need to bump CACHE_VERSION by hand when only the backend changes. The fingerprint normalises line endings so a Windows checkout and the deployed Linux copy agree (verified on LF and CRLF copies). The owner also reported the share image showing the same people twice. | refines D-030 |
| D-032 | 2026-09-27 | Repeats are restored and answered with measured odds. (1) Epic: pipeline.epic_history merges the complete Epic promotion record (open-source Epic Free Games Scraper, GPL-3.0; promotion names and dates only) into Epic.csv, matching on the giveaway week and title, skipping in-game item offers and games inside a collection recorded as one row, and collapsing the same giveaway recorded twice; idempotent. 711 giveaways, 74 games given more than once (was 643 and 10). (2) Game Pass: ingest reads earlier runs from the sheet's Owner Notes ("Returning title: Joined 8/13/21, left 8/31/22"), 59 runs recovered; fetch now guards that column. (3) Training keeps each game's first arrival only. (4) A game that appeared before is answered with the measured chance of a return within a year by years since its last run (from the giveaway, or from leaving a catalogue): `may-return` at 3% or more, `unlikely` below; a dated repeat needs three or more regular runs. Humble's never-repeats rule is removed. | Owner reported Control and Subnautica, and Persona on Game Pass, reading "Unlikely to return" with "only 9 of 629 games" when Control had been given away three times. The June 2026 consolidation had kept one row per Epic game (legacy/Epic.csv had 71 repeated titles, the canonical file none), and the Game Pass sheet stores past runs only in its notes, which ingest never read. Measured: 12% of Epic games, 10% of Game Pass and 13% of PS Plus titles have appeared more than once; about 4-5 in 100 return within a year in the first three years, fading after; a prior return does not measurably raise the odds, so the old rhythm rule (which gave Control "within 6 months") was too confident. Repeat rows had also been reaching training as five-year waits. Gate passes on all four (walk-forward MAE vs best baseline: Game Pass 1024 vs 1708, PS Plus 915 vs 1143, Epic 769 vs 982, Humble 459 vs 520); track record re-measured on first arrivals. | supersedes D-020's repeat logic |
