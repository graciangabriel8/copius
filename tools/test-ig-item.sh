#!/bin/sh
# Test for tools/ig-item.sh with a fake curl: a download failure (2207052) is retried and then
# succeeds; any other error, and a download failure that never clears, fail without endless retries.
#   sh tools/test-ig-item.sh            exits 0 when all three cases hold
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
cat > "$T/curl" <<'EOF'
#!/bin/sh
# Answers in turn from $FAKE_ANSWERS (one JSON per line); counts calls in $FAKE_COUNT.
n=$(( $(cat "$FAKE_COUNT" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$FAKE_COUNT"
sed -n "${n}p" "$FAKE_ANSWERS"
EOF
chmod +x "$T/curl"
DL='{"error":{"message":"Only photo or video can be accepted as media type.","type":"OAuthException","code":9004,"error_subcode":2207052,"is_transient":false}}'
OK='{"id":"17999"}'
OTHER='{"error":{"message":"Invalid OAuth access token","type":"OAuthException","code":190}}'
fail=0
case_() {  # name, answers (newline-separated), expected exit, expected stdout, expected calls
    printf '%s\n' "$2" > "$T/answers"; rm -f "$T/count"
    out="$(PATH="$T:$PATH" FAKE_ANSWERS="$T/answers" FAKE_COUNT="$T/count" IG_RETRY_WAITS="0 0 0" \
        IG_USER_ID=1 IG_ACCESS_TOKEN=x sh "$HERE/ig-item.sh" https://copius.fr/social/x.jpg 2>/dev/null)"; rc=$?
    calls="$(cat "$T/count")"
    if [ "$rc" = "$3" ] && [ "$out" = "$4" ] && [ "$calls" = "$5" ]; then echo "ok   $1"
    else echo "FAIL $1: exit $rc (want $3), out '$out' (want '$4'), calls $calls (want $5)"; fail=1; fi
}
case_ "download failure, then the id"    "$DL
$OK" 0 17999 2
case_ "another error fails at once"      "$OTHER
$OK" 1 "" 1
case_ "download failure never clears"    "$DL
$DL
$DL
$DL
$OK" 1 "" 4
exit $fail
