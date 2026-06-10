Plan version: v1.8

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
