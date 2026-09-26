"""A fingerprint of everything in this folder that shapes an answer.

One function, used in two places so they cannot disagree:

  - the backend reports it with every answer and on /api/health, so the site's
    proxy can tell which build actually answered;
  - pipeline.precompute stamps it on the stored answers, and pipeline.preflight
    refuses to pass if the two no longer match.

Covers the model bundles, the served datasets, the arrival-odds table, the data
status and the backend's Python. Text files are hashed with line endings
normalised, because a Windows checkout can hold CRLF where the deployed copy has
LF, and the same code must give the same fingerprint on both.
"""

import hashlib
import os

HERE = os.path.dirname(os.path.abspath(__file__))
TEXT = (".py", ".csv", ".json")
HASHED = TEXT + (".pkl",)


def compute(root: str = HERE) -> str:
    files = []
    for dirpath, _dirs, names in os.walk(root):
        if "__pycache__" in dirpath:
            continue
        for n in names:
            if n.endswith(HASHED):
                files.append(os.path.join(dirpath, n))
    h = hashlib.sha1()
    for path in sorted(files, key=lambda p: os.path.relpath(p, root).replace("\\", "/")):
        rel = os.path.relpath(path, root).replace("\\", "/")
        with open(path, "rb") as f:
            data = f.read()
        if rel.endswith(TEXT):
            data = data.replace(b"\r\n", b"\n")
        h.update(rel.encode())
        h.update(data)
    return h.hexdigest()


# Computed once at import: the files do not change while the service runs.
VERSION = compute()
