#!/usr/bin/env python3
"""Write one real HTML page per ingredient, in each language.

The atlas is a single page that renders 1,857 entries from JavaScript, so a
search engine receives 8 KB of shell and no ingredients at all. These pages are
the same data with the text actually in the HTML, at a URL of its own:

    i/verjus-rouge/       English
    fr/i/verjus-rouge/    French

Run:  python3 tools/build-pages.py
"""
import datetime
import html
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = "atlas.html"
SITE = "https://copius.fr"

# The atlas is closed while it is being finished. Flip this to True on the day it
# opens and rebuild: it is the only thing standing between these pages and Google.
INDEXABLE = False

MONTHS = {
    "en": [None, "January", "February", "March", "April", "May", "June", "July",
           "August", "September", "October", "November", "December"],
    "fr": [None, "janvier", "février", "mars", "avril", "mai", "juin", "juillet",
           "août", "septembre", "octobre", "novembre", "décembre"],
}

FAMILY = {
    "cellar": ("Cellar", "Cave"), "condiments": ("Condiments", "Condiments"),
    "cuts": ("Cuts", "Morceaux"), "dairy": ("Dairy", "Crèmerie"),
    "fats": ("Fats", "Matières grasses"), "fruits": ("Fruit", "Fruits"),
    "grains": ("Grains", "Céréales"), "herbs": ("Herbs", "Herbes"),
    "infusions": ("Infusions", "Infusions"), "legumes": ("Pulses", "Légumineuses"),
    "meat": ("Meat", "Viandes"), "mushrooms": ("Mushrooms", "Champignons"),
    "nuts": ("Nuts", "Fruits secs"), "roe": ("Roe & caviar", "Œufs de poisson & caviar"),
    "seafood": ("Fish", "Poissons"), "seaweed": ("Seaweed", "Algues"),
    "shellfish": ("Shellfish", "Coquillages & crustacés"), "spices": ("Spices", "Épices"),
    "sweet": ("Sweet", "Sucré"), "texture": ("Texture", "Texture"),
    "vegetables": ("Vegetables", "Légumes"),
}

UI = {
    "en": {"latin": "Latin name", "family": "Family", "origin": "Origin",
           "season": "Season", "flavour": "Flavour", "story": "What it is",
           "tip": "In the kitchen", "pairs": "Goes with", "price": "Typical price",
           "allYear": "All year", "back": "Open the atlas", "other": "En français",
           "rare": "Little known", "luxe": "Prestige",
           "tagline": "An illustrated atlas of cooking",
           "index": "All ingredients"},
    "fr": {"latin": "Nom latin", "family": "Famille", "origin": "Origine",
           "season": "Saison", "flavour": "Goût", "story": "Ce que c’est",
           "tip": "En cuisine", "pairs": "S’accorde avec", "price": "Prix courant",
           "allYear": "Toute l’année", "back": "Ouvrir l’atlas", "other": "In English",
           "rare": "Méconnu", "luxe": "Prestige",
           "tagline": "Un atlas illustré de la cuisine",
           "index": "Tous les ingrédients"},
}


def unescape(s):
    return re.sub(r"\\+(.)", r"\1", s or "")


def load():
    """Every entry, with every field the pages need. Same source of truth as the
    app: the data files it lists, in the order it lists them."""
    idx = (ROOT / APP).read_text()
    files = [f for f in re.findall(r'src="js/(data-[a-z-]+\.js)\?', idx)
             if "chefs" not in f and "trees" not in f]
    if not files:
        sys.exit("no data files listed in %s — has the app moved?" % APP)

    rows = []
    for fn in files:
        text = (ROOT / "js" / fn).read_text()
        for blk in re.findall(r'^\{id:".*?(?=^\{id:"|\n\s*\]|\Z)', text, re.S | re.M):
            m = re.match(r'\{id:"([a-z0-9-]+)",\s*cat:"([a-z]+)"', blk)
            if not m:
                continue

            def one(pat, default=""):
                x = re.search(pat, blk, re.S)
                return x.group(1) if x else default

            def lst(pat):
                x = re.search(pat, blk, re.S)
                return re.findall(r'"([^"]*)"', x.group(1)) if x else []

            season = re.search(r"season:\[([0-9,\s]*)\]", blk)
            rows.append({
                "id": m.group(1), "cat": m.group(2),
                "rare": "rare:true" in blk, "luxe": "luxe:true" in blk,
                "pk": one(r'pk:"([^"]*)"'),
                "name": {"en": one(r'name:\{en:"([^"]*)"'),
                         "fr": one(r'name:\{[^}]*fr:"([^"]*)"')},
                "latin": one(r'latin:"([^"]*)"'),
                "origin": {"en": one(r'origin:\{en:"([^"]*)"'),
                           "fr": one(r'origin:\{[^}]*fr:"([^"]*)"')},
                "season": [int(x) for x in season.group(1).split(",") if x.strip()] if season else [],
                "flavor": lst(r"flavor:\[([^\]]*)\]"),
                "story": {"en": unescape(one(r'story:\{en:"((?:[^"\\]|\\.)*)"')),
                          "fr": unescape(one(r'story:\{[^}]*?fr:"((?:[^"\\]|\\.)*)"'))},
                "tip": {"en": unescape(one(r'tip:\{en:"((?:[^"\\]|\\.)*)"')),
                        "fr": unescape(one(r'tip:\{[^}]*?fr:"((?:[^"\\]|\\.)*)"'))},
                "pairs": lst(r"pairs:\[([^\]]*)\]"),
                "svg": one(r"svg:'(.*?)'\s*\}"),
            })
    return rows


