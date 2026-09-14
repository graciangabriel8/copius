#!/bin/zsh
# Pull a raw Wikipedia extract and print sentences matching a pattern.
# No summariser: the article's own words are what gets read.
get() {
  local lang="$1" title="$2" pat="$3"
  local t=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$title")
  curl -s --retry 2 --retry-delay 2 -m 30 -H 'User-Agent: copius-audit/1.0' \
    "https://$lang.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=$t" \
  | python3 -c "
import json,sys,re
pat=sys.argv[1]
try: j=json.load(sys.stdin)
except Exception: print('   (fetch failed)'); raise SystemExit
pg=list(j.get('query',{}).get('pages',{}).values() or [{}])[0]
x=pg.get('extract','')
if not x: print('   (no article:',pg.get('title'),')'); raise SystemExit
seen=set(); n=0
for m in re.finditer(r'[^.\n]*(?:'+pat+r')[^.\n]*\.', x, re.I):
    s=' '.join(m.group(0).split())
    if s in seen: continue
    seen.add(s); n+=1
    print('   *', s[:280])
    if n>=6: break
if n==0: print('   (article found, no sentence matches)')
" "$pat"
}
while IFS='|' read -r id lang title pat; do
  [ -z "$id" ] && continue
  echo "=== $id  [$lang: $title]"
  get "$lang" "$title" "$pat"
done
