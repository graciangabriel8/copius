#!/usr/bin/env python3
"""Render one ingredient to a 1080x1080 Instagram card (SVG).

Pure-data: every illustration lives in the entry's own `svg` field, so no
external assets and no network. Usage:
    python3 tools/make-card.py [YYYY-MM-DD] [out.svg]
Defaults to today and social/<id>.svg. The day -> ingredient map is
social/schedule.json (tools/build-schedule.py), fixed in advance so that a data
edit never changes which card a date needs.
"""
import re, sys, json, pathlib, datetime, html

ROOT = pathlib.Path(__file__).resolve().parent.parent

# / is the holding page now; the app that lists the data files is atlas.html.
APP = "atlas.html"


def load():
    idx = (ROOT / APP).read_text()
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
                "tip_en": field(r'tip:\{en:"((?:[^"\\]|\\.)*)"'),
            })
    # Say so rather than dividing by zero three frames later: this returned an
    # empty list for an afternoon after the app moved off index.html, and the
    # only symptom was a ZeroDivisionError inside pick().
    if not rows:
        sys.exit("no data files listed in %s — has the app moved again?" % APP)
    return rows

SCHEDULE = ROOT / "social" / "schedule.json"
EXHAUSTED = ("schedule exhausted — run: python3 tools/build-schedule.py"
             " && sh tools/build-social.sh && commit")


def schedule():
    s = json.loads(SCHEDULE.read_text())
    return datetime.date.fromisoformat(s["start"]), s["days"]


def resolve(rows, days, idx):
    """The entry scheduled at idx, or the first later one still in the data:
    an entry merged away leaves its id in the schedule rather than shifting
    every later day. The warning goes to stderr so `$(--today-id)` stays clean."""
    byid = {r["id"]: r for r in rows}
    for j in range(idx, len(days)):
        if days[j] in byid:
            if j != idx:
                print("::warning::%s is no longer in the data — using %s instead"
                      % (days[idx], days[j]), file=sys.stderr)
            return byid[days[j]]
    sys.exit("no scheduled id from %s on exists in the data — " % days[idx] + EXHAUSTED)


def pick(rows, d):
    start, days = schedule()
    idx = (d - start).days
    if idx < 0:
        sys.exit("%s is before the schedule starts (%s)" % (d, start))
    if idx >= len(days):
        sys.exit(EXHAUSTED)
    return resolve(rows, days, idx)

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
<text x="540" y="986" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="26" letter-spacing="5" fill="#b4ada2">COPIUS</text>
<text x="540" y="1016" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="21" letter-spacing="2" fill="#a29c92">copius.fr</text>
</svg>'''


def tip_card(i):
    """Slide two: the handling note, set as type. The picture says what the
    ingredient is; this says what to do with it, which is the half a cook
    actually keeps."""
    e = lambda s: html.escape(s or "", quote=True)
    tip = re.sub(r"\\+(.)", r"\1", i["tip_en"] or "")
    # Step the type down rather than cut the text: a tip's second sentence is
    # usually the one carrying the warning. The longest tip in the data (351
    # characters) settles on the third pair; the last is headroom.
    for size, cols in ((38, 40), (34, 45), (31, 50), (28, 55)):
        lines = wrap(tip, cols)
        if len(lines) * size * 1.45 <= 360:
            break
    lh = round(size * 1.45)
    # Centre the whole stack, not the tip alone: a two-line tip under a fixed
    # header hangs in a void, and this is the same page either way.
    head = 288                                   # name to first line of tip
    s = 555 - (head + (len(lines) - 1) * lh) / 2  # baseline of the name
    body = "".join(
        '<text x="540" y="%d" text-anchor="middle" font-family="Georgia,serif" '
        'font-size="%d" fill="#55524d">%s</text>' % (s + head + n * lh, size, e(l))
        for n, l in enumerate(lines))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
{STYLE}
<rect width="1080" height="1080" fill="#faf9f7"/>
<rect x="40" y="40" width="1000" height="1000" fill="none" stroke="#e2ded7" stroke-width="2"/>
<text x="540" y="{s}" text-anchor="middle" font-family="Georgia,serif" font-size="52" fill="#1c1a17">{e(i["en"])}</text>
<text x="540" y="{s + 52}" text-anchor="middle" font-family="Georgia,serif" font-size="28" font-style="italic" fill="#8a857d">{e(i["fr"])}</text>
<line x1="470" y1="{s + 126}" x2="610" y2="{s + 126}" stroke="#e2ded7" stroke-width="2"/>
<text x="540" y="{s + 188}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="22" letter-spacing="6" fill="#a29c92">IN THE KITCHEN</text>
{body}
<text x="540" y="986" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="26" letter-spacing="5" fill="#b4ada2">COPIUS</text>
<text x="540" y="1016" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="21" letter-spacing="2" fill="#a29c92">copius.fr</text>
</svg>'''


