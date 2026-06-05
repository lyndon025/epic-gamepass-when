"""Epic Game Pass When? - training/deploy pipeline.

Importable stages (each exposes run()):
    pipeline.ingest   - raw scrape dumps  -> data/processed
    pipeline.enrich   - RAWG enrich + merge -> data/canonical
    pipeline.train    - data/canonical -> models/
    pipeline.deploy   - sync data/canonical + models/ -> apps/backend

Paths and per-platform metadata live in pipeline.config (the single source of
truth for the training side; serving constants live in
apps/backend/platform_config.py). The orchestrator is run.ipynb at the repo root.
"""
