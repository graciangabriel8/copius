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
import json
import pathlib
import re
from collections import Counter, defaultdict
import shutil
import sys
import unicodedata
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = "atlas.html"
SITE = "https://copius.fr"

# The atlas is closed while it is being finished. Flip this to True on the day it
# opens and rebuild: it is the only thing standing between these pages and Google.
INDEXABLE = True

# A month page lists only genuinely narrow seasons. Mont d'Or runs September to May
# and the goat cheeses March to October — real seasons, but naming them as "what is
# in season in September" says almost nothing. Three months or fewer is the window
# where the month actually means something.
SEASON_MAX_MONTHS = 3

MONTHS = {
    "en": [None, "January", "February", "March", "April", "May", "June", "July",
           "August", "September", "October", "November", "December"],
    "fr": [None, "janvier", "février", "mars", "avril", "mai", "juin", "juillet",
           "août", "septembre", "octobre", "novembre", "décembre"],
}

I18N_FILE = "js/i18n.js"


def load_i18n():
    """Family and flavour labels, per language, from the file the atlas itself
    uses — one copy, so a page never files an ingredient under a name the atlas
    does not. Returns {"en": {"categories": {...}, "flavors": {...}}, "fr": ...}
    and the family order of the filter bar."""
    text = (ROOT / I18N_FILE).read_text()
    out = {}
    for lang in ("en", "fr"):
        m = re.search(r"^  %s: \{(.*?)^  \}" % lang, text, re.S | re.M)
        if not m:
            sys.exit("no %s block in %s — has the atlas moved its strings?" % (lang, I18N_FILE))
        out[lang] = {}
        for key in ("categories", "flavors"):
            blk = re.search(r"\b%s: \{(.*?)\}" % key, m.group(1), re.S)
            if not blk:
                sys.exit("no %s.%s in %s" % (lang, key, I18N_FILE))
            out[lang][key] = dict(re.findall(r'([a-z]+)\s*:\s*"([^"]*)"', blk.group(1)))
    order = re.search(r"CAT_ORDER = \[([^\]]*)\]", text)
    if not order:
        sys.exit("no CAT_ORDER in %s" % I18N_FILE)
    return out, re.findall(r'"([a-z]+)"', order.group(1))


I18N, CAT_ORDER, VERSION = {}, [], 0   # filled by main(); module-level so the templates can read them


def family(cat, lang):
    return I18N[lang]["categories"].get(cat, cat)


def family_order(cats):
    """Families in the order the atlas filter bar shows them; anything the atlas
    does not know goes last, alphabetically."""
    rank = {c: n for n, c in enumerate(CAT_ORDER)}
    return sorted(cats, key=lambda c: (rank.get(c, len(rank)), c))


UI = {
    "en": {"latin": "Latin name", "family": "Family", "origin": "Origin",
           "season": "Season (France)", "flavour": "Flavour", "story": "What it is",
           "tip": "In the kitchen", "pairs": "Goes with", "price": "Typical price (France)",
           "kin": "Same species", "near": "In season alongside", "alsoUsed": "Also used with",
           "altImg": "%s, drawn for Copius",
           "allYear": "All year", "back": "Open the atlas", "other": "En français",
           "rare": "Little known", "luxe": "Prestige",
           "tagline": "An illustrated atlas of cooking",
           "index": "All ingredients", "about": "About",
           "count": "%d ingredients · %d families",
           "fixLbl": "Something wrong here, or missing?",
           "fixCta": "Tell us",
           "fixSubj": "Correction — %s",
           "fixBody": "Page: %s\n\nWhat is wrong, or what is missing:\n\n"},
    "fr": {"latin": "Nom latin", "family": "Famille", "origin": "Origine",
           "season": "Saison", "flavour": "Goût", "story": "Ce que c’est",
           "tip": "En cuisine", "pairs": "S’accorde avec", "price": "Prix courant",
           "kin": "Même espèce", "near": "De saison en même temps", "alsoUsed": "Entre aussi avec",
           "altImg": "%s, dessiné pour Copius",
           "allYear": "Toute l’année", "back": "Ouvrir l’atlas", "other": "In English",
           "rare": "Méconnu", "luxe": "Prestige",
           "tagline": "Un atlas illustré de la cuisine",
           "index": "Tous les ingrédients", "about": "À propos",
           "count": "%d ingrédients · %d familles",
           "fixLbl": "Une erreur ici, ou un oubli ?",
           "fixCta": "Dites-le nous",
           "fixSubj": "Correction — %s",
           "fixBody": "Page : %s\n\nCe qui ne va pas, ou ce qui manque :\n\n"},
}


