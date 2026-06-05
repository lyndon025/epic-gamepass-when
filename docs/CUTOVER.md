# Phase 1 cutover tutorial (dev-first, zero downtime)

Goal: move the live site onto the new monorepo layout without downtime, by first
standing up a fully isolated DEV environment (dev frontend + dedicated dev
backend), verifying it, then promoting to production on your command.

Decision: we use a DEDICATED dev backend service (Option B) - it proves the
monorepo backend actually boots from the new repo + root dir before production is
touched, and it becomes the safe place to test the Phase 2+ backend changes.

IMPORTANT ORDERING: the new folders (`apps/frontend`, `apps/backend`) only exist on
the `dev` branch AFTER we push the monorepo to it. Neither Vercel nor Render can
build from a folder that is not on the branch yet. So the push to `dev` happens
FIRST (Part 2), before the Render service is created. (If you try to point Render
at `apps/backend` before the push, you get "Root directory does not exist" - that
is expected until Part 2 is done.)

Current state: the restructure is committed LOCALLY on branch `phase-1-monorepo`.
Production is untouched and still on the old layout.

## Why this is safe (no downtime possible)
- Live deployments are immutable: changing a setting never rebuilds or alters a
  running deployment.
- Vercel and Render swap atomically and only after a new build passes health
  checks. A FAILED build is never promoted - prod just keeps serving the last
  good build.
- Production changes only when YOU merge `dev -> main`.
- Recovery net: full pre-overhaul bundles in
  `i:/Lyndon/AI ML/Project/_epicgamepass_archive/` (`git clone <bundle>`), and the
  old backend repo still exists on GitHub.

## How the app connects (so the wiring below makes sense)
The browser never calls the backend directly. It calls its own Vercel
deployment's `/api`, and a serverless function proxies to the Python backend:

```
Browser (frontend)
  -> https://<this-deployment>/api/predict          (same-origin serverless fn)
       [apps/frontend/api/predict.js]
         -> Supabase cache check
         -> on miss: fetch(`${BACKEND_API_URL}/api/predict`)   (server-to-server)
              -> Flask backend (Render)
```

Which backend a deployment uses is decided by the env var `BACKEND_API_URL`
(fallback `VITE_API_URL`) in that deployment's Vercel env SCOPE. Vercel scopes
vars into Production / Preview / Development. The `dev` branch deployment uses the
PREVIEW scope. So: Preview -> dev backend, Production -> prod backend. That split
is what isolates dev from prod.

Your stable URLs:
- Dev frontend: `https://epic-gamepass-when-git-dev-lyndon025s-projects.vercel.app`
- Prod frontend: `https://epic-gamepass-when.vercel.app`
- Prod backend: `https://epic-gamepass-when.onrender.com`
- Dev backend: you create it in Part 3 (you choose the name/URL).

---

## Part 1 - Set the Vercel root directory (do first; it is just a setting)

In the Vercel project for `lyndon025/epic-gamepass-when`:
- Settings -> Build and Deployment -> Root Directory = `apps/frontend`. Save.

This triggers no rebuild and does not touch the live prod deployment (it is
immutable). Doing it before the push means the dev preview build in Part 2 will
succeed from `apps/frontend` straight away.

---

## Part 2 - Push the monorepo to `dev`

This is what puts `apps/frontend` and `apps/backend` onto the `dev` branch. Tell me
and I will run it, or:
```
git checkout dev
git merge phase-1-monorepo
git push origin dev
```
Effects:
- Vercel builds a Preview from `dev` using root `apps/frontend` -> succeeds.
- `apps/backend` now exists on `dev`, so Part 3 can find it.
- Production (`main`) is untouched.

---

## Part 3 - Create the dev backend (Render)

Your existing prod Render service is connected to the OLD repo
(`lyndon025/epicgamepasswhen-backend`) and stays running, untouched. You ADD a
second, separate service for dev.

1. Render dashboard -> New + -> Web Service.
2. Connect repository: `lyndon025/epic-gamepass-when` (the monorepo).
3. Name: `epicgamepasswhen-backend-dev` (or your choice).
4. Branch: `dev`.
5. Root Directory: `apps/backend`   <- include the `apps/` prefix.
6. Runtime: Python 3.
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `gunicorn app:app`
7. Instance type: Free is fine. (Free services spin down when idle and cold-start
   in ~1 min; the UI shows a "Waking up server" message during that.)
