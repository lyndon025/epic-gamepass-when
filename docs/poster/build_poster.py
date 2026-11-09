"""Build the LinkedIn showcase poster from apps/frontend/public/rankings.json.

Usage:  python docs/poster/build_poster.py
Re-run after each data update; it rewrites poster.html and poster.png.
Set EDGE_PATH (or CHROME_PATH) if the browser is not in a default location.
"""
import base64
import html
import json
import os
import subprocess
from datetime import date
from pathlib import Path

import segno

HERE = Path(__file__).resolve().parent
PUB = HERE.parents[1] / "apps" / "frontend" / "public"
BLUE = "#0A66C2"  # LinkedIn blue
SITE_URL = "https://epic-gamepass-when.vercel.app"

SERVICES = [
    ("epic", "Epic Games Store", "epic.svg"),
    ("gamepass", "Xbox Game Pass", "xbox.svg"),
    ("psplus", "PlayStation Plus Extra", "ps.svg"),
    ("humble", "Humble Choice", "humble.svg"),
]
SHORT = {"The Elder Scrolls IV: Oblivion Remastered": "Oblivion Remastered"}


def data_uri(path: Path, recolor: bool = False) -> str:
    text = path.read_text(encoding="utf-8")
    if recolor:
        text = text.replace("#FF4FA3", BLUE)
        text = text.replace("@media (prefers-color-scheme: dark){.b{fill:#F2F1EE}}", "")
    return "data:image/svg+xml;base64," + base64.b64encode(text.encode()).decode()


def qr_uri(url: str) -> str:
    import io
    buf = io.BytesIO()
    segno.make(url, error="m").save(buf, kind="svg", scale=10, border=0, dark=BLUE, light="#ffffff")
    return "data:image/svg+xml;base64," + base64.b64encode(buf.getvalue()).decode()


def card(rank_data: dict, key: str, label: str, logo: str) -> str:
    rows = []
    for g in rank_data["services"][key]["likely"][:3]:
        pct = round(g["chance"] * 100)
        name = html.escape(SHORT.get(g["name"], g["name"]))
        rows.append(
            f'<div class="row"><b>{name}</b><div class="bar"><i style="width:{g["chance"]*100:.1f}%"></i></div>'
            f'<span class="pct">{pct}%</span></div>'
        )
    return (
        f'<div class="card"><h3><img src="{data_uri(PUB / "logos" / logo)}" alt="">{label}</h3>'
        f'<small>Most likely next, 12-month chance</small>{"".join(rows)}</div>'
    )


def main() -> None:
    d = json.loads((PUB / "rankings.json").read_text(encoding="utf-8"))
    as_of = date.fromisoformat(d["as_of"])
    as_of_txt = f"{as_of.day} {as_of.strftime('%b %Y')}"
    cards = "".join(card(d, *s) for s in SERVICES)
    page = TEMPLATE.replace("{{CARDS}}", cards).replace("{{ASOF}}", as_of_txt).replace(
        "{{LOGO}}", data_uri(PUB / "logo.svg", recolor=True)
    ).replace("{{BLUE}}", BLUE).replace("{{QR}}", qr_uri(SITE_URL))
    out_html = HERE / "poster.html"
    out_html.write_text(page, encoding="utf-8")

    candidates = [
        os.environ.get("EDGE_PATH"), os.environ.get("CHROME_PATH"),
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    ]
    browser = next((c for c in candidates if c and Path(c).exists()), None)
    if not browser:
        print("Wrote poster.html; no Edge/Chrome found, screenshot it manually.")
        return
    subprocess.run(
        [browser, "--headless=new", "--disable-gpu", "--hide-scrollbars",
         "--virtual-time-budget=8000", "--window-size=1200,1200",
         f"--screenshot={HERE / 'poster.png'}", out_html.as_uri()],
        check=False, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
    )
    print(f"Built poster for data as of {d['as_of']}")


TEMPLATE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Epic Game Pass When - poster</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;800&family=Outfit:wght@600;700&display=swap">
<style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:1200px;background:#F3F2EF;color:#191919;font-family:Manrope,sans-serif;position:relative;overflow:hidden}
body:before{content:"";position:absolute;left:0;top:0;right:0;height:14px;background:{{BLUE}}}
.wrap{padding:50px 72px}
.top{display:flex;align-items:center;gap:20px}
.top img{width:64px;height:64px;image-rendering:pixelated;border-radius:8px}
.top span{font:700 26px Outfit;letter-spacing:.02em;color:#56687A}
h1{font:700 84px/1.02 Outfit;margin-top:28px;letter-spacing:-.02em;color:#191919}
h1 em{font-style:normal;color:{{BLUE}}}
.sub{font-size:28px;line-height:1.45;color:#56687A;margin-top:20px;max-width:880px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:30px}
.card{background:#fff;border:1px solid #DADEE2;border-radius:16px;padding:22px 26px;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.card h3{font:700 22px Outfit;display:flex;align-items:center;gap:12px;color:#191919}
.card h3 img{height:28px;width:28px;object-fit:contain}
.card small{display:block;font-size:15px;color:#666;margin:6px 0 14px}
.row{display:flex;align-items:center;gap:12px;font-size:19px;padding:7px 0;border-top:1px solid #E6E9EC}
.row b{flex:1;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar{width:90px;height:8px;background:#E6E9EC;border-radius:4px;overflow:hidden}
.bar i{display:block;height:100%;background:{{BLUE}}}
.pct{width:52px;text-align:right;font-weight:800;color:{{BLUE}}}
.feat{display:flex;gap:12px;flex-wrap:wrap}
.feat span{font-size:19px;font-weight:600;padding:9px 18px;border:1.5px solid {{BLUE}};border-radius:999px;color:{{BLUE}};background:#fff}
.foot{position:absolute;left:72px;right:72px;bottom:36px;display:flex;justify-content:space-between;align-items:flex-end;gap:32px}
.fl{display:flex;flex-direction:column;gap:18px}
.qr{background:#fff;border:1px solid #DADEE2;border-radius:16px;padding:12px;text-align:center;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.qr img{display:block;width:124px;height:124px}
.qr div{font:700 15px Outfit;color:{{BLUE}};margin-top:8px}
.url{font:700 34px Outfit;color:{{BLUE}}}
.note{font-size:16px;color:#666;line-height:1.5}
</style></head><body><div class="wrap">
<div class="top"><img src="{{LOGO}}" alt=""><span>EPIC GAME PASS WHEN?</span></div>
<h1>When will your game<br>go <em>free</em>?</h1>
<p class="sub">Search a game and see when it's likely to land on a subscription service, with a likely window and its odds over the next 12 months.</p>
<div class="grid">{{CARDS}}</div>
</div>
<div class="foot"><div class="fl"><div class="feat"><span>Likely window</span><span>Odds per game</span><span>Rankings</span><span>Statistics</span><span>4 services</span></div>
<div><div class="url">epic-gamepass-when.vercel.app</div><div class="note">Figures as of {{ASOF}}. They change with each data update.</div></div></div>
<div class="qr"><img src="{{QR}}" alt="QR code"><div>Scan to try it</div></div></div>
</body></html>
"""

if __name__ == "__main__":
    main()