def unescape(s):
    return re.sub(r"\\+(.)", r"\1", s or "")


def version():
    """The ?v=N the atlas stamps on its assets. page.css carries the same number
    so a cache-first service worker lets a changed stylesheet through on the
    next bump, like every other asset."""
    m = re.search(r"\?v=(\d+)", (ROOT / APP).read_text())
    if not m:
        sys.exit("no ?v= marker in %s — has the asset versioning moved?" % APP)
    return int(m.group(1))


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


def correction_link(subject, url, lang):
    """A mailto, deliberately. No account, no moderation queue, and nothing that
    looks abandoned when nobody has written yet."""
    t = UI[lang]
    href = "mailto:contact@copius.fr?subject=%s&body=%s" % (
        urllib.parse.quote(t["fixSubj"] % subject),
        urllib.parse.quote(t["fixBody"] % url))
    return ('<p class="fix">%s <a href="%s">%s</a></p>'
            % (e(t["fixLbl"]), e(href), e(t["fixCta"])))


def head_extra(title, desc, url, lang):
    """Favicon from real files, not a data: URI — Google needs a crawlable URL to
    show an icon — plus the card that appears when the link is pasted anywhere."""
    return (
        '<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">\n'
        '<link rel="icon" sizes="192x192" href="/icons/icon-192.png">\n'
        '<meta property="og:type" content="article">\n'
        '<meta property="og:site_name" content="Copius">\n'
        '<meta property="og:title" content="%s">\n'
        '<meta property="og:description" content="%s">\n'
        '<meta property="og:url" content="%s">\n'
        '<meta property="og:locale" content="%s">\n'
        '<meta property="og:image" content="%s/og/copius.jpg">\n'
        '<meta property="og:image:width" content="1200">\n'
        '<meta property="og:image:height" content="630">\n'
        '<meta name="twitter:card" content="summary_large_image">\n'
        % (title, desc, url, "fr_FR" if lang == "fr" else "en_GB", SITE)
        + THEME_COLOR)


# Applied before first paint, so a visitor who chose dark in the atlas never sees
# a white flash here. The atlas stores the choice under this key.
THEME_SCRIPT = ('<script>try{var t=localStorage.getItem("copius-theme");'
                'if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}'
                'catch(e){}</script>')

# Browser chrome follows the page: the two --bg values of page.css.
THEME_COLOR = ('<meta name="theme-color" media="(prefers-color-scheme: light)" content="#fafafa">\n'
               '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#141413">')


def e(s):
    return html.escape(s or "", quote=True)


def json_ld(obj):
    """Structured data is JSON, not HTML: json.dumps escapes it, and the one
    sequence that could end the <script> early is neutralised by hand."""
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")


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


