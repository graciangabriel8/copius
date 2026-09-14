#!/bin/zsh
# Pull raw Wikipedia extracts (no summariser in the loop) and print every
# sentence mentioning a Michelin distinction, so the text itself is read.
get() {
  local lang="$1" title="$2"
  local t=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$title")
  curl -s --retry 2 --retry-delay 2 -m 30 -H 'User-Agent: copius-audit/1.0' \
    "https://$lang.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=$t" \
  | python3 -c "
import json,sys,re
j=json.load(sys.stdin)
pg=list(j.get('query',{}).get('pages',{}).values() or [{}])[0]
x=pg.get('extract','')
if not x:
    print('   (no article:', pg.get('title'), ')'); raise SystemExit
seen=set()
for m in re.finditer(r'[^.\n]*(?:Michelin|étoile|stelle|estrella)[^.\n]*\.', x):
    s=' '.join(m.group(0).split())
    if s in seen: continue
    seen.add(s)
    if re.search(r'(three|two|one|trois|deux|tre|due|tres|dos|\b[123]\b)', s, re.I):
        print('   *', s[:250])
"
}
while IFS='|' read -r id lang title; do
  [ -z "$id" ] && continue
  echo "=== $id  [$lang: $title]"
  get "$lang" "$title"
done