8. Environment variables: NONE. The Flask backend only loads its local
   models/CSVs and reads `PORT` (Render sets `PORT` automatically).
9. Create and wait for the first deploy to turn green.
10. Copy the service URL, e.g. `https://epicgamepasswhen-backend-dev.onrender.com`.
11. Verify in a browser: open `<dev-backend-url>/api/health` -> JSON with model
    versions. That confirms the monorepo backend boots from the new layout.

---

## Part 4 - Point the dev frontend at the dev backend (Vercel env)

In the Vercel project -> Settings -> Environment Variables, add/confirm these for
the PREVIEW scope (tick the "Preview" box). Leave PRODUCTION values pointing at
the prod backend:
- `BACKEND_API_URL` = `<dev-backend-url from Part 3>`   (or use `VITE_API_URL`)
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`  (reuse the same Supabase
  project, or a separate one for full dev isolation)
- your `VITE_RAWG_API_KEY` variable(s) - mirror what Production has
- (optional) `CRON_SECRET`

Env vars take effect on the next deploy, so REDEPLOY the dev preview after saving:
Vercel -> Deployments -> the latest `dev` deployment -> ... -> Redeploy. (Or I push
again and it rebuilds.)

---

## Part 5 - Test the dev environment end to end

1. Open `https://epic-gamepass-when-git-dev-lyndon025s-projects.vercel.app`.
2. Test all four platforms (Epic, Xbox, PlayStation, Humble): search, select, run a
   prediction. First call may cold-start the dev backend (~1 min).
3. Pass criteria:
   - each prediction returns a real result (not an error card),
   - `<dev-backend-url>/api/health` is healthy,
   - leaderboard/cache work (or fail silently if Supabase not set in Preview).
   This proves: dev browser -> dev Vercel `/api` -> dev Render backend, isolated
   from production.

---

## Part 6 - Promote to production (manual, your decision)

Only after dev passes. None of this causes downtime (health-gated swaps).

1. Backend (prod): in your EXISTING prod Render service, change the connected repo
   to `lyndon025/epic-gamepass-when`, Branch `main`, Root Directory `apps/backend`.
   Render builds the new revision and swaps only when healthy.
   (Alternative: create a fresh prod service from the monorepo, then move the
   custom domain onto it once green.)
2. Frontend (prod):
   ```
   git checkout main
   git merge dev
   git push origin main
   ```
   Vercel builds Production from `main` (now has `apps/frontend`; root dir already
   set) and swaps in zero-downtime. Production-scope `BACKEND_API_URL` still points
   at the prod backend.
3. Verify prod: `https://epic-gamepass-when.vercel.app` loads and a prediction
   round-trips; `https://epic-gamepass-when.onrender.com/api/health` is healthy.

---

## Part 7 - Clean up

After prod is verified:
- Archive `lyndon025/epicgamepasswhen-backend` on GitHub (Settings -> Archive).
  Its history is preserved in the monorepo (subtree) and in the bundle backup.
- Keep the dev Render service - you will use it to test Phase 2+ backend changes.

---

## If something looks wrong (rollback)
- A bad dev build changes nothing in prod; fix on the branch and re-push `dev`.
- Prod stays on its last good deployment until you explicitly merge to `main`; a
  failed build is never promoted.
- Worst case, restore from `_epicgamepass_archive/*.bundle` (`git clone <bundle>`);
  the old prod backend (old repo) remains available until you archive it.

---

## Env var quick reference

| Variable | Runs in | Used by | Scope to set |
|---|---|---|---|
| BACKEND_API_URL (or VITE_API_URL) | Vercel serverless fn | predict proxy -> backend | Preview = dev backend URL; Production = prod backend URL |
| VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY | Vercel fn + client | cache, leaderboard | Preview + Production |
| VITE_RAWG_API_KEY (xN) | client | RAWG game search | Preview + Production |
| CRON_SECRET | Vercel cron fn | cache cleanup (optional) | Production (+ Preview to test) |
| PORT | Render | Flask bind | set automatically by Render |

The Flask backend itself needs no secrets - it only loads local models/CSVs.
