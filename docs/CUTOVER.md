# Phase 1 cutover - hosting + push (owner actions)

The monorepo restructure is done LOCALLY on branch `phase-1-monorepo`. Nothing has
been pushed yet, so the live deploys are untouched and still building from the old
layout. Do these steps in order; the live site keeps working until step 3.

Recovery net: full pre-restructure backups are at
`i:/Lyndon/AI ML/Project/_epicgamepass_archive/*.bundle` (clone with
`git clone <bundle>`), and the old history is still on GitHub.

## 1. Point Vercel at the frontend subfolder (do FIRST)
Vercel project for repo `lyndon025/epic-gamepass-when`:
- Settings -> Build and Deployment -> Root Directory = `apps/frontend`
- Leave build command (`npm run build`) and output (`dist`) as-is; `vercel.json`
  and the `api/` serverless functions now live under `apps/frontend/`, so with the
  root set they resolve exactly as before.
- Env vars (VITE_API_URL, Supabase, etc.): no change.

## 2. Point the backend host at the backend subfolder
The backend now lives in the SAME repo (`lyndon025/epic-gamepass-when`) under
`apps/backend/`, not in `epicgamepasswhen-backend` anymore.
- Render: edit the existing Web Service -> connect it to `lyndon025/epic-gamepass-when`,
  set Root Directory = `apps/backend`, Build = `pip install -r requirements.txt`,
  Start = `gunicorn app:app`.
- Fly.io (alternative): `fly.toml` is at `apps/backend/fly.toml`; deploy from that
  directory.

## 3. Push and let dev redeploy
Only after steps 1-2 are saved (so the new root dirs are in effect):
```
git checkout dev
git merge --ff-only phase-1-monorepo   # or a normal merge if dev has moved
git push origin dev
```
Vercel (frontend) and Render/Fly (backend) both redeploy from `dev`.

## 4. Verify dev
- Frontend dev URL loads and a prediction round-trips.
- Backend `/api/health` returns the model versions JSON.

## 5. Archive the old backend repo
Once dev is green, archive `lyndon025/epicgamepasswhen-backend` on GitHub
(Settings -> Archive). Its history is preserved inside the monorepo (subtree) and
in the bundle backup.

## Production
Prod stays manual: when dev is verified, merge `dev -> main` (or your prod branch)
yourself. The pipeline will never push to prod (D-003).
