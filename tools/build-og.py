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
import pathlib, re, subprocess, sys, tempfile

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
idx.write_text(html, encoding="utf-8")
print("index.html counts: %d ingredients, %d techniques, %d bases, %d chefs" % (len(ing), tech, bases, chefs))

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