def e(s):
    return html.escape(s or "", quote=True)


def season_text(months, lang):
    if not months:
        return UI[lang]["allYear"]
    names = MONTHS[lang]
    # Contiguous runs read as a range; December-to-February has to wrap.
    ms = sorted(months)
    runs, run = [], [ms[0]]
    for a, b in zip(ms, ms[1:]):
        if b == a + 1:
            run.append(b)
        else:
            runs.append(run)
            run = [b]          # a new list, not the old one cleared: appending a
    runs.append(run)           # reference and then emptying it aliases every run
    if len(runs) == 2 and runs[0][0] == 1 and runs[-1][-1] == 12:
        runs = [runs[-1] + runs[0]]                      # a winter season, unwrapped
    out = []
    for r in runs:
        out.append(names[r[0]] if len(r) == 1 else "%s – %s" % (names[r[0]], names[r[-1]]))
    return ", ".join(out)


def page(i, lang, by_id, count):
    t, other = UI[lang], ("fr" if lang == "en" else "en")
    name, alt_name = i["name"][lang], i["name"][other]
    fam = FAMILY.get(i["cat"], (i["cat"], i["cat"]))[0 if lang == "en" else 1]
    here = "%s/i/%s/" % (SITE, i["id"]) if lang == "en" else "%s/fr/i/%s/" % (SITE, i["id"])
    there = "%s/fr/i/%s/" % (SITE, i["id"]) if lang == "en" else "%s/i/%s/" % (SITE, i["id"])
    up = "../../" if lang == "en" else "../../../"

    story = i["story"][lang] or i["story"][other]
    tip = i["tip"][lang] or i["tip"][other]
    desc = re.sub(r"\s+", " ", story)[:155].rsplit(" ", 1)[0] + "…"

    rows = [(t["latin"], "<i>%s</i>" % e(i["latin"])) if i["latin"] else None,
            (t["family"], e(fam)),
            (t["origin"], e(i["origin"][lang] or i["origin"][other])) if i["origin"][lang] or i["origin"][other] else None,
            (t["season"], e(season_text(i["season"], lang))),
            (t["flavour"], " · ".join(e(f) for f in i["flavor"])) if i["flavor"] else None,
            (t["price"], e(i["pk"])) if i["pk"] else None]
    facts = "".join("<tr><th>%s</th><td>%s</td></tr>" % (e(k), v)
                    for k, v in filter(None, rows))

    # Both trees put siblings next to each other, so one relative path serves both.
    links = ['<a href="../%s/">%s</a>' % (pid, e(by_id[pid]["name"][lang]))
             for pid in i["pairs"] if pid in by_id]

    marks = "".join(' <span class="mk" title="%s">%s</span>' % (e(t[k]), s)
                    for k, s in (("rare", "✦"), ("luxe", "◆")) if i[k])

    robots = "" if INDEXABLE else '\n<meta name="robots" content="noindex,nofollow">'
    return """<!doctype html>
<html lang="%(lang)s">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>%(name)s — %(fam)s · Copius</title>
<meta name="description" content="%(desc)s">%(robots)s
<link rel="canonical" href="%(here)s">
<link rel="alternate" hreflang="%(lang)s" href="%(here)s">
<link rel="alternate" hreflang="%(other)s" href="%(there)s">
<link rel="alternate" hreflang="x-default" href="%(xdef)s">
<link rel="stylesheet" href="%(up)scss/page.css">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Thing","name":"%(jname)s","alternateName":"%(jalt)s","description":"%(jdesc)s","url":"%(here)s","isPartOf":{"@type":"WebSite","name":"Copius","url":"%(site)s"}}
</script>
</head>
<body>
<header>
  <a class="home" href="%(up)s">Copius</a>
  <nav><a href="%(there)s">%(otherlbl)s</a> · <a href="%(up)s%(app)s">%(back)s</a></nav>
</header>

<main>
  <figure><svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="50" r="42" fill="#f1f1f0"/>%(svg)s</svg></figure>
  <h1>%(name)s%(marks)s</h1>
  <p class="alt">%(alt)s</p>

  <table>%(facts)s</table>

  <h2>%(storylbl)s</h2>
  <p>%(story)s</p>

  %(tipblock)s

  %(pairblock)s
</main>

<footer>
  <a href="%(up)si/">%(index)s</a> · <a href="%(up)s%(app)s">%(back)s</a><br>
  Copius — %(tagline)s · %(count)s
</footer>
</body>
</html>
""" % {
        "lang": lang, "other": other, "name": e(name), "alt": e(alt_name),
        "fam": e(fam), "desc": e(desc), "robots": robots,
        "here": here, "there": there,
        "xdef": "%s/i/%s/" % (SITE, i["id"]),
        "up": up, "app": APP, "site": SITE,
        "jname": e(name), "jalt": e(alt_name), "jdesc": e(desc),
        "svg": i["svg"], "marks": marks, "facts": facts,
        "storylbl": e(t["story"]), "story": e(story),
        "tipblock": ("<h2>%s</h2><p>%s</p>" % (e(t["tip"]), e(tip))) if tip else "",
        "pairblock": ('<h2>%s</h2><p class="pairs">%s</p>'
                      % (e(t["pairs"]), " ".join(links))) if links else "",
        "otherlbl": e(t["other"]), "back": e(t["back"]), "index": e(t["index"]),
        "tagline": e(t["tagline"]), "count": count,
    }


