"""Builds renderer/index.html (the in-game overlay) from web/finder.html (the online finder).

The ghost data and logic come straight from the online finder, so both stay identical.
Run: python3 scripts/build_overlay.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
src = (ROOT / "web" / "finder.html").read_text(encoding="utf-8")

style = src.split("<style>", 1)[1].split("</style>", 1)[0]
script = src.split("<script>", 1)[1].split("</script>", 1)[0]
modal = src[src.index('<div class="modal" id="modal"'):src.index("<header>")].rstrip()

sections = re.findall(r'<section class="box"[^>]*>.*?</section>', src, flags=re.S)
def section(h2_text=None, sid=None):
    for s in sections:
        if sid and f'id="{sid}"' in s.split(">", 1)[0]:
            return s
        if h2_text and f"<h2>{h2_text}</h2>" in s:
            return s
    raise SystemExit(f"section not found: {h2_text or sid}")

def keyed(sec, key):
    # give each panel a stable id so its collapsed state can be remembered
    head, rest = sec.split(">", 1)
    if 'id="' not in head:
        head += f' id="{key}"'
    return head + ">" + rest

ev = keyed(section("Evidence"), "evBox")
hunt = keyed(section("Hunt observations"), "huntBox")
qbox = section(sid="qBox")
smbox = section(sid="smBox")
aibox = section(sid="aiBox")

# The online page moves the questions panel next to Evidence on low-evidence games;
# in the overlay every panel has a fixed column, so that move is switched off.
move = re.search(r'const evBox=\$\("evgrid"\)\.closest\("section"\);.*?\n', script)
if not move:
    raise SystemExit("question-panel move not found in finder script")
script = script.replace(move.group(0), "\n", 1)

obs_panel = (ROOT / "scripts" / "overlay_obs_panel.html").read_text(encoding="utf-8")
overlay_css = (ROOT / "scripts" / "overlay.css").read_text(encoding="utf-8")
overlay_js = (ROOT / "scripts" / "overlay.js").read_text(encoding="utf-8")

page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'none'">
<title>Phasmo Ghost Finder</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Special+Elite&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
[hidden]{{display:none!important}}
{style}
{overlay_css}
</style>
</head><body>
{modal}

<div id="ov">
  <div class="topbar">
    <span class="brand">Phasmo Ghost Finder</span>
    <button class="diffchip" id="diffChip" title="Change difficulty"><span>Difficulty</span><b id="diffName">—</b><span id="diffEvi" class="count"></span></button>
    <span class="count"><b id="remain">30</b> of 30 possible</span>
    <input id="gsearch" type="search" placeholder="Search ghosts…" aria-label="Search ghosts">
    <span class="spacer"></span>
    <span class="sizer" role="group" aria-label="Overlay size"><button class="btn" id="zOut" title="Smaller">A−</button><button class="btn" id="zReset" title="Normal size">100%</button><button class="btn" id="zIn" title="Bigger">A+</button></span>
    <button class="btn" id="compactBtn" aria-pressed="false">Compact</button>
    <button class="btn" id="layoutReset" title="Open every panel">Open all panels</button>
    <button class="btn" id="resetBtn">New contract <kbd>R</kbd></button>
    <button class="btn primary" id="closeOv">Back to game <kbd id="ovKey">Insert</kbd></button>
  </div>
  <div class="cols">
    <div class="col">
{ev}
{smbox}
    </div>
    <div class="col">
{hunt}
    </div>
    <div class="col">
{qbox}
    </div>
    <div class="col wide">
      <section class="box" id="ghostBox">
        <h2 id="boardTitle">Possible ghosts</h2>
        <p class="sub">Click a ghost's name for its speed, hunt sanity and tells. Underlined evidence is always shown when evidence is reduced.</p>
        <div id="guess"></div>
        <div class="board" id="board"></div>
      </section>
    </div>
    <div class="col">
{obs_panel}
{aibox}
    </div>
  </div>
</div>

<script>
{script}
</script>
<script>
{overlay_js}
</script>
</body></html>
"""
(ROOT / "renderer" / "index.html").write_text(page, encoding="utf-8")
print("wrote renderer/index.html", len(page), "bytes")
