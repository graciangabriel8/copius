#!/bin/sh
# ig-item.sh <image_url>: one Instagram carousel-item container for the daily cards; prints its id.
#
# Retried only on Instagram's « Media download has failed » (code 9004, sub-code 2207052), after a
# pause per entry of IG_RETRY_WAITS (seconds, default "45 90 180"). From 17 to 21 Nov 2026 that error
# hit 9 of the cards' runs; OVH's access log shows Meta's fetch for the failed image never reached
# copius.fr (every card request that did reach it got 200 and the whole file), and the same URL went
# through on a later run. Any other answer fails at once, as before. Needs IG_USER_ID and
# IG_ACCESS_TOKEN; the token is never printed. IG_API overrides the endpoint (tests).
set -eu
IMG="$1"
API="${IG_API:-https://graph.instagram.com/v23.0}"
WAITS="${IG_RETRY_WAITS-45 90 180}"
try=0
while :; do
    ANS="$(curl -sS -X POST --max-time 120 "$API/$IG_USER_ID/media" \
        --data-urlencode "image_url=$IMG" -d "is_carousel_item=true" -d "access_token=$IG_ACCESS_TOKEN" || true)"
    VERDICT="$(printf '%s' "$ANS" | python3 -c 'import sys, json
try:
    d = json.load(sys.stdin)
except ValueError:
    print("other"); sys.exit()
if d.get("id"):
    print("id " + d["id"])
elif (d.get("error") or {}).get("error_subcode") == 2207052:
    print("download")
else:
    print("other")')"
    case "$VERDICT" in
        id\ *) echo "${VERDICT#id }"; exit 0 ;;
    esac
    try=$((try + 1))
    WAIT="$(echo "$WAITS" | awk -v n="$try" '{print $n}')"
    if [ "$VERDICT" != "download" ] || [ -z "$WAIT" ]; then
        echo "carousel item failed for $IMG after $try attempt(s): $(printf '%s' "$ANS" | head -c 400)" >&2
        exit 1
    fi
    echo "::warning::Instagram could not download $IMG (attempt $try); trying again in ${WAIT}s" >&2
    sleep "$WAIT"
done