def page(i, lang, by_id, count, G):
    t, other = UI[lang], ("fr" if lang == "en" else "en")
    name, alt_name = i["name"][lang], i["name"][other]
    fam = family(i["cat"], lang)
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
            (t["flavour"], " · ".join(e(I18N[lang]["flavors"].get(f, f)) for f in i["flavor"])) if i["flavor"] else None,
            (t["price"], e(i["pk"])) if i["pk"] else None]
    facts = "".join("<tr><th>%s</th><td>%s</td></tr>" % (e(k), v)
                    for k, v in filter(None, rows))

    # Both trees put siblings next to each other, so one relative path serves both.
    # Same chip as the season pages and the atlas: the drawing is how an entry
    # is recognised before the name is read.
    def chip(x):
        r = by_id[x]
        return ('<a href="../%s/"><svg class="ci" viewBox="0 0 96 96" aria-hidden="true">'
                '<circle cx="48" cy="50" r="42" fill="none"/>%s</svg>%s</a>'
                % (x, r["svg"], e(r["name"][lang])))

    links = [chip(pid) for pid in i["pairs"] if pid in by_id]

    def linkrow(ids):
        return " ".join(chip(x) for x in ids)
    kin_ids, near_ids, back_ids = related(i, G)
    extra = "".join('<h2>%s</h2><p class="pairs">%s</p>' % (e(t[k]), linkrow(v))
                    for k, v in (("kin", kin_ids), ("alsoUsed", back_ids), ("near", near_ids)) if v)

    marks = "".join(' <span class="mk" title="%s">%s</span>' % (e(t[k]), s)
                    for k, s in (("rare", "✦"), ("luxe", "◆")) if i[k])

    robots = "" if INDEXABLE else '\n<meta name="robots" content="noindex,nofollow">'
    ld = json_ld({"@context": "https://schema.org", "@type": "Thing", "name": name,
                  "alternateName": alt_name, "description": desc, "url": here,
                  "isPartOf": {"@type": "WebSite", "name": "Copius", "url": SITE}})
    return """<!doctype html>
<html lang="%(lang)s">
<head>
<meta charset="utf-8">
%(theme)s
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>%(title)s</title>
<meta name="description" content="%(desc)s">%(robots)s
<link rel="canonical" href="%(here)s">
<link rel="alternate" hreflang="%(lang)s" href="%(here)s">
<link rel="alternate" hreflang="%(other)s" href="%(there)s">
<link rel="alternate" hreflang="x-default" href="%(xdef)s">
%(og)s
<link rel="stylesheet" href="%(up)scss/page.css?v=%(v)d">
<script type="application/ld+json">%(ld)s</script>
</head>
<body>
<header>
  <a class="home" href="%(up)s">Copius</a>
  <nav><a href="%(there)s">%(otherlbl)s</a> · <a href="%(up)s%(app)s">%(back)s</a><a class="ig-link" href="https://instagram.com/copius.fr" rel="me noopener" target="_blank" aria-label="Copius sur Instagram"><svg class="ig" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.2" cy="6.8" r="1.2" class="ig-dot"/></svg></a></nav>
</header>

<main>
  <figure><img src="%(art)s" alt="%(alt_img)s" width="104" height="104" decoding="async"></figure>
  <h1>%(name)s%(marks)s</h1>
  <p class="alt">%(alt)s</p>

  <table>%(facts)s</table>

  <h2>%(storylbl)s</h2>
  <p>%(story)s</p>

  %(tipblock)s

  %(pairblock)s
  %(extra)s

  %(fix)s
</main>

<footer>
  <a href="%(up)s%(idx)s">%(index)s</a> · <a href="%(up)s%(app)s">%(back)s</a> · <a href="%(up)sabout/">%(about)s</a><br>
  Copius — %(tagline)s · %(count)s
</footer>
</body>
</html>
""" % {
        # The other language's name belongs in the title: someone searching
        # "agretti" in France must be able to find the French page, which
        # otherwise never contains the word.
        "title": e(page_title(name, alt_name, fam)),
        "og": head_extra(e(page_title(name, alt_name, fam)), e(desc), here, lang),
        "art": "%simg/%s.svg" % (up, i["id"]),
        "alt_img": e(t["altImg"] % name),
        "lang": lang, "other": other, "name": e(name), "alt": e(alt_name),
        "fam": e(fam), "desc": e(desc), "robots": robots,
        "here": here, "there": there,
        "xdef": "%s/i/%s/" % (SITE, i["id"]),
        "up": up, "app": APP, "v": VERSION, "theme": THEME_SCRIPT, "ld": ld,
        "svg": i["svg"], "marks": marks, "facts": facts,
        "storylbl": e(t["story"]), "story": e(story),
        "tipblock": ("<h2>%s</h2><p>%s</p>" % (e(t["tip"]), e(tip))) if tip else "",
        "extra": extra,
        "pairblock": ('<h2>%s</h2><p class="pairs">%s</p>'
                      % (e(t["pairs"]), " ".join(links))) if links else "",
        "fix": correction_link(name, here, lang), "about": e(t["about"]),
        "otherlbl": e(t["other"]), "back": e(t["back"]), "index": e(t["index"]), "idx": index_href(lang),
        "tagline": e(t["tagline"]), "count": e(t["count"] % count),
    }


# The path from anywhere back to that language's own index. It was "i/" for
# both, so every French page's "Tous les ingrédients" resolved to the ENGLISH
# index and /fr/i/ — the sole hub for 1 835 French pages — was linked from
# nothing on the whole site.
# Three link blocks computed from fields the entries already carry. Half the
# atlas sat on a single inbound link — from /i/, a flat page of 1 835 — which
# is a list, not a graph.
#
# "Also used with" does the most work, and not for the obvious reason: it links
# a page to everything that pairs WITH it, so butter (paired by 477 entries)
# becomes a hub pointing back out at the obscure ones. Choosing the six by who
# has the fewest inbound links rather than alphabetically rescues 848 pages
# instead of 742, for exactly the same number of links.
KIN_MAX = NEAR_MAX = BACK_MAX = 6


