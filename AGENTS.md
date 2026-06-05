========================================================================
AGENTS.md - Operating Manual for Epic Game Pass When?
========================================================================

Read this first, every session. If anything here conflicts with a casual chat
instruction, ask before deviating - these are the durable rules.

## 1. The objective (never lose this)

We are building "Epic Game Pass When?" - a web app that predicts WHEN a given
game will arrive free on a subscription/giveaway service (Epic Games Store,
Xbox Game Pass Ultimate, PlayStation Plus Extra, Humble Choice). The system has
three parts that must behave as ONE workflow: a model-training pipeline, a Flask
inference backend, and a React frontend. The owner updates raw data, runs one
command, and the new models + data flow automatically to backend and frontend
and deploy to the dev environment.

Prime directive: a data/model update must produce a CONSISTENT, VERIFIED release
or no release at all. Specifically, an agent must NEVER, without asking:
  - ship a retrained model whose companion encoder/stats are not regenerated
    from the SAME training run (the historic Epic bug - see D-005),
  - ship a model that fails its backtest quality gate (see D-002),
  - change the prediction output schema the frontend binds to without bumping
    docs/CONTRACT.md and updating the frontend in the same change,
  - push to the production branch / production deploy (prod is ALWAYS a manual
    merge by the owner),
  - commit secrets (RAWG API keys, Supabase keys) or machine-absolute paths.

## 2. Where the current state lives
- README.md            - status table: the quick "where are we". Updated every phase.
- docs/PLAN.md         - the full plan + the Decision Log (D-001, D-002, ...).
                         Source of truth for *why*. Has a Plan version that bumps
                         on every edit.
- docs/CONTRACT.md     - the prediction output schema the frontend/backend share.
                         Versioned; downstream binds to these exact field names.
- Git history          - source of truth for *what changed*. Commit messages cite
                         decision IDs.
Before acting, skim README (status) and the PLAN Decision Log (constraints).

## 3. Repository layout (current, monorepo - D-001)

  <root>/                    git repo root
    AGENTS.md
    README.md
    run.ipynb                orchestrator notebook (ingest->enrich->train->deploy->push)
    .gitignore
    docs/
      PLAN.md                plan + Decision Log
      CUTOVER.md             Phase 1 hosting cutover tutorial
      CONFIDENCE.md          confidence methodology
      CONTRACT.md            prediction output schema (versioned) - added in Phase 6
    pipeline/                the model pipeline (importable modules; logic lives here)
      config.py              training-side paths + platform metadata (no abs paths)
      ingest.py              raw dumps -> data/processed (was process_new_data.py)
      enrich.py              RAWG enrich + merge -> data/canonical (was enrich_and_merge.py)
      train.py               data/canonical -> models/ (was train_models.py)
      deploy.py              sync data/canonical + models/ -> apps/backend (was deploy_models.py)
      backtest.py            time-based validation + baselines (added in Phase 4)
    data/
      raw/                   NEW_* scrape dumps (tracked)
      processed/             *_Processed.csv intermediates
      canonical/             Epic.csv, Xbox.csv, PS.csv, HB.csv (source-of-truth data)
      backups/               timestamped backups (gitignored)
    models/                  xgb_*.pkl, publisher_encoder_*.pkl, publisher_statistics_*.csv (ONE location)
    apps/
      frontend/              React/Vite + Vercel serverless /api (was epicgamepasswhen)
      backend/               Flask inference API (was epicgamepasswhen-backend)
        platform_config.py   SINGLE source of truth for serving constants (D-004)
    legacy/                  superseded files (old notebooks, model versions, intermediates)

Layout rules:
  - Root stays clean: only run.ipynb, README, AGENTS, .gitignore, and the dirs above.
  - All pipeline logic lives in pipeline/ as importable modules; run.ipynb is a thin
    orchestrator that just calls them. A headless entrypoint (papermill/nbconvert or
    a Makefile) is deferred to Phase 7.
  - ONE copy of each model artifact (models/) and ONE canonical dataset
    (data/canonical/). The backend consumes these via the deploy/sync step; it does
    not keep an independently-edited copy.
  - Serving/confidence constants live ONLY in apps/backend/platform_config.py;
    training-side paths/metadata live ONLY in pipeline/config.py. They do not overlap.
  - Never commit secrets or machine-absolute paths. RAWG/Supabase keys come from env.
    Backups are gitignored; canonical CSVs and current model artifacts ARE tracked.