# loi Evin, CSP art. L3323-4: a communication in favour of an alcoholic drink
# carries the health message. The site already does this (js/app.js), and a post
# is the same communication. It goes in before publishing because it cannot go in
# after: the Instagram API exposes no way to edit a published caption, so the only
# writable field on a live post is whether comments are on.
#
# The cellar family IS the drinks cabinet, so it carries the mention by default
# and the exceptions are the ones listed. A bottle added to the family later is
# then covered without anyone having to remember this rule; a vinegar added to it
# gets a mention it does not need, which is the harmless direction to be wrong in.
NOT_A_DRINK = {"champagne-vinegar", "raspberry-vinegar", "shanxi-vinegar",
               "verjus-rouge", "vincotto", "grape-must"}
DRINKS_ELSEWHERE = {"shaoxing-wine", "hon-mirin"}
EVIN = ("L\u2019abus d\u2019alcool est dangereux pour la sant\u00e9. "
        "\u00c0 consommer avec mod\u00e9ration.")


def is_alcohol(i):
    return ((i["cat"] == "cellar" and i["id"] not in NOT_A_DRINK)
            or i["id"] in DRINKS_ELSEWHERE)


def caption(i):
    """Bilingual caption. Instagram captions carry no clickable link, so the
    site is named rather than linked."""
    un = lambda s: re.sub(r"\\+(.)", r"\1", s or "")
    tags = ["#copius", "#ingredients", "#cuisine", "#gastronomie",
            "#chef", "#cooking", "#terroir", "#" + i["cat"]]
    # A flag opens each story, so a reader scrolling past knows which paragraph
    # is theirs without reading into it. The title line is already both languages.
    # High in the caption, not buried: Instagram hides everything past the first
    # couple of lines behind "... more", and a mention nobody can see is not one.
    return "\n".join([
        "%s \u00b7 %s" % (i["en"], i["fr"]),
        i["latin"],
    ] + ([EVIN] if is_alcohol(i) else []) + ["",
        "\U0001F1EC\U0001F1E7 " + un(i["story_en"]), "",
        "\U0001F1EB\U0001F1F7 " + un(i["story_fr"]), "",
        "\u2014 copius, l\u2019atlas des ingr\u00e9dients \u00b7 copius.fr",
        "", " ".join(tags),
    ])


def build_all(rows, outdir):
    """Only the pictures. The caption is derived at post time by --caption, so
    there is no committed copy of it to drift out of step with caption()."""
    outdir.mkdir(parents=True, exist_ok=True)
    done = set()
    for i in rows:
        (outdir / (i["id"] + ".svg")).write_text(card(i))
        (outdir / (i["id"] + ".2.svg")).write_text(tip_card(i))
        done.add(i["id"])
    return len(done)


if __name__ == "__main__":
    rows = load()
    if len(sys.argv) > 1 and sys.argv[1] == "--window":
        # The next N scheduled days from today (all remaining when N is not
        # given). A full set is 1,857 files and ~86 MB of repository for cards
        # that will not be posted for years.
        start, days = schedule()
        first = max(0, (datetime.date.today() - start).days)
        last = min(len(days), first + int(sys.argv[2])) if len(sys.argv) > 2 else len(days)
        want, seen = [], set()
        for k in range(first, last):
            i = resolve(rows, days, k)
            if i["id"] not in seen:
                seen.add(i["id"]); want.append(i)
        n = build_all(want, ROOT / "social")
        print(json.dumps({"built": n, "days": last - first, "dir": "social/"}))
        sys.exit(0)
    if len(sys.argv) > 1 and sys.argv[1] == "--all":
        n = build_all(rows, ROOT / "social")
        print(json.dumps({"built": n, "dir": "social/"}))
        sys.exit(0)
    # Both take an optional date. The poster passes the same one to each, so the
    # picture and the caption cannot come from two different days; with no date
    # they mean today, and answer for the entry the website is showing.
    if len(sys.argv) > 1 and sys.argv[1] in ("--today-id", "--caption"):
        d = (datetime.date.fromisoformat(sys.argv[2]) if len(sys.argv) > 2
             else datetime.date.today())
        i = pick(rows, d)
        print(i["id"] if sys.argv[1] == "--today-id" else caption(i))
        sys.exit(0)
    d = datetime.date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else datetime.date.today()
    i = pick(rows, d)
    out = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "social" / (i["id"] + ".svg")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(card(i))
    print(json.dumps({"date": str(d), "id": i["id"], "en": i["en"], "fr": i["fr"], "file": str(out)}))
