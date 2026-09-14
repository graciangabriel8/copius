"""Triage the prose by how badly a claim could be wrong.

Sensory description cannot be false. Superlatives, attributions to named people
and statements about law can, and those are what a school would repeat.
"""
import json, re
from collections import Counter, defaultdict

ents = json.load(open("/tmp/draw/all.json"))

CLASSES = {
 "superlative": r"\b(the only|the first|the oldest|the largest|the smallest|the rarest|the most|the last|only place|nowhere else|no other|world'?s (?:only|first|oldest|largest))\b",
 "law":         r"\b(banned|outlawed|illegal|prohibit(?:ed|s)?|by law|law requires|legally|regulation|decree|mandat(?:ed|ory)|permitted only|forbidden)\b",
 "attribution": r"\b(invented by|created by|devised by|named after|credited (?:to|with)|attributed to|developed by)\b",
 "institution": r"\b(USDA|INAO|FDA|EFSA|UNESCO|CNRS|INRA[E]?|Michelin|Codex|European Union|EU )\b",
 "quantified":  r"\b\d+(?:[.,]\d+)?\s?(?:%|°|g\b|kg\b|mm\b|cm\b|m\b|L\b|ml\b|days?|weeks?|months?|years?|hours?|minutes?)",
 "dated":       r"\b(1[0-9]{3}|20[0-9]{2})s?\b",
}
rx = {k: re.compile(v, re.I) for k, v in CLASSES.items()}

hits = defaultdict(list)
per_entry = Counter()
for e in ents:
    for f in ("story", "tip", "origin"):
        t = (e.get(f) or {}).get("en") or ""
        if not t: continue
        for k, r in rx.items():
            for m in r.finditer(t):
                # keep the sentence the match sits in
                s = t.rfind(".", 0, m.start()) + 1
                end = t.find(".", m.end())
                sent = t[s: end + 1 if end > 0 else len(t)].strip()
                hits[k].append({"id": e["id"], "field": f, "match": m.group(0), "sentence": sent})
                per_entry[e["id"]] += 1

print("claim class        instances   distinct entries")
for k in CLASSES:
    print(f"  {k:14s} {len(hits[k]):8d}   {len({h['id'] for h in hits[k]}):8d}")
print(f"\nentries carrying at least one checkable claim: {len(per_entry)} of {len(ents)}")
json.dump({k: v for k, v in hits.items()}, open("/tmp/draw/verify/risk_claims.json","w"),
          ensure_ascii=False, indent=1)
