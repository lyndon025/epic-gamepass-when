# Phase 1 cutover - step-by-step (frontend + backend, dev-first, zero downtime)

The monorepo restructure is done LOCALLY on branch `phase-1-monorepo`. Nothing has
been pushed, so production is untouched and still building from the old layout.
This guide stands up an isolated DEV environment (dev frontend talking to a dev
backend), lets you verify it, then promotes to prod on your command.

Why this is safe:
- Existing deployments are immutable - changing a setting never rebuilds or
  alters a live deployment.
- Vercel and Render do atomic, health-gated deploys; a FAILED build is never
  promoted, so a bad build cannot cause downtime (prod just keeps serving the
  last good build).
- Production only changes when YOU merge `dev -> main`.
- Recovery net: pre-overhaul bundles in `i:/Lyndon/AI ML/Project/_epicgamepass_archive/`
  (`git clone <bundle>`), and the old backend repo still exists on GitHub.

---

## How the app connects (read first)

The browser never calls the backend directly. It calls the Vercel deployment's own
`/api`, and a Vercel serverless function proxies to the Python backend:

```
Browser (frontend)
  -> https://<this-vercel-deployment>/api/predict        (same-origin serverless fn)
       [apps/frontend/api/predict.js]
         -> Supabase cache check
         -> on miss: fetch(`${BACKEND_API_URL}/api/predict`)   (server-to-server)
              -> Flask backend (Render)
```

The backend a given deployment talks to is decided at runtime by the env var
`BACKEND_API_URL` (fallback `VITE_API_URL`) in that deployment's Vercel env scope.
Vercel scopes env vars into Production / Preview / Development. The dev-branch
deployment uses the PREVIEW scope - so we point Preview at the dev backend and
leave Production pointing at the prod backend. That is what isolates dev from prod.

Note: predictions go through the same-origin Vercel proxy, so there is no browser
CORS concern for them.

Your stable URLs:
- Dev frontend (preview of `dev` branch):
  `https://epic-gamepass-when-git-dev-lyndon025s-projects.vercel.app`
- Prod frontend: `https://epic-gamepass-when.vercel.app`
- Prod backend: `https://epic-gamepass-when.onrender.com`
- Dev backend: created in Part 1 below (you choose the name).

---

## Part 1 - Stand up a DEV backend on Render

The existing (prod) Render service is connected to the OLD repo
(`lyndon025/epicgamepasswhen-backend`) and keeps running untouched. We add a
SEPARATE dev service from the monorepo.

1. Render dashboard -> New + -> Web Service.
2. Connect repository `lyndon025/epic-gamepass-when`.
3. Name: e.g. `epicgamepasswhen-backend-dev`.
4. Branch: `dev`.
5. Root Directory: `apps/backend`.
6. Runtime: Python 3. Build Command: `pip install -r requirements.txt`.
   Start Command: `gunicorn app:app`.
7. Instance type: Free is fine (note: free services cold-start after idle, ~1 min;
   the UI shows a "Waking up server" message while it spins up).
8. Environment variables: NONE required - the Flask backend only loads its local
   models/CSVs and reads `PORT` (Render sets that automatically).
9. Create. Wait for the first deploy to go green.
10. Copy the service URL, e.g. `https://epicgamepasswhen-backend-dev.onrender.com`.
11. Verify directly in a browser: open `<dev-backend-url>/api/health` - you should
    get JSON listing the model versions.

---

## Part 2 - Configure the frontend (Vercel)

In the existing Vercel project for `lyndon025/epic-gamepass-when`:

1. Settings -> Build and Deployment -> Root Directory = `apps/frontend`. Save.
   (Nothing rebuilds yet; the live prod deployment is unaffected.)

