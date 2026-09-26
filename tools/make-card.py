#!/usr/bin/env python3
"""Render one ingredient to a 1080x1080 Instagram card (SVG).

Pure-data: every illustration lives in the entry's own `svg` field, so no
external assets and no network. Usage:
    python3 tools/make-card.py [YYYY-MM-DD] [out.svg]
Defaults to today and social/<id>.svg. The day -> ingredient map is
social/schedule.json (tools/build-schedule.py), fixed in advance so that a data
edit never changes which card a date needs.
"""
import re
import sys, json, pathlib, datetime, html

ROOT = pathlib.Path(__file__).resolve().parent.parent

# The source data in load order. atlas.html no longer names it: the public page
# loads only the generated free file.
SOURCES = ROOT / "tools" / "sources.txt"


def data_files():
    """The ingredient files of tools/sources.txt, in its order: every js/data-*.js
    but the chefs, trees, bases and techniques, which hold no ingredient record."""
    out = []
    for line in SOURCES.read_text().splitlines():
        f = line.strip()
        if (f.startswith("js/data-") and f.endswith(".js") and
                f[8:-3] not in ("chefs", "trees", "bases", "techniques")):
            out.append(f)
    return out


def typo(s):
    """French typography for the posts. The data mostly writes a plain space
    before : ; ? ! and inside « », which lets a line break there, and a few
    entries carry straight apostrophes and « - » for an incise."""
    s = s.replace("'", "\u2019")
    s = re.sub(r"(?<=\D) - (?=\D)", " \u2014 ", s)
    s = re.sub(r"[ \u00a0\u202f]*:(?=\s|$)", "\u00a0:", s)
    s = re.sub(r"(?<=\S)[ \u00a0\u202f]*([;?!])(?=\s|$)", "\u202f\\1", s)
    s = re.sub(r"\u00ab[ \u00a0\u202f]*", "\u00ab\u00a0", s)
    return re.sub(r"[ \u00a0\u202f]*\u00bb", "\u00a0\u00bb", s)


def load():
    rows = []
    for fn in data_files():
        t = (ROOT / fn).read_text()
        for blk in re.findall(r'^\{id:".*?(?=^\{id:"|\n\s*\]|\Z)', t, re.S | re.M):
            m = re.match(r'\{id:"([a-z0-9-]+)",\s*cat:"([a-z]+)"', blk)
            if not m:
                continue
            def field(pat):
                x = re.search(pat, blk, re.S)
                return x.group(1) if x else ""
            rows.append({
                "id": m.group(1), "cat": m.group(2),
                "en": field(r'name:\{en:"([^"]*)"'), "fr": typo(field(r'name:\{[^}]*fr:"([^"]*)"')),
                "latin": field(r'latin:"([^"]*)"'),
                "svg": field(r"svg:'(.*?)'\s*\}"),
                "story_en": field(r'story:\{en:"((?:[^"\\]|\\.)*)"'),
                "story_fr": typo(field(r'story:\{[^}]*?fr:"((?:[^"\\]|\\.)*)"')),
                "tip_fr": typo(field(r'tip:\{[^}]*?fr:"((?:[^"\\]|\\.)*)"')),
            })
    # Say so rather than dividing by zero three frames later: this returned an
    # empty list for an afternoon after the app moved off index.html, and the
    # only symptom was a ZeroDivisionError inside pick().
    if not rows:
        sys.exit("no ingredient records in the data files of %s" % SOURCES.relative_to(ROOT))
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
    # Split on plain spaces only: French copy keeps a no-break space before
    # : ; ? ! and inside numbers, and str.split() would break the line there.
    for w in re.split(r"[ \t\r\n]+", s.strip()):
        if len(line) + len(w) + 1 > width:
            out.append(line); line = w
        else:
            line = (line + " " + w).strip()
    if line: out.append(line)
    return out

def balance(s, width):
    """As many lines as wrap() gives, each as even as they can be: no word
    left alone on the last line."""
    n = len(wrap(s, width))
    while width > 12 and len(wrap(s, width - 1)) == n:
        width -= 1
    return wrap(s, width)


def name_parts(fr):
    """A French name often carries its gloss, « Niter kibbeh (beurre clarifié
    épicé éthiopien) » or « Huile d’olive de Corse – Oliu di Corsica »: the gloss
    goes on the italic line under the name, where the French name used to sit
    under the English one."""
    m = (re.match(r"^(.*?)\s*\((.*)\)\s*$", fr)
         or re.match(r"^(.*?) \u2013 (.*)$", fr))
    return (m.group(1), m.group(2)) if m else (fr, "")


def latin(i):
    """The Latin name without its note, which the data writes in English
    ("Salmo salar (smoked)") and a French post cannot carry."""
    return re.sub(r"\s*\([^)]*\)", "", i["latin"]).strip()


def em(s):
    """Rough Georgia advance width in em, enough to decide a line break."""
    return sum(.28 if c in " \u00a0\u202fil.,\u2019'-ftjrI"
               else .72 if c.isupper() or c in "mw" else .5 for c in s)


