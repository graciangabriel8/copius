#!/usr/bin/env python3
"""Rebuild og/copius.jpg — the picture every shared link shows.

It was made by hand once and then drifted: it claimed 1 857 ingredients when
there were 1 835, and "59 dishes" when the bases file held 45. Nothing pointed
at the data, so nothing could notice. Now the numbers are counted at build time
and the card is regenerated from them.

macOS only: qlmanage renders the svg, sips crops and encodes. Both ship with the
system, which is the whole reason this is not a node script.

    python3 tools/build-og.py
"""
import json, pathlib, re, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "og" / "copius.jpg"

# Counted, never typed.
NOT_INGREDIENTS = ("chefs", "trees", "techniques", "bases")
ing = set()
for f in (ROOT / "js").glob("data-*.js"):
    if any(x in f.name for x in NOT_INGREDIENTS):
        continue
    ing |= set(re.findall(r'\{id:"([a-z0-9é\-]+)",cat:"', f.read_text()))
tech = len(re.findall(r'\{id:"', (ROOT / "js" / "data-techniques.js").read_text()))
chefs = len(re.findall(r'\{id:"[a-z0-9-]+", name:"', (ROOT / "js" / "data-chefs.js").read_text()))
if not (ing and tech and chefs):
    sys.exit("counted zero of something — has a data file been renamed?")
line = "%d INGREDIENTS · %d TECHNIQUES · %d CHEFS" % (len(ing), tech, chefs)

# The landing page shows the same numbers, plus the bases. They are rewritten in
# place here so they cannot drift again: the page said 59 bases when the file
# held 45, and 81 chefs when there were 68.
bases = len(re.findall(r'\{id:"', (ROOT / "js" / "data-bases.js").read_text()))
def fmt(n):
    return "{:,}".format(n).replace(",", "\u202f")   # 1 839, French style, unbreakable
idx = ROOT / "index.html"
html = idx.read_text(encoding="utf-8")
for key, n in (("ingredients", len(ing)), ("techniques", tech), ("bases", bases), ("chefs", chefs)):
    html, k = re.subn(r'(data-count="%s">)[^<]*' % key, lambda m: m.group(1) + fmt(n), html)
    if k != 1:
        sys.exit("index.html: expected one data-count=%s, found %d" % (key, k))
html, k = re.subn(r'content="[^"]*? ingredients, [^"]*? techniques, [^"]*? bases and [^"]*? chefs, ',
                  'content="%s ingredients, %s techniques, %s bases and %s chefs, '
                  % (fmt(len(ing)), fmt(tech), fmt(bases), fmt(chefs)), html)
if k != 1:
    sys.exit("index.html: the og:description count line was not found")

# The landing page's wall of drawings: the page chooses the ids, and everything
# else is refreshed from the data here, so a redrawn ingredient shows there too.
# Free version only: each drawing links to its page, and a page outside the
# free version is a locked one. The family picks the plate's tint.
FAMILY = {c: f for f, cats in (("g", "vegetables herbs seaweed legumes"), ("r", "fruits flowers sweet"),
                               ("s", "seafood shellfish roe"), ("e", "mushrooms meat cuts dairy fats"),
                               ("o", "spices nuts grains condiments cellar infusions texture"))
          for c in cats.split()}
free = set(json.loads((ROOT / "tools" / "free-tier.json").read_text())["ids"])
recs = {}
for f in (ROOT / "js").glob("data-*.js"):
    if any(x in f.name for x in NOT_INGREDIENTS):
        continue
    for m in re.finditer(r"\{id:\"([^\"]+)\",cat:\"([^\"]+)\"(.*?)svg:'(.*?)'\s*\}", f.read_text(), re.S):
        en = re.search(r'name:\{en:"([^"]*)"', m.group(3))
        fr = re.search(r'name:\{[^}]*?fr:"([^"]*)"', m.group(3))
        recs[m.group(1)] = (m.group(2), en and en.group(1), fr and fr.group(1), m.group(4))
wall = re.search(r"^  var D = (\[.*\]);$", html, re.M)
if not wall:
    sys.exit("index.html: the drawings line (var D = [...];) was not found")
art = []
for d in json.loads(wall.group(1)):
    r = recs.get(d["i"])
    if not r or r[0] not in FAMILY or not (r[1] and r[2] and r[3]):
        sys.exit("index.html: no usable drawing in the data for " + d["i"])
    if d["i"] not in free:
        sys.exit("index.html: %s is not in the free version, so its page is locked" % d["i"])
    art.append({"i": d["i"], "f": FAMILY[r[0]], "e": r[1], "r": r[2], "s": r[3]})
html = (html[:wall.start(1)] + json.dumps(art, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
        + html[wall.end(1):])
idx.write_text(html, encoding="utf-8")
print("index.html counts: %d ingredients, %d techniques, %d bases, %d chefs; %d drawings"
      % (len(ing), tech, bases, chefs, len(art)))

# qlmanage renders into a square box and scales to fit, so a 1200x630 svg comes
# out zoomed and clipped. Authoring it square and cropping the middle band back
# out is what keeps the proportions honest.
SVG = """<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <rect width="1200" height="1200" fill="#F7F6F1"/>
  <g transform="translate(0 285)">
    <rect x="30" y="30" width="1140" height="570" fill="none" stroke="#E5E7DA" stroke-width="2"/>
    <g transform="translate(600 175) scale(1.15) translate(-48 -48)">
      <path d="M52 24C30 32 16 52 20 66c2 9 12 12 17 6 4-5 0-12-5-10 4-12 16-22 34-24Z"
            fill="#F7F6F1" stroke="#1E211A" stroke-width="3.4" stroke-linejoin="round"/>
      <path d="M52 24c9 4 14 11 14 20" fill="none" stroke="#1f1f1e" stroke-width="3.4" stroke-linecap="round"/>
      <circle cx="62" cy="20" r="7.5" fill="#1f1f1e"/>
      <circle cx="75" cy="30" r="6" fill="#1f1f1e"/>
      <circle cx="52" cy="11" r="5" fill="#1f1f1e"/>
    </g>
    <text x="600" y="355" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
          font-size="94" fill="#1f1f1e">Copius</text>
    <text x="600" y="420" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
          font-style="italic" font-size="30" fill="#6b6a64">An illustrated atlas of cooking · Un atlas illustré de la cuisine</text>
    <text x="600" y="497" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
          font-size="22" letter-spacing="3" fill="#6A6E5F">%s</text>
    <text x="600" y="551" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
          font-size="19" fill="#a3a29b">copius.fr</text>
  </g>
</svg>
""" % line

with tempfile.TemporaryDirectory() as tmp:
    t = pathlib.Path(tmp)
    (t / "og.svg").write_text(SVG)
    subprocess.run(["qlmanage", "-t", "-s", "1200", "-o", str(t), str(t / "og.svg")],
                   capture_output=True, check=True)
    png = t / "og.svg.png"
    if not png.exists():
        sys.exit("qlmanage rendered nothing")
    subprocess.run(["sips", "-c", "630", "1200", str(png), "--out", str(t / "c.png")],
                   capture_output=True, check=True)
    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "88",
                    str(t / "c.png"), "--out", str(OUT)], capture_output=True, check=True)

w = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(OUT)],
                   capture_output=True, text=True).stdout
dims = re.findall(r": (\d+)", w)
assert dims == ["1200", "630"], "wrong size: %s" % dims
print("og/copius.jpg — %s (%d KB)" % (line, OUT.stat().st_size // 1024))
