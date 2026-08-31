#!/bin/sh
# Bump the asset version. Run this whenever you change data, CSS or JS,
# then commit. It updates the ?v=N on every asset AND the service worker
# cache name, so browsers and installed copies both pick up the change.
#
#   sh tools/bump.sh
set -e
cd "$(dirname "$0")/.."
python3 - <<'PY'
import pathlib, re
p = pathlib.Path("index.html"); t = p.read_text()
cur = int(re.search(r'\?v=(\d+)', t).group(1))
new = cur + 1
p.write_text(re.sub(r'\?v=\d+', '?v=%d' % new, t))
print("asset version %d -> %d" % (cur, new))
PY
python3 tools/build-sw.py
echo "done — commit and push to publish"