2. Settings -> Environment Variables. Make sure these exist for the PREVIEW scope
   (tick the "Preview" environment box on each). Leave the PRODUCTION-scope values
   as they are (still pointing at the prod backend):
   - `BACKEND_API_URL` = `<dev-backend-url from Part 1>`   (or set `VITE_API_URL`)
   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`  (reuse the same Supabase
     project; cache is key-scoped and the leaderboard is cosmetic. Use a separate
     Supabase project only if you want dev fully isolated from prod data.)
   - your `VITE_RAWG_API_KEY` variable(s) - mirror whatever Production already has.
   - (optional) `CRON_SECRET` if you use the cache-cleanup cron.

   This is the step that "connects the dev frontend to the dev backend": the dev
   (preview) serverless function will read the Preview-scope `BACKEND_API_URL` and
   call your dev Render service; the prod deployment keeps using the Production
   scope value.

---

## Part 3 - Push to dev and test end to end

1. Push the monorepo to `dev` (I can do this for you, or run):
   ```
   git checkout dev
   git merge phase-1-monorepo
   git push origin dev
   ```
2. This triggers: Vercel builds a Preview from `dev` (root `apps/frontend`) and the
   dev Render service auto-deploys `dev`.
3. Open the dev frontend:
   `https://epic-gamepass-when-git-dev-lyndon025s-projects.vercel.app`
4. Test each platform (Epic, Xbox, PlayStation, Humble): search a game, select it,
   run a prediction. The first prediction may cold-start the dev backend (~1 min).
5. Pass criteria:
   - prediction returns a real result (not an error card),
   - `<dev-backend-url>/api/health` is healthy,
   - leaderboard/cache behave (or fail silently if you skipped Supabase in Preview).
   This proves: dev browser -> dev Vercel `/api` -> dev Render backend, fully
   isolated from production.

---

## Part 4 - Promote to production (manual, your decision)

Only after dev is verified. Order does not cause downtime (health-gated swaps).

1. Backend (prod): in the EXISTING prod Render service, change the connected repo
   to `lyndon025/epic-gamepass-when`, Branch `main`, Root Directory `apps/backend`.
   Render builds the new revision and swaps only when healthy (no downtime).
   (Alternative: create a fresh prod service from the monorepo and move the custom
   domain to it once green.)
2. Frontend (prod): merge and push:
   ```
   git checkout main
   git merge dev
   git push origin main
   ```
   Vercel builds Production from `main` (which now has `apps/frontend`; root dir is
   already set) and swaps in zero-downtime. Production-scope `BACKEND_API_URL`
   still points at the prod backend.
3. Verify prod: `https://epic-gamepass-when.vercel.app` loads and a prediction
   round-trips; `https://epic-gamepass-when.onrender.com/api/health` is healthy.

---

## Part 5 - Archive the old backend repo

After prod is verified, archive `lyndon025/epicgamepasswhen-backend` on GitHub
(Settings -> Archive this repository). Its history is preserved inside the monorepo
(subtree merge) and in the bundle backup. You can also delete the now-idle dev
Render service if you do not want a standing dev backend.

---

## Rollback / recovery

- A bad dev build changes nothing in prod; fix on the branch and re-push `dev`.
- Prod stays on its last good deployment until you explicitly merge to `main`;
  a failed build is never promoted.
- Full pre-overhaul snapshots: `_epicgamepass_archive/*.bundle` (`git clone <bundle>`).
- The old backend repo remains live until you choose to archive it, so the old
  prod backend is always a fallback.

---

## Env var quick reference

| Variable | Where it runs | Needed by | Scope to set |
|---|---|---|---|
| BACKEND_API_URL (or VITE_API_URL) | Vercel serverless fn | predict proxy -> backend | Preview = dev backend; Production = prod backend |
| VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY | Vercel fn + client | cache, leaderboard | Preview + Production |
| VITE_RAWG_API_KEY (x N) | client | RAWG game search | Preview + Production |
| CRON_SECRET | Vercel cron fn | cache cleanup (optional) | Production (+ Preview if testing) |
| PORT | Render | Flask bind | set automatically by Render |

The Flask backend itself needs NO secrets - it only loads local models/CSVs.
