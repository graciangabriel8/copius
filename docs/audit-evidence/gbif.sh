#!/bin/zsh
# Verify every distinct latin name in the atlas against the GBIF taxonomic backbone.
# One HTTP call per name; results appended as JSONL.
OUT=/tmp/draw/verify/gbif.jsonl
: > "$OUT"
python3 - <<'PY' > /tmp/draw/verify/latin_names.txt
import json
names=set()
for e in json.load(open('/tmp/draw/all.json')):
    v=(e.get('latin') or '').strip()
    if v: names.add(v)
for n in sorted(names): print(n)
PY
total=$(wc -l < /tmp/draw/verify/latin_names.txt)
echo "names: $total"
i=0
while IFS= read -r n; do
  i=$((i+1))
  enc=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$n")
  r=$(curl -s -m 20 "https://api.gbif.org/v1/species/match?name=$enc&strict=false")
  python3 -c "
import json,sys
name=sys.argv[1]; raw=sys.argv[2]
try: j=json.loads(raw)
except Exception: j={}
print(json.dumps({'latin':name,'matchType':j.get('matchType'),'status':j.get('status'),
 'confidence':j.get('confidence'),'scientificName':j.get('scientificName'),
 'canonicalName':j.get('canonicalName'),'rank':j.get('rank'),
 'accepted':j.get('accepted'),'kingdom':j.get('kingdom'),'family':j.get('family')},ensure_ascii=False))
" "$n" "$r" >> "$OUT"
  if [ $((i % 100)) -eq 0 ]; then echo "  $i/$total"; fi
done < /tmp/draw/verify/latin_names.txt
echo "done $i"
