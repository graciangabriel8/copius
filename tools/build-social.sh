#!/bin/sh
# Rebuild the Instagram cards. macOS only — qlmanage is the rasteriser.
# Renders the next N scheduled days (social/schedule.json) rather than all
# 1,857 entries: cards years out are dead weight in the repository. The
# schedule is fixed, so a data edit never invalidates a card; re-run when the
# window runs low, or after tools/build-schedule.py has appended days.
#   sh tools/build-social.sh [days]        (default 400)
#   sh tools/build-social.sh [days] en     the @copius.en cards, in social/en/ (no drinks)
set -eu
cd "$(dirname "$0")/.."
DAYS="${1:-400}"
DIR=social
LANG_ARG=""
if [ "${2:-}" = en ]; then DIR=social/en; LANG_ARG="--lang en"; fi
mkdir -p "$DIR"
rm -f "$DIR"/*.jpg "$DIR"/*.svg
# shellcheck disable=SC2086  # LANG_ARG is two words or none
python3 tools/make-card.py $LANG_ARG --window "$DAYS"
qlmanage -t -s 1080 -o "$DIR" "$DIR"/*.svg >/dev/null 2>&1
cd "$DIR"
for f in *.svg.png; do
  sips -s format jpeg -s formatOptions 40 "$f" --out "${f%.svg.png}.jpg" >/dev/null 2>&1
done
rm -f -- *.svg.png *.svg
echo "built $(ls -1 ./*.jpg | wc -l | tr -d ' ') slides ($(ls -1 ./*.2.jpg | wc -l | tr -d ' ') posts) covering $DAYS days in $DIR/"
