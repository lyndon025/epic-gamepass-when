# Epic Game Pass When?

AI-powered predictor for when a game will arrive free on a subscription/giveaway
service: Epic Games Store, Xbox Game Pass Ultimate, PlayStation Plus Extra, and
Humble Choice.

This repository is being consolidated into a single monorepo (training pipeline +
Flask backend + React frontend) driven by one command. See AGENTS.md for the
operating manual and docs/PLAN.md for the full plan and Decision Log.

## Status

Last updated: 2026-06-01

| Phase | Description | Status | Tag |
|---|---|---|---|
| 0 | Workflow bootstrap (AGENTS/PLAN/README) | Done | - |
| 1 | Monorepo consolidation + layout | Local done; hosting cutover pending (see docs/CUTOVER.md) | - |
| 2 | Unify config, fix Epic encoder bug, remove secrets/paths | Planned | - |
| 3 | Refactor pipeline into one package + entrypoint | Planned | - |
| 4 | Backtesting harness + naive baselines | Planned | - |
| 5 | Model upgrade: intervals + features + fallback | Planned | - |
| 6 | Frontend/backend wiring for new schema + CONTRACT | Planned | - |
| 7 | End-to-end automation (one command -> dev) + CI | Planned | - |

## Components (monorepo layout)

- apps/frontend/ - React/Vite + Vercel serverless /api + Supabase (was epicgamepasswhen).
- apps/backend/  - Flask + XGBoost inference API, Render/Fly (was epicgamepasswhen-backend).
- Training pipeline (root): process_new_data.py, enrich_and_merge.py,
  train_models.py, deploy_models.py + the Epic/ HB/ Xbox/ data and model folders.
  (These move into pipeline/ data/ models/ in Phase 3, alongside the path fixes.)
- docs/ - PLAN.md (plan + Decision Log), CUTOVER.md (Phase 1 hosting steps),
  CONFIDENCE.md.
- legacy/ - superseded files moved out of the root during consolidation.

## The intended workflow (target)

1. Drop new raw data into data/raw/.
2. Run one command (make update).
3. Pipeline ingests -> enriches -> trains -> backtests (quality gate) -> syncs to
   the backend -> commits -> pushes to dev. Dev deploy updates automatically.
4. Owner manually merges dev -> prod to go live in production.
