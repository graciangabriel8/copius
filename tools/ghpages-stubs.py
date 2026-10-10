#!/usr/bin/env python3
"""Write the old address's redirect pages: one per copius.fr sitemap URL, at the same path under
graciangabriel8.github.io/copius/, sending the reader (and its search ranking) to the page's new home.

The site lived on GitHub Pages before copius.fr; its pages are linked from places we cannot edit. The gh-pages
branch serves them now, and a missing path only ever got the 404 page, which redirects with a script but answers
404, so a crawler never followed it. Each page here answers 200 with a canonical, a meta refresh and a script.
The root page (index.html) and 404.html are the branch's own and left alone. A page there that is not one of these
stubs is never written over, and a stub whose URL left the sitemap is removed, so the branch follows the sitemap.

Run it on a checkout of the gh-pages branch after the sitemap gains URLs, then commit and push that branch:

    python3 tools/ghpages-stubs.py <gh-pages checkout>
"""
import html, json, pathlib, re, sys

if len(sys.argv) != 2: sys.exit("usage: ghpages-stubs.py <gh-pages checkout>")
OUT = pathlib.Path(sys.argv[1])
MARK = "Copius a déménagé"   # every page of the old address, the stubs included, carries it in its title
if not ((OUT / ".nojekyll").is_file() and MARK in (OUT / "index.html").read_text(encoding="utf-8")):
    sys.exit("%s is not the gh-pages checkout (no .nojekyll, or no « %s » root page)" % (OUT, MARK))
SITE = "https://copius.fr/"
urls = re.findall(r"<loc>([^<]+)</loc>", (pathlib.Path(__file__).resolve().parent.parent / "sitemap.xml").read_text())
if not urls or any(not u.startswith(SITE) for u in urls): sys.exit("sitemap.xml: no URLs, or one outside %s" % SITE)

PAGE = """<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Copius a déménagé · Copius has moved</title>
<link rel="canonical" href="%(u)s">
<meta http-equiv="refresh" content="0; url=%(u)s">
<script>location.replace(%(js)s + location.search + location.hash);</script>
</head>
<body><p>Cette page est maintenant à <a href="%(u)s">%(u)s</a>. · This page is now at <a href="%(u)s">%(u)s</a>.</p></body>
</html>
"""
def ours(p): return p.is_file() and MARK in p.read_text(encoding="utf-8")
wanted, written, kept = set(), 0, []
for u in urls:
    rel = u[len(SITE):]
    if not rel: continue                       # the root page is the branch's own
    page = OUT / rel / "index.html"
    wanted.add(page)
    if page.exists() and not ours(page): kept.append(str(page.relative_to(OUT))); continue
    page.parent.mkdir(parents=True, exist_ok=True)
    page.write_text(PAGE % {"u": html.escape(u), "js": json.dumps(u).replace("</", "<\\/")}, encoding="utf-8")
    written += 1
gone = [p for p in OUT.rglob("index.html") if p != OUT / "index.html" and ".git" not in p.parts and p not in wanted and ours(p)]
for p in gone:
    p.unlink()
    for d in p.parents:
        if d == OUT or any(d.iterdir()): break
        d.rmdir()
for k in kept: print("left alone, not a stub: " + k)
print("%d redirect pages written, %d removed, plus the root page: %d for %d sitemap URLs"
      % (written, len(gone), written + 1, len(urls)))
if kept: sys.exit(1)
