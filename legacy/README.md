# legacy/

Superseded files moved out of the project root during the Phase 1 monorepo
consolidation (2026-06-01). Nothing here is referenced by the active pipeline
(deploy_models.py, enrich_and_merge.py, process_new_data.py, train_models.py),
the backend (apps/backend), or the frontend (apps/frontend). Kept for reference;
full pre-overhaul snapshots also exist as git bundles in
i:/Lyndon/AI ML/Project/_epicgamepass_archive/.

Contents:
- Old root-level data duplicates: Epic.csv, PS.csv, Xbox.csv (canonical copies
  live in Epic/, Xbox/).
- Old intermediates: masterlist_enriched0*.csv, epic_processed_data.csv,
  publisher_statistics.csv, Masterlist*.xlsx.
- Superseded model artifacts: epic_prediction_model.pkl, label_encoders.pkl.
- Source spreadsheets: PlayStation Plus Master List.xlsx, Xbox Gamepass Master
  List.xlsx, Free Games (Accounts).xlsx.
- Exploratory notebooks: Preprocess.ipynb, Preprocess2.ipynb, Tasks.ipynb,
  game-prediction-v8.ipynb (its automated form is train_models.py).
- Notes/docs: Deploy instructions.pdf, initialize commands.txt, the Antigravity
  prompt note.
- backup of final/ - an earlier ad-hoc backup of the canonical CSVs.

Safe to delete once you are confident you no longer need them.