def index_page(rows, lang):
    t = UI[lang]
    up = "../" if lang == "en" else "../../"
    by_fam = {}
    for i in rows:
        by_fam.setdefault(i["cat"], []).append(i)
    blocks = []
    for cat in sorted(by_fam, key=lambda c: FAMILY.get(c, (c, c))[0 if lang == "en" else 1]):
        items = sorted(by_fam[cat], key=lambda x: x["name"][lang].lower())
        blocks.append("<h2>%s <small>%d</small></h2><p class=\"pairs\">%s</p>" % (
            e(FAMILY.get(cat, (cat, cat))[0 if lang == "en" else 1]), len(items),
            " ".join('<a href="%s/">%s</a>' % (i["id"], e(i["name"][lang])) for i in items)))
    robots = "" if INDEXABLE else '\n<meta name="robots" content="noindex,nofollow">'
    return """<!doctype html>
<html lang="%s">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>%s — Copius</title>
<meta name="description" content="%s: %d %s.">%s
<link rel="stylesheet" href="%scss/page.css">
</head>
<body>
<header><a class="home" href="%s">Copius</a><nav><a href="%s%s">%s</a></nav></header>
<main><h1>%s</h1>%s</main>
<footer>Copius — %s</footer>
</body>
</html>
""" % (lang, e(t["index"]), e(t["tagline"]), len(rows), e(t["index"]).lower(), robots,
       up, up, up, APP, e(t["back"]), e(t["index"]), "".join(blocks), e(t["tagline"]))


