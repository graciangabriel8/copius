#!/bin/sh
# Bump the asset version. Run this whenever you change data, CSS or JS,
# then commit. It updates the ?v=N on every asset AND the service worker
# cache name, so browsers and installed copies both pick up the change.
#
#   sh tools/bump.sh
set -e
cd "$(dirname "$0")/.."
# The public data first: js/free.js (the free version and the locked teaser) and
# the unpublished js/_premium.js, from tools/sources.txt. It refuses to write when
# a free id is missing from the data, and set -e then stops the bump before any
# version moves.
osascript -l JavaScript tools/build-free.js
python3 - <<'PY'
import pathlib, re
p = pathlib.Path("atlas.html"); t = p.read_text()
cur = int(re.search(r'\?v=(\d+)', t).group(1))
new = cur + 1
# The static pages link css/page.css with the same number; the generated pages
# read it from atlas.html at build time and need no rewrite.
for f in ("atlas.html", "about/index.html", "confidentialite/index.html", "404.html"):
    p = pathlib.Path(f)
    p.write_text(re.sub(r'\?v=\d+', '?v=%d' % new, p.read_text()))
print("asset version %d -> %d" % (cur, new))
PY
python3 tools/build-sw.py
# The dish pages are generated from this sidecar rather than from the JS, so it
# has to be rewritten whenever the data moves. It refuses to write on a bad id,
# a missing language or a pairing to an ingredient that does not exist, which
# stops any of those reaching a built page.
osascript -l JavaScript tools/dump-dishes.js
# The share card carries the counts. It drifted to 1 857 ingredients against a
# real 1 835 because it was a hand-made jpg with nothing pointing at the data.
python3 tools/build-og.py
# The public pages come from the same free list: rebuilt here, so moving an id to
# the full version can never leave its whole page online, and their ?v= follows.
python3 tools/build-pages.py
echo "done — commit and push to publish"
