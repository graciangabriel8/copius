#!/bin/sh
# Rebuild the Instagram cards. macOS only — qlmanage is the rasteriser.
# Renders the next N scheduled days (social/schedule.json) rather than all
# 1,857 entries: cards years out are dead weight in the repository. The
# schedule is fixed, so a data edit never invalidates a card; re-run when the
# window runs low, or after tools/build-schedule.py has appended days.
#   sh tools/build-social.sh [days]        (default 400)
set -eu
cd "$(dirname "$0")/.."
DAYS="${1:-400}"
rm -f social/*.jpg social/*.svg
python3 tools/make-card.py --window "$DAYS"
qlmanage -t -s 1080 -o social social/*.svg >/dev/null 2>&1
cd social
for f in *.svg.png; do
  sips -s format jpeg -s formatOptions 40 "$f" --out "${f%.svg.png}.jpg" >/dev/null 2>&1
done
rm -f -- *.svg.png *.svg
echo "built $(ls -1 ./*.jpg | wc -l | tr -d ' ') cards covering $DAYS days"