# The illustrations were inline <svg>, which Google cannot index: its image
# documentation lists SVG among supported formats but indexes only what an
# <img src> points at, and says outright "Google doesn't index CSS images".
# So 1 835 original drawings were invisible to the one click channel an AI
# answer cannot intercept. Each is now also written as a standalone file.
#
# A file loaded through <img> cannot see the page's stylesheet, so it carries
# its own — including the dark variant. Strokes use --line, which the dark
# theme never overrides, so only the fills need swapping.
ART_STYLE = (
    "<style>"
    ".s{fill:none;stroke:#585853;stroke-width:3;stroke-linecap:round}"
    ".f1,.f3,.sf{fill:#f1f1f0;stroke:#585853;stroke-width:3;stroke-linejoin:round}"
    ".f2{fill:#e7e7e5;stroke:#585853;stroke-width:3;stroke-linejoin:round}"
    ".dot{fill:#585853}.bg{fill:#f1f1f0}"
    "@media(prefers-color-scheme:dark){"
    ".f1,.f3,.sf{fill:#242422}.f2{fill:#2c2c29}.bg{fill:#242422}}"
    "</style>")


def art_file(i):
    """One standalone, self-styled copy of the entry's drawing."""
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" '
            'width="104" height="104" role="img" aria-label="%s">%s'
            '<circle class="bg" cx="48" cy="50" r="42"/>%s</svg>'
            % (e(i["name"]["en"]), ART_STYLE, i["svg"]))