## 4. Git workflow (follow exactly)
- One branch per phase: phase-N-<short-name> (e.g. phase-4-backtest).
- Commit messages cite decision IDs, e.g. "phase-2: unify platform config (D-004)".
- Commit body ends with the Co-Authored-By trailer.
- After a phase passes its verification: push the branch, fast-forward the dev
  integration branch, tag v0.N-<short-name> (annotated), push dev + tag.
- The pipeline (pipeline/run.py) MAY auto-commit and auto-push to the dev branch
  on a successful, gated run (D-003). It must NEVER push to the production branch.
- Production goes live only when the owner manually merges dev -> main/prod.
- Only commit/push when a phase's work is complete and verified, or when the
  owner asks.

## 5. End-of-phase checklist (do all of these)
1. Update README.md - set the phase row to Done with its tag; bump "Last updated".
2. Update docs/PLAN.md - bump Plan version; append any new Decision Log rows
   (APPEND-ONLY: never edit past rows; supersede with a new dated row that
   references the old ID).
3. If an output schema / public field name / per-platform constant changed,
   update docs/CONTRACT.md (bump version + changelog) - the frontend and backend
   bind to those exact names/values.
4. Commit (citing decision IDs), push the branch, fast-forward dev, tag v0.N-...,
   push tag.
5. Tell the owner what shipped and what the next phase is.

When the owner makes a NEW DECISION mid-chat: immediately append a new row to the
PLAN Decision Log (next D-0NN), bump plan version, commit. Do not rely on chat
memory to carry decisions - write them down.

## 6. Locked decisions (snapshot - full text in docs/PLAN.md)
- D-001 Consolidate frontend + backend + pipeline into ONE monorepo.
- D-002 Full ML methodology upgrade: time-based backtesting + naive baselines +
        prediction intervals (quantile or AFT survival) + richer features +
        graceful unseen-publisher fallback. Ship is gated on the backtest.
- D-003 pipeline/run.py auto-commits and auto-pushes to dev; prod is manual.
- D-004 ONE source of truth for per-platform constants (pipeline/config.py);
        training and serving both read it. Kills the train/serve config drift.
- D-005 Fix the Epic encoder/stats deploy mismatch; standardize artifact naming
        and add a per-model metadata.json registry.
- D-006 No secrets or machine-absolute paths in code; use env + config.
- D-007 Adopt this agentic workflow (AGENTS.md + docs/PLAN.md Decision Log +
        phase branch/tag discipline).
The live Decision Log in docs/PLAN.md is the current truth; this is a snapshot.

## 7. Coding conventions
- Match the style already in the codebase (Python: stdlib + pandas/sklearn/xgboost;
  JS: ES modules, React 19 function components, Tailwind).
- Type hints on new Python functions where practical.
- No emojis in code, comments, commits, or docs (existing emoji print statements
  may be cleaned opportunistically, not as a dedicated task).
- One source of truth: never duplicate a constant across train and serve - import
  it from pipeline/config.py.
- Prefer reusing existing modules over re-implementing.
- Verify before claiming done: run the relevant stage/smoke check and report real
  numbers/output. If something failed, say so with the output.
- Secrets via environment variables only. Paths are config-driven, never the
  hardcoded i:\Lyndon\... absolute path.

## 8. Phase roadmap (authoritative status is in README.md)
| Phase | Description | Status |
|---|---|---|
| 0 | Workflow bootstrap (AGENTS/PLAN/README) | Done |
| 1 | Monorepo consolidation + layout + hosting reconfig | In progress (dev verified end-to-end; prod promotion pending) |
| 2 | Unify serving config + fix Epic encoder & float32 bugs | Done (dev-verified) |
| 3 | pipeline/ package + run.ipynb orchestrator + data reorg | Implemented (local-verified; pending dev) |
| 4 | Backtesting harness + naive baselines | Done (local) |
| 5 | Model upgrade: intervals + features + fallback | Planned |
| 6 | Frontend/backend wiring for new schema + CONTRACT | Planned |
| 7 | End-to-end automation (one command -> dev) + CI | Planned |