def title(t, size, width=900):
    """One line at full size when the name fits, else two balanced lines a
    size down, else smaller still: a name is never cut."""
    if em(t) * size <= width:
        return [t], size
    words = t.split(" ")
    if len(words) > 1:
        k = min(range(1, len(words)), key=lambda k: max(
            em(" ".join(words[:k])), em(" ".join(words[k:]))))
        lines = [" ".join(words[:k]), " ".join(words[k:])]
        size = round(size * .85)
    else:
        lines = [t]
    return lines, min(size, int(width / max(map(em, lines))))


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
    name, gloss = name_parts(i["fr"])
    tl, ts = title(name, 66)
    # Baselines relative to the first line of the name.
    y, parts = 0, []
    for l in tl:
        parts.append((y, '<text x="540" y="%d" text-anchor="middle" font-family="Georgia,serif" '
                         'font-size="%d" fill="#1c1a17">%s</text>', (ts, e(l))))
        y += round(ts * 1.1)
    y -= round(ts * 1.1)
    if gloss:
        y += 56
        parts.append((y, '<text x="540" y="%d" text-anchor="middle" font-family="Georgia,serif" '
                         'font-size="34" font-style="italic" fill="#8a857d">%s</text>', (e(gloss),)))
    y += 46 if gloss else 56
    parts.append((y, '<text x="540" y="%d" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" '
                     'font-size="24" letter-spacing="3" fill="#a29c92">%s</text>', (e(latin(i).upper()),)))
    y += 50 if gloss else 62
    # The story fills what the name leaves of the band under the drawing
    # (baselines 640 to 920), three lines at most.
    room = min(3, max(1, (280 - y) // 44 + 1))
    story = re.sub(r"\\+(.)", r"\1", i["story_fr"] or "")
    # End on a sentence where one fits; otherwise trim to a word and mark it.
    sentences, kept = re.split(r"(?<=[.!?\u2026]) +", story), ""
    for x in sentences:
        if len(wrap((kept + " " + x).strip(), 46)) > room:
            break
        kept = (kept + " " + x).strip()
    if not kept:
        lines = wrap(story, 46)[:room]
        lines[-1] = lines[-1].rstrip(",;:\u00a0\u202f") + "\u2026"
    else:
        lines = balance(kept, 46)
    for n, l in enumerate(lines):
        parts.append((y + n * 44, '<text x="540" y="%d" text-anchor="middle" font-family="Georgia,serif" '
                                  'font-size="30" fill="#55524d">%s</text>', (e(l),)))
    top = 780 - (y + (len(lines) - 1) * 44) // 2      # centre the block on 780
    text = "\n".join(f % ((top + dy,) + a) for dy, f, a in parts)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
{STYLE}
<rect width="1080" height="1080" fill="#F7F6F1"/>
<rect x="40" y="40" width="1000" height="1000" fill="none" stroke="#E5E7DA" stroke-width="2"/>
<g transform="translate(330,150) scale(4.375)">
  <circle cx="48" cy="50" r="42" fill="#F0F1E7"/>{i["svg"]}
</g>
{text}
<text x="540" y="986" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="26" letter-spacing="5" fill="#b4ada2">COPIUS</text>
<text x="540" y="1016" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="21" letter-spacing="2" fill="#a29c92">copius.fr</text>
</svg>'''


def tip_card(i):
    """Slide two: the handling note, set as type. The picture says what the
    ingredient is; this says what to do with it, which is the half a cook
    actually keeps."""
    e = lambda s: html.escape(s or "", quote=True)
    tip = re.sub(r"\\+(.)", r"\1", i["tip_fr"] or "")
    # Step the type down rather than cut the text: a tip's second sentence is
    # usually the one carrying the warning. The longest tip in the data (351
    # characters) settles on the third pair; the last is headroom.
    for size, cols in ((38, 40), (34, 45), (31, 50), (28, 55)):
        lines = balance(tip, cols)
        if len(lines) * size * 1.45 <= 360:
            break
    lh = round(size * 1.45)
    # Centre the whole stack, not the tip alone: a two-line tip under a fixed
    # header hangs in a void, and this is the same page either way.
    name, gloss = name_parts(i["fr"])
    tl, ts = title(name, 52)
    last = (len(tl) - 1) * round(ts * 1.1) + (52 if gloss else 0)  # last line of the name
    head = last + 236                            # name to first line of tip
    s = 555 - (head + (len(lines) - 1) * lh) / 2  # baseline of the name
    body = "".join(
        '<text x="540" y="%d" text-anchor="middle" font-family="Georgia,serif" '
        'font-size="%d" fill="#55524d">%s</text>' % (s + head + n * lh, size, e(l))
        for n, l in enumerate(lines))
    names = "".join(
        '<text x="540" y="%d" text-anchor="middle" font-family="Georgia,serif" '
        'font-size="%d" fill="#1c1a17">%s</text>' % (s + n * round(ts * 1.1), ts, e(l))
        for n, l in enumerate(tl)) + (
        '<text x="540" y="%d" text-anchor="middle" font-family="Georgia,serif" font-size="28" '
        'font-style="italic" fill="#8a857d">%s</text>' % (s + last, e(gloss)) if gloss else "")
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
{STYLE}
<rect width="1080" height="1080" fill="#F7F6F1"/>
<rect x="40" y="40" width="1000" height="1000" fill="none" stroke="#E5E7DA" stroke-width="2"/>
{names}
<line x1="470" y1="{s + last + 74}" x2="610" y2="{s + last + 74}" stroke="#E5E7DA" stroke-width="2"/>
<text x="540" y="{s + last + 136}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="22" letter-spacing="6" fill="#a29c92">EN CUISINE</text>
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
    """In French, the language of the account's audience (his call, 26 Sept
    2026), and without hashtags, which he does not use. Instagram captions carry
    no clickable link, so the site is named rather than linked."""
    un = lambda s: re.sub(r"\\+(.)", r"\1", s or "")
    # The health message high in the caption, not buried: Instagram hides
    # everything past the first couple of lines behind "... plus".
    return "\n".join([i["fr"], latin(i)] + ([EVIN] if is_alcohol(i) else []) + ["",
        un(i["story_fr"]), "",
        "\u2014 copius, l\u2019atlas des ingr\u00e9dients \u00b7 copius.fr",
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
