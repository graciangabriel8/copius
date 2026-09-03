#!/usr/bin/env python3
"""Render one ingredient to a 1080x1080 Instagram card (SVG).

Pure-data: every illustration lives in the entry's own `svg` field, so no
external assets and no network. Usage:
    python3 tools/make-card.py [YYYY-MM-DD] [out.svg]
Defaults to today and social/<id>.svg. The day -> ingredient mapping is the
same full-cycle stride the site uses, so the card always matches the website.
"""
import re, sys, json, math, pathlib, datetime, html

ROOT = pathlib.Path(__file__).resolve().parent.parent

def load():
    idx = (ROOT / "index.html").read_text()
    rows = []
    for fn in re.findall(r'src="js/(data-[a-z-]+\.js)\?', idx):
        if "chefs" in fn or "trees" in fn:
            continue
        t = (ROOT / "js" / fn).read_text()
        for blk in re.findall(r'^\{id:".*?(?=^\{id:"|\n\s*\]|\Z)', t, re.S | re.M):
            m = re.match(r'\{id:"([a-z0-9-]+)",\s*cat:"([a-z]+)"', blk)
            if not m:
                continue
            def field(pat):
                x = re.search(pat, blk, re.S)
                return x.group(1) if x else ""
            rows.append({
                "id": m.group(1), "cat": m.group(2),
                "en": field(r'name:\{en:"([^"]*)"'), "fr": field(r'name:\{[^}]*fr:"([^"]*)"'),
                "latin": field(r'latin:"([^"]*)"'),
                "svg": field(r"svg:'(.*?)'\s*\}"),
                "story_en": field(r'story:\{en:"((?:[^"\\]|\\.)*)"'),
                "story_fr": field(r'story:\{[^}]*?fr:"((?:[^"\\]|\\.)*)"'),
            })
    return rows

def pick(rows, d):
    n = len(rows)
    k = round(n * 0.6180339887)
    while k > 1 and math.gcd(k, n) != 1:
        k -= 1
    day = (d - datetime.date(1970, 1, 1)).days
    return rows[((day % n) * k) % n]

def wrap(s, width):
    out, line = [], ""
    for w in s.split():
        if len(line) + len(w) + 1 > width:
            out.append(line); line = w
        else:
            line = (line + " " + w).strip()
    if line: out.append(line)
    return out

# The site keeps these in style.css; a standalone card must carry them itself.
STYLE = (
    "<style>"
    ".f1{fill:#e9e9e6}.f2{fill:#d7d7d3}.f3{fill:#bcbcb6}.dot{fill:#585853}"
    ".s{fill:none;stroke:#585853;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}"
    ".sf{stroke:#585853;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}"
    "</style>"
)

def card(i):
    e = lambda s: html.escape(s or "", quote=True)
    story = re.sub(r"\\+(.)", r"\1", i["story_en"] or "")
    # End on a sentence where one fits; otherwise trim to a word and mark it.
    sentences, kept = re.split(r"(?<=[.!?])\s+", story), ""
    for s in sentences:
        if len(wrap((kept + " " + s).strip(), 46)) > 3:
            break
        kept = (kept + " " + s).strip()
    if not kept:
        lines = wrap(story, 46)[:3]
        lines[-1] = lines[-1].rstrip(",;:") + "\u2026"
    else:
        lines = wrap(kept, 46)
    body = "".join(
        '<text x="540" y="%d" text-anchor="middle" font-family="Georgia,serif" '
        'font-size="30" fill="#55524d">%s</text>' % (812 + n * 44, e(l))
        for n, l in enumerate(lines))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
{STYLE}
<rect width="1080" height="1080" fill="#faf9f7"/>
<rect x="40" y="40" width="1000" height="1000" fill="none" stroke="#e2ded7" stroke-width="2"/>
<g transform="translate(330,150) scale(4.375)">
  <circle cx="48" cy="50" r="42" fill="#f1f1f0"/>{i["svg"]}
</g>
<text x="540" y="660" text-anchor="middle" font-family="Georgia,serif" font-size="66" fill="#1c1a17">{e(i["en"])}</text>
<text x="540" y="716" text-anchor="middle" font-family="Georgia,serif" font-size="34" font-style="italic" fill="#8a857d">{e(i["fr"])}</text>
<text x="540" y="762" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="24" letter-spacing="3" fill="#a29c92">{e(i["latin"].upper())}</text>
{body}
<text x="540" y="1002" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="26" letter-spacing="5" fill="#b4ada2">COPIUS</text>
</svg>'''

def caption(i):
    """Bilingual caption. Instagram captions carry no clickable link, so the
    site is named rather than linked."""
    un = lambda s: re.sub(r"\\+(.)", r"\1", s or "")
    tags = ["#copius", "#ingredients", "#cuisine", "#gastronomie",
            "#chef", "#cooking", "#terroir", "#" + i["cat"]]
    return "\n".join([
        "%s \u00b7 %s" % (i["en"], i["fr"]),
        i["latin"], "",
        un(i["story_en"]), "",
        un(i["story_fr"]), "",
        "\u2014 copius, l\u2019atlas des ingr\u00e9dients \u00b7 graciangabriel8.github.io/copius",
        "", " ".join(tags),
    ])


def build_all(rows, outdir):
    outdir.mkdir(parents=True, exist_ok=True)
    man = {}
    for i in rows:
        (outdir / (i["id"] + ".svg")).write_text(card(i))
        man[i["id"]] = {"en": i["en"], "fr": i["fr"], "caption": caption(i)}
    (outdir / "captions.json").write_text(json.dumps(man, ensure_ascii=False, indent=1))
    return len(man)


if __name__ == "__main__":
    rows = load()
    if len(sys.argv) > 1 and sys.argv[1] == "--all":
        n = build_all(rows, ROOT / "social")
        print(json.dumps({"built": n, "dir": "social/"}))
        sys.exit(0)
    if len(sys.argv) > 1 and sys.argv[1] == "--today-id":
        i = pick(rows, datetime.date.today())
        print(i["id"])
        sys.exit(0)
    d = datetime.date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else datetime.date.today()
    i = pick(rows, d)
    out = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "social" / (i["id"] + ".svg")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(card(i))
    print(json.dumps({"date": str(d), "id": i["id"], "en": i["en"], "fr": i["fr"], "file": str(out)}))
