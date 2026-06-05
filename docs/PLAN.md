Plan version: v1.4

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
  Status (2026-06-05): implemented + verified locally in-process (Flask test client:
  all 4 platforms load, Epic XGBoost path returns predictions, repeat path intact).
  Pending: verify on the dev environment.
  Verify: backend boots config-driven; Epic prediction uses the *_epic encoder;
  XGBoost new-game path returns projected_arrival without crashing.

Phase 3 - Pipeline refactor. Fold the four root scripts into pipeline/ as
  importable modules with one orchestrator (pipeline/run.py) and a Makefile.
  Add schema validation on ingest. No methodology change yet (behavior-preserving).
  Verify: `make update` reproduces today's canonical CSVs and models bit-for-bit
  (or with explained diffs).

Phase 4 - Backtesting. Time-based holdout + walk-forward CV; naive baselines
  (publisher-median, global-median); report MAE-in-days vs baseline per platform.
  Add a quality gate: a model that does not beat baseline does not ship.
  Verify: backtest report produced for all four platforms with real numbers.

Phase 5 - Model upgrade. Prediction intervals (XGBoost quantile P10/P50/P90 or
  survival:aft); refit on full data after validation; richer features (game age,
  genre/tags, #platforms, sequel flag, season; smoothed target encoding for
  publisher); graceful unseen-publisher fallback to a global/genre prior.
  Verify: intervals are calibrated on the holdout; unseen publisher no longer
  returns confidence 0.

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
