"""One-time IGDB setup check (D-059). Run: python -m pipeline.setup_igdb

1. Reads TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET from the environment or the
   gitignored .env at the repo root (or apps/frontend/.env).
2. Asks Twitch for an access token and runs a test IGDB search, so a wrong or
   unconfirmed key shows up here rather than on the site.
3. With --vercel, copies both values into the Vercel project's Production and
   Preview environment variables via the Vercel CLI (needs a one-time
   `npx vercel login`). The secret is passed on stdin, never printed or logged.

Never prints the secret.
"""

import os
import subprocess
import sys

import requests

from . import config, igdb

FRONTEND = os.path.join(config.REPO_ROOT, "apps", "frontend")
ENV_FILE = os.path.join(config.REPO_ROOT, ".env")


def _vercel(args, stdin=None):
    return subprocess.run(["npx", "--yes", "vercel", *args], cwd=FRONTEND, input=stdin, text=True,
                          capture_output=True, shell=os.name == "nt", timeout=180)


def push_to_vercel(cid, secret):
    who = _vercel(["whoami"])
    if who.returncode != 0:
        print("Vercel CLI is not logged in. Run this once, then run this script again with --vercel:")
        print(f"    cd \"{FRONTEND}\" && npx vercel login")
        return False
    print(f"Vercel: logged in as {who.stdout.strip().splitlines()[-1]}")
    ok = True
    for name, value in (("TWITCH_CLIENT_ID", cid), ("TWITCH_CLIENT_SECRET", secret)):
        for target in ("production", "preview"):
            _vercel(["env", "rm", name, target, "--yes"])  # replace any old value
            r = _vercel(["env", "add", name, target], stdin=value)
            print(f"  {name} -> {target}: {'set' if r.returncode == 0 else 'FAILED'}")
            if r.returncode != 0:
                print("   ", (r.stderr or r.stdout).strip().splitlines()[-1:])
                ok = False
    if ok:
        print("Done. The keys take effect on the next deploy (the next push to dev or main).")
    return ok


def main():
    cid, secret = config.twitch_credentials()
    if not (cid and secret):
        print("No Twitch credentials found. Add these two lines to", ENV_FILE)
        print("    TWITCH_CLIENT_ID=<Client ID from dev.twitch.tv/console>")
        print("    TWITCH_CLIENT_SECRET=<Client Secret from the same page>")
        print("(That file is gitignored, so it never reaches GitHub.)")
        return 1
    print(f"Found TWITCH_CLIENT_ID ending ...{cid[-4:]} and a client secret.")
    try:
        token = igdb._access_token()
    except requests.HTTPError as e:
        print("Twitch refused these credentials:", e.response.status_code, e.response.text[:200])
        print("Check the Client ID, and make a new secret on the app's Manage page if needed.")
        return 1
    if not token:
        print("No token came back from Twitch.")
        return 1
    print("Twitch token: OK")
    games = igdb.search("Astro Bot", limit=3)
    if not games:
        print("IGDB returned nothing for a test search. The app may need a few minutes after creation; try again.")
        return 1
    for g in games:
        print(f"  IGDB test: {g['name']} | {g['release_date']} | {g['publisher']} | {', '.join(g['platforms'][:4])}")
    print("IGDB: OK - the pipeline will use it from now on.")
    if "--vercel" in sys.argv:
        return 0 if push_to_vercel(cid, secret) else 1
    print("\nNext: python -m pipeline.setup_igdb --vercel   (copies the keys to the live site)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
