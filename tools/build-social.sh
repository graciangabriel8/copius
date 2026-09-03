#!/bin/sh
# Rebuild every Instagram card. macOS only — qlmanage is the rasteriser.
# Run after adding ingredients, then commit social/.
set -eu
cd "$(dirname "$0")/.."
rm -rf social
python3 tools/make-card.py --all
qlmanage -t -s 1080 -o social social/*.svg >/dev/null 2>&1
cd social
for f in *.svg.png; do
  sips -s format jpeg -s formatOptions 88 "$f" --out "${f%.svg.png}.jpg" >/dev/null 2>&1
done
rm -f -- *.svg.png *.svg
echo "built $(ls -1 ./*.jpg | wc -l | tr -d ' ') cards"