CSS = """/* Copius — ingredient pages. Generated pages share this one file rather than
   inlining it 3,714 times. Same tokens as the atlas. */
:root{--bg:#fafafa;--card:#fff;--border:#e7e7e5;--ink:#1f1f1e;--ink-2:#55554f;
  --ink-3:#8a8a84;--plate:#f1f1f0;--line:#585853;
  --serif:Georgia,"Iowan Old Style","Times New Roman",serif;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--card:#1c1c1a;--border:#2c2c29;
  --ink:#eceae5;--ink-2:#b6b3ac;--ink-3:#87847d;--plate:#242422;--line:#b8b5ae}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.62 var(--sans);
  -webkit-font-smoothing:antialiased}
header,main,footer{max-width:660px;margin-inline:auto;padding-inline:20px}
header{display:flex;justify-content:space-between;align-items:baseline;gap:16px;
  padding-top:20px;padding-bottom:18px;border-bottom:1px solid var(--border);flex-wrap:wrap}
.home{font:400 24px/1 var(--serif);text-decoration:none;color:var(--ink)}
nav{font-size:14px;color:var(--ink-3)}
a{color:var(--ink-2);text-underline-offset:3px;text-decoration-color:var(--border)}
a:hover{color:var(--ink);text-decoration-color:var(--ink-3)}
main{padding-top:26px;padding-bottom:10px}
figure{margin:0 0 14px;width:104px;height:104px}
figure svg{width:104px;height:104px}
figure circle{fill:var(--plate)}
figure .f1,figure .f2,figure .sf{fill:var(--plate);stroke:var(--line);stroke-width:3;
  stroke-linejoin:round}
figure .f2{fill:var(--border)}
figure .s{fill:none;stroke:var(--line);stroke-width:3;stroke-linecap:round}
figure .dot{fill:var(--line)}
h1{font:400 34px/1.15 var(--serif);margin:0 0 2px}
.mk{font-size:19px;color:var(--ink-3)}
.alt{margin:0 0 22px;font:italic 400 19px/1.3 var(--serif);color:var(--ink-3)}
h2{font:400 20px/1.3 var(--serif);margin:26px 0 8px}
p{margin:0 0 14px;color:var(--ink-2)}
table{width:100%;border-collapse:collapse;background:var(--card);
  border:1px solid var(--border);border-radius:12px;overflow:hidden;margin:0 0 6px}
th,td{text-align:left;padding:9px 14px;border-bottom:1px solid var(--border);font-weight:400}
tr:last-child th,tr:last-child td{border-bottom:0}
th{width:38%;color:var(--ink-3);font-size:13px;letter-spacing:.5px;text-transform:uppercase;
  vertical-align:top;padding-top:12px}
td{color:var(--ink)}
.pairs{display:flex;flex-wrap:wrap;gap:7px}
.pairs a{background:var(--card);border:1px solid var(--border);border-radius:999px;
  padding:4px 12px;font-size:14px;text-decoration:none;color:var(--ink-2)}
.pairs a:hover{border-color:var(--ink-3);color:var(--ink)}
h2 small{color:var(--ink-3);font-size:14px}
footer{padding:24px 20px 48px;margin-top:26px;border-top:1px solid var(--border);
  font-size:13.5px;color:var(--ink-3);line-height:1.9}
@media (max-width:420px){h1{font-size:29px}th{width:44%;font-size:12px}}
"""


def main():
    rows = load()
    by_id = {i["id"]: i for i in rows}
    count = "%d ingredients · %d families" % (len(rows), len({i["cat"] for i in rows}))

    for d in ("i", "fr"):
        shutil.rmtree(ROOT / d, ignore_errors=True)
    (ROOT / "css").mkdir(exist_ok=True)
    (ROOT / "css" / "page.css").write_text(CSS)

    written = 0
    for i in rows:
        for lang in ("en", "fr"):
            out = ROOT / ("i/%s" % i["id"] if lang == "en" else "fr/i/%s" % i["id"])
            out.mkdir(parents=True, exist_ok=True)
            (out / "index.html").write_text(page(i, lang, by_id, count))
            written += 1

    (ROOT / "i" / "index.html").write_text(index_page(rows, "en"))
    (ROOT / "fr" / "i" / "index.html").write_text(index_page(rows, "fr"))

    # A sitemap is how 3,714 pages get discovered without a link from anywhere.
    today = datetime.date.today().isoformat()
    urls = ["%s/i/" % SITE, "%s/fr/i/" % SITE]
    for i in rows:
        urls += ["%s/i/%s/" % (SITE, i["id"]), "%s/fr/i/%s/" % (SITE, i["id"])]
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join("<url><loc>%s</loc><lastmod>%s</lastmod></url>\n" % (u, today) for u in urls)
        + "</urlset>\n")

    print('{"pages": %d, "indexes": 2, "sitemapUrls": %d, "indexable": %s}'
          % (written, len(urls), "true" if INDEXABLE else "false"))
    if not INDEXABLE:
        print("# every page carries noindex — flip INDEXABLE in this file when the atlas opens")


if __name__ == "__main__":
    main()