def genus_of(latin):
    """First word of a real binomial, accents folded. None for anything that is
    not one — 'Halite (NaCl)' and 'Bœuf — cuisse' must not form a family."""
    s = unicodedata.normalize("NFD", latin or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    m = re.match(r"([A-Z][a-z]+)\s+(?:x\s+)?[a-z]", s)
    return m.group(1).lower() if m else None


def link_graph(rows):
    """Everything the three blocks need, computed once for the whole build."""
    by_id = {i["id"]: i for i in rows}
    inbound, back, genus, month = Counter(), defaultdict(list), defaultdict(list), defaultdict(set)
    for i in rows:
        for p in i["pairs"]:
            if p in by_id and p != i["id"]:
                inbound[p] += 1
                back[p].append(i["id"])
        g = genus_of(i["latin"])
        if g:
            genus[g].append(i["id"])
        for m in i["season"]:
            month[m].add(i["id"])
    return {"by_id": by_id, "inbound": inbound, "back": back, "genus": genus, "month": month}


def related(i, G):
    """(kin, near, back) — ids only, deterministic, never the page itself."""
    by_id = G["by_id"]
    g = genus_of(i["latin"])
    kin = sorted(x for x in G["genus"].get(g, []) if x != i["id"])[:KIN_MAX] if g else []

    near = []
    flav, months = set(i["flavor"]), set(i["season"])
    if flav and months:
        cand = set().union(*[G["month"][m] for m in months]) - {i["id"]} - set(kin)
        scored = [(len(flav & set(by_id[c]["flavor"])), c) for c in cand]
        near = [c for s, c in sorted(scored, key=lambda x: (-x[0], x[1])) if s >= 2][:NEAR_MAX]

    seen = set(kin) | set(near) | set(i["pairs"])
    back = [x for x in sorted(G["back"].get(i["id"], []), key=lambda x: (G["inbound"][x], x))
            if x not in seen][:BACK_MAX]
    return kin, near, back


def page_title(name, alt_name, fam):
    if alt_name and alt_name.lower() != name.lower():
        return "%s (%s) — %s · Copius" % (name, alt_name, fam)
    return "%s — %s · Copius" % (name, fam)


def index_href(lang):
    return "i/" if lang == "en" else "fr/i/"


def index_page(rows, lang):
    t = UI[lang]
    up = "../" if lang == "en" else "../../"
    by_fam = {}
    for i in rows:
        by_fam.setdefault(i["cat"], []).append(i)
    blocks = []
    for cat in family_order(by_fam):
        items = sorted(by_fam[cat], key=lambda x: x["name"][lang].lower())
        blocks.append("<h2>%s <small>%d</small></h2><p class=\"pairs\">%s</p>" % (
            e(family(cat, lang)), len(items),
            " ".join('<a href="%s/">%s</a>' % (i["id"], e(i["name"][lang])) for i in items)))
    robots = "" if INDEXABLE else '\n<meta name="robots" content="noindex,nofollow">'
    return """<!doctype html>
<html lang="%s">
<head>
<meta charset="utf-8">
%s
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>%s — Copius</title>
<meta name="description" content="%s: %d %s.">%s
%s
<link rel="stylesheet" href="%scss/page.css?v=%d">
</head>
<body>
<header><a class="home" href="%s">Copius</a><nav><a href="%s%s">%s</a><a class="ig-link" href="https://instagram.com/copius.fr" rel="me noopener" target="_blank" aria-label="Copius sur Instagram"><svg class="ig" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.2" cy="6.8" r="1.2" class="ig-dot"/></svg></a></nav></header>
<main><h1>%s</h1>%s</main>
<footer>Copius — %s</footer>
</body>
</html>
""" % (lang, THEME_SCRIPT, e(t["index"]), e(t["tagline"]), len(rows), e(t["index"]).lower(),
       robots, THEME_COLOR, up, VERSION, up, up, APP, e(t["back"]), e(t["index"]),
       "".join(blocks), e(t["tagline"]))


SLUG = {
    "en": [None, "january", "february", "march", "april", "may", "june", "july",
           "august", "september", "october", "november", "december"],
    "fr": [None, "janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet",
           "aout", "septembre", "octobre", "novembre", "decembre"],
}

SEASON_UI = {
    "en": {"h1": "What is in season in %s",
           "title": "What is in season in %s — fruit, vegetables, fish and mushrooms",
           "lede": ("%d ingredients with a short season — three months or less — are at "
                    "their best in %s in France. Not only fruit and vegetables: the fish, "
                    "the mushrooms, the game and the cheeses have a season too."),
           "new": "New this month", "last": "Last month for",
           "newNote": "In season now and not in %s.",
           "lastNote": "In season now and gone in %s.",
           "all": "Everything in season in %s",
           "prev": "%s", "next": "%s", "months": "Every month",
           "none": "Nothing starts or ends this month.",
           "idxTitle": "What is in season, month by month",
           "idxLede": ("Twelve pages, one per month: what has a short season — three "
                       "months or less — and is at its best then in France, with what "
                       "arrives and what leaves."),
           "idxCount": "%d ingredients"},
    "fr": {"h1": "Produits de saison en %s",
           "title": "Produits de saison en %s — fruits, légumes, poissons et champignons",
           "lede": ("%d ingrédients à saison courte — trois mois ou moins — sont à leur "
                    "meilleur en %s en France. Pas seulement des fruits et des légumes : "
                    "les poissons, les champignons, le gibier et les fromages ont une "
                    "saison eux aussi."),
           "new": "Nouveau ce mois-ci", "last": "Dernier mois pour",
           "newNote": "De saison maintenant, pas en %s.",
           "lastNote": "De saison maintenant, plus en %s.",
           "all": "Tout ce qui est de saison en %s",
           "prev": "%s", "next": "%s", "months": "Tous les mois",
           "none": "Rien ne commence ni ne finit ce mois-ci.",
           "idxTitle": "Les produits de saison, mois par mois",
           "idxLede": ("Douze pages, une par mois : ce qui a une saison courte — trois "
                       "mois ou moins — et est à son meilleur à ce moment-là en France, "
                       "avec ce qui arrive et ce qui s’en va."),
           "idxCount": "%d ingrédients"},
}


# What each month actually feels like in a kitchen, written by hand. The month
# pages were 200 links and not one sentence — a list to crawl past, not a page
# to read. Kept out of this file because it is content, not code: edit
# tools/season-notes.json and rebuild. A month with no entry renders as before.
SEASON_NOTES = json.loads((ROOT / "tools" / "season-notes.json").read_text()) \
    if (ROOT / "tools" / "season-notes.json").exists() else {}


def season_page(month, lang, rows):
    """One month. The arrivals and departures are the part no calendar page has:
    they need every ingredient's whole season, not a list of what is available."""
    t, other = SEASON_UI[lang], ("fr" if lang == "en" else "en")
    ui = UI[lang]
    name = MONTHS[lang][month]
    prev_m, next_m = (month - 2) % 12 + 1, month % 12 + 1

    def url(m, lg):
        return ("%s/season/%s/" % (SITE, SLUG["en"][m]) if lg == "en"
                else "%s/fr/saison/%s/" % (SITE, SLUG["fr"][m]))

    here, there = url(month, lang), url(month, other)
    # Two different climbs: /season/<m>/ is two deep, /fr/saison/<m>/ is three.
    # `up` reaches the site root (css, atlas.html); `rel` reaches this language's
    # entry pages, which happen to be ../../i/ from both.
    up = "../../" if lang == "en" else "../../../"
    rel = "../../i/"

    now = [r for r in rows if month in r["season"]
           and 0 < len(r["season"]) <= SEASON_MAX_MONTHS]
    arriving = [r for r in now if prev_m not in r["season"]]
    leaving = [r for r in now if next_m not in r["season"]]

    def chips(items, rel):
        # The drawing rides along: 208 bytes of path each, and 360 names in a row
        # is a wall of text that nobody reads to the end.
        return " ".join(
            '<a href="%s%s/"><svg class="ci" viewBox="0 0 96 96" aria-hidden="true">'
            '<circle cx="48" cy="50" r="42" fill="none"/>%s</svg>%s</a>'
            % (rel, r["id"], r["svg"], e(r["name"][lang]))
            for r in sorted(items, key=lambda x: x["name"][lang].lower()))

    blocks = []
    if arriving:
        blocks.append('<h2>%s <small>%d</small></h2><p class="note">%s</p><p class="pairs">%s</p>'
                      % (e(t["new"]), len(arriving),
                         e(t["newNote"] % MONTHS[lang][prev_m]), chips(arriving, rel)))
    if leaving:
        blocks.append('<h2>%s <small>%d</small></h2><p class="note">%s</p><p class="pairs">%s</p>'
                      % (e(t["last"]), len(leaving),
                         e(t["lastNote"] % MONTHS[lang][next_m]), chips(leaving, rel)))

    by_fam = {}
    for r in now:
        by_fam.setdefault(r["cat"], []).append(r)
    fam_blocks = []
    for cat in family_order(by_fam):
        fam_blocks.append('<h3>%s <small>%d</small></h3><p class="pairs">%s</p>' % (
            e(family(cat, lang)),
            len(by_fam[cat]), chips(by_fam[cat], rel)))

    robots = "" if INDEXABLE else '\n<meta name="robots" content="noindex,nofollow">'
    return """<!doctype html>
<html lang="%(lang)s">
<head>
<meta charset="utf-8">
%(theme)s
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>%(title)s · Copius</title>
<meta name="description" content="%(lede)s">%(robots)s
<link rel="canonical" href="%(here)s">
<link rel="alternate" hreflang="%(lang)s" href="%(here)s">
<link rel="alternate" hreflang="%(other)s" href="%(there)s">
%(og)s
<link rel="stylesheet" href="%(up)scss/page.css?v=%(v)d">
</head>
<body>
<header>
  <a class="home" href="%(up)s">Copius</a>
  <nav><a href="%(there)s">%(otherlbl)s</a> · <a href="%(up)s%(app)s">%(back)s</a><a class="ig-link" href="https://instagram.com/copius.fr" rel="me noopener" target="_blank" aria-label="Copius sur Instagram"><svg class="ig" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.2" cy="6.8" r="1.2" class="ig-dot"/></svg></a></nav>
</header>

<main>
  <h1>%(h1)s</h1>
  <p class="lede">%(lede)s</p>
  %(note)s
  %(blocks)s
  <h2>%(alllbl)s</h2>
  %(fams)s

  %(fix)s
</main>

<footer>
  <a href="%(prevurl)s">← %(prev)s</a> · <a href="../">%(months)s</a> · <a href="%(nexturl)s">%(next)s →</a><br>
  <a href="%(up)s%(idx)s">%(index)s</a> · <a href="%(up)s%(app)s">%(back)s</a> · <a href="%(up)sabout/">%(about)s</a>
</footer>
</body>
</html>
""" % {
        "og": head_extra(e(t["title"] % name), e(t["lede"] % (len(now), name)), here, lang),
        "lang": lang, "other": other, "up": up, "app": APP, "v": VERSION, "theme": THEME_SCRIPT,
        "title": e(t["title"] % name), "h1": e(t["h1"] % name), "months": e(t["months"]),
        "lede": e(t["lede"] % (len(now), name)),
        "note": ("<p class=\"month-note\">%s</p>"
                 % e(SEASON_NOTES.get(str(month), {}).get(lang, ""))
                 if SEASON_NOTES.get(str(month), {}).get(lang) else ""),
        "robots": robots, "here": here, "there": there,
        "blocks": "".join(blocks) or "<p>%s</p>" % e(t["none"]),
        "alllbl": e(t["all"] % name), "fams": "".join(fam_blocks),
        "prevurl": url(prev_m, lang), "nexturl": url(next_m, lang),
        "prev": e(MONTHS[lang][prev_m]), "next": e(MONTHS[lang][next_m]),
        "fix": correction_link(t["h1"] % name, here, lang), "about": e(UI[lang]["about"]),
        "otherlbl": e(ui["other"]), "back": e(ui["back"]), "index": e(ui["index"]), "idx": index_href(lang),
    }


def season_index(lang, rows):
    """The twelve months, so the header's season link has somewhere to land
    before the script points it at the current month."""
    t, other = SEASON_UI[lang], ("fr" if lang == "en" else "en")
    ui = UI[lang]
    here = "%s/season/" % SITE if lang == "en" else "%s/fr/saison/" % SITE
    there = "%s/fr/saison/" % SITE if lang == "en" else "%s/season/" % SITE
    up = "../" if lang == "en" else "../../"
    months = " ".join(
        '<a href="%s/">%s <small>%s</small></a>'
        % (SLUG[lang][m], e(MONTHS[lang][m]),
           e(t["idxCount"] % sum(1 for r in rows if m in r["season"]
                                 and 0 < len(r["season"]) <= SEASON_MAX_MONTHS)))
        for m in range(1, 13))
    robots = "" if INDEXABLE else '\n<meta name="robots" content="noindex,nofollow">'
    return """<!doctype html>
<html lang="%(lang)s">
<head>
<meta charset="utf-8">
%(theme)s
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>%(title)s · Copius</title>
<meta name="description" content="%(lede)s">%(robots)s
<link rel="canonical" href="%(here)s">
<link rel="alternate" hreflang="%(lang)s" href="%(here)s">
<link rel="alternate" hreflang="%(other)s" href="%(there)s">
%(og)s
<link rel="stylesheet" href="%(up)scss/page.css?v=%(v)d">
</head>
<body>
<header>
  <a class="home" href="%(up)s">Copius</a>
  <nav><a href="%(there)s">%(otherlbl)s</a> · <a href="%(up)s%(app)s">%(back)s</a><a class="ig-link" href="https://instagram.com/copius.fr" rel="me noopener" target="_blank" aria-label="Copius sur Instagram"><svg class="ig" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.2" cy="6.8" r="1.2" class="ig-dot"/></svg></a></nav>
</header>

<main>
  <h1>%(title)s</h1>
  <p class="lede">%(lede)s</p>
  <p class="pairs">%(months)s</p>
</main>

<footer>
  <a href="%(up)s%(idx)s">%(index)s</a> · <a href="%(up)s%(app)s">%(back)s</a> · <a href="%(up)sabout/">%(about)s</a>
</footer>
</body>
</html>
""" % {
        "og": head_extra(e(t["idxTitle"]), e(t["idxLede"]), here, lang),
        "lang": lang, "other": other, "up": up, "app": APP, "v": VERSION, "theme": THEME_SCRIPT,
        "title": e(t["idxTitle"]), "lede": e(t["idxLede"]), "robots": robots,
        "here": here, "there": there, "months": months, "about": e(ui["about"]),
        "otherlbl": e(ui["other"]), "back": e(ui["back"]), "index": e(ui["index"]), "idx": index_href(lang),
    }


CSS = """/* Copius — ingredient pages. Generated pages share this one file rather than
   inlining it 3,714 times. Same tokens as the atlas. */
:root{--bg:#fafafa;--card:#fff;--border:#e7e7e5;--ink:#1f1f1e;--ink-2:#55554f;
  --ink-3:#8a8a84;--plate:#f1f1f0;--line:#585853;
  --serif:Georgia,"Iowan Old Style","Times New Roman",serif;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
/* Dark twice: once for the system setting, once for the choice made in the atlas,
   which wins either way. */
:root[data-theme="dark"]{--bg:#141413;--card:#1c1c1a;--border:#2c2c29;
  --ink:#eceae5;--ink-2:#b6b3ac;--ink-3:#87847d;--plate:#242422;--line:#b8b5ae}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#141413;--card:#1c1c1a;
  --border:#2c2c29;--ink:#eceae5;--ink-2:#b6b3ac;--ink-3:#87847d;--plate:#242422;--line:#b8b5ae}}
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
/* the little drawing inside a chip: same line art as the entry page, at 22px,
   where stroke-width has to grow or the strokes vanish */
.ci{width:22px;height:22px;flex:none;margin:-2px 6px -2px -4px;vertical-align:-5px}
.ci .f1,.ci .f2,.ci .sf{fill:var(--plate);stroke:var(--ink-3);stroke-width:5;
  stroke-linejoin:round}
.ci .f2{fill:var(--border)}
.ci .s{fill:none;stroke:var(--ink-3);stroke-width:5;stroke-linecap:round}
.ci .dot{fill:var(--ink-3)}
.pairs a{display:inline-flex;align-items:center}
.pairs a:hover .ci .f1,.pairs a:hover .ci .f2,.pairs a:hover .ci .sf,
.pairs a:hover .ci .s{stroke:var(--ink)}
.pairs a:hover .ci .dot{fill:var(--ink)}
h2 small{color:var(--ink-3);font-size:14px}
.ig-link{display:inline-flex;align-items:center;vertical-align:-6px;margin-left:9px;
  padding:4px;border-radius:8px;line-height:0;text-decoration:none}
.ig{width:18px;height:18px;fill:none;stroke:var(--ink-3);stroke-width:1.8}
.ig-dot{fill:var(--ink-3);stroke:none}
.ig-link:hover .ig{stroke:var(--ink)}
.ig-link:hover .ig-dot{fill:var(--ink)}
footer{padding:24px 20px 48px;margin-top:26px;border-top:1px solid var(--border);
  font-size:13.5px;color:var(--ink-3);line-height:1.9}
h3{font:400 16px/1.3 var(--sans);margin:20px 0 7px;color:var(--ink-3);
  letter-spacing:.4px;text-transform:uppercase}
h3 small{text-transform:none;letter-spacing:0}
.lede{margin:0 0 22px;font:400 18px/1.5 var(--serif);color:var(--ink-2)}
.note{margin:-2px 0 9px;font-size:13.5px;color:var(--ink-3)}
.fix{margin:30px 0 0;padding:14px 16px;background:var(--card);
  border:1px solid var(--border);border-radius:12px;font-size:14.5px;color:var(--ink-3)}
.fix a{color:var(--ink-2)}
@media (max-width:420px){h1{font-size:29px}th{width:44%;font-size:12px}}
"""


def main():
    global I18N, CAT_ORDER, VERSION
    I18N, CAT_ORDER = load_i18n()
    VERSION = version()
    rows = load()
    by_id = {i["id"]: i for i in rows}
    count = (len(rows), len({i["cat"] for i in rows}))
    G = link_graph(rows)

    for d in ("i", "fr"):
        shutil.rmtree(ROOT / d, ignore_errors=True)
    (ROOT / "css").mkdir(exist_ok=True)
    (ROOT / "css" / "page.css").write_text(CSS)

    art = ROOT / "img"
    shutil.rmtree(art, ignore_errors=True)
    art.mkdir(exist_ok=True)
    for i in rows:
        (art / ("%s.svg" % i["id"])).write_text(art_file(i))

    written = 0
    for i in rows:
        for lang in ("en", "fr"):
            out = ROOT / ("i/%s" % i["id"] if lang == "en" else "fr/i/%s" % i["id"])
            out.mkdir(parents=True, exist_ok=True)
            (out / "index.html").write_text(page(i, lang, by_id, count, G))
            written += 1

    (ROOT / "i" / "index.html").write_text(index_page(rows, "en"))
    (ROOT / "fr" / "i" / "index.html").write_text(index_page(rows, "fr"))

    # Twelve pages built from the one field an encyclopaedia does not carry.
    shutil.rmtree(ROOT / "season", ignore_errors=True)
    shutil.rmtree(ROOT / "fr" / "saison", ignore_errors=True)
    months = 0
    for m in range(1, 13):
        for lang in ("en", "fr"):
            out = (ROOT / "season" / SLUG["en"][m] if lang == "en"
                   else ROOT / "fr" / "saison" / SLUG["fr"][m])
            out.mkdir(parents=True, exist_ok=True)
            (out / "index.html").write_text(season_page(m, lang, rows))
            months += 1
    (ROOT / "season" / "index.html").write_text(season_index("en", rows))
    (ROOT / "fr" / "saison" / "index.html").write_text(season_index("fr", rows))

    # A sitemap is how 3,714 pages get discovered without a link from anywhere.
    today = datetime.date.today().isoformat()
    urls = ["%s/" % SITE, "%s/i/" % SITE, "%s/fr/i/" % SITE, "%s/about/" % SITE,
            "%s/season/" % SITE, "%s/fr/saison/" % SITE]
    for m in range(1, 13):
        urls += ["%s/season/%s/" % (SITE, SLUG["en"][m]),
                 "%s/fr/saison/%s/" % (SITE, SLUG["fr"][m])]
    for i in rows:
        urls += ["%s/i/%s/" % (SITE, i["id"]), "%s/fr/i/%s/" % (SITE, i["id"])]
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join("<url><loc>%s</loc><lastmod>%s</lastmod></url>\n" % (u, today) for u in urls)
        + "</urlset>\n")

    print('{"ingredientPages": %d, "seasonPages": %d, "indexes": 4, '
          '"sitemapUrls": %d, "indexable": %s}'
          % (written, months, len(urls), "true" if INDEXABLE else "false"))
    if not INDEXABLE:
        print("# every page carries noindex — flip INDEXABLE in this file when the atlas opens")


if __name__ == "__main__":
    main()
