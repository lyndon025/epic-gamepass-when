# Epic Game Pass When?

AI-powered predictor for when a game will arrive free on a subscription/giveaway
service: Epic Games Store, Xbox Game Pass Ultimate, PlayStation Plus Extra, and
Humble Choice.

This repository is being consolidated into a single monorepo (training pipeline +
Flask backend + React frontend) driven by one command. See AGENTS.md for the
operating manual and docs/PLAN.md for the full plan and Decision Log.

## Status

Last updated: 2026-08-24

| Phase | Description | Status | Tag |
|---|---|---|---|
| 0 | Workflow bootstrap (AGENTS/PLAN/README) | Done | - |
| 1 | Monorepo consolidation + layout | Dev verified end-to-end; prod promotion pending (CUTOVER Part 6) | - |
| 2 | Unify serving config + fix Epic encoder & float32 bugs | Done (dev-verified) | - |
| 3 | pipeline/ package + run.ipynb orchestrator + data reorg | Implemented; verified locally; pending dev verify | - |
| 4 | Backtesting harness + naive baselines | Done - models don't beat baseline yet (Phase 5 target) | - |
| 5 | Model upgrade: intervals + features + fallback | Done - calibrated, gate passes on all 4, out-of-time holdout run | - |
| 6 | Frontend/backend wiring for new schema + CONTRACT | Done - ranges displayed with tiered precision, basis line replaces confidence, CONTRACT.md v1.0 | - |
| 7 | End-to-end automation (one command -> dev) + CI | Planned | - |

## Components (monorepo layout)

- apps/frontend/ - React/Vite + Vercel serverless /api + Supabase (was epicgamepasswhen).
- apps/backend/  - Flask + XGBoost inference API, Render/Fly (was epicgamepasswhen-backend).
- pipeline/ - the model pipeline as importable modules (config, ingest, enrich,
  train, deploy). Data lives in data/{raw,processed,canonical,backups}; trained
  artifacts in models/. Orchestrated by run.ipynb at the repo root.
- docs/ - PLAN.md (plan + Decision Log), CUTOVER.md (Phase 1 hosting steps),
  CONFIDENCE.md, CONTRACT.md (prediction output schema),
  DATA_AND_MODEL.html (technical data/model reference),
  HOW_IT_WORKS.html (the same in plain language).
- legacy/ - superseded files moved out of the root during consolidation.

## The intended workflow (target)

1. Drop new raw data into data/raw/.
2. Run one command (make update).
3. Pipeline ingests -> enriches -> trains -> backtests (quality gate) -> syncs to
   the backend -> commits -> pushes to dev. Dev deploy updates automatically.
4. Owner manually merges dev -> prod to go live in production.
