# -*- coding: utf-8 -*-
"""Map a plain ingredient name to a real atlas id.

The last batch of dishes went in with nine of fourteen ids invented. This maps
only to ids that exist, and reports every name it cannot place rather than
guessing one.
"""
import json, re, glob, unicodedata, sys
from difflib import SequenceMatcher

SKIP = {"data-techniques.js", "data-trees.js", "data-bases.js", "data-chefs.js"}

def norm(s):
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower().replace("'", " ").replace("'", " ")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s)).strip()

ENTRIES = {e["id"]: e for e in json.load(open("/tmp/draw/all.json"))}
LIVE = set()
for p in sorted(glob.glob("js/data-*.js")):
    if p.split("/")[-1] in SKIP: continue
    LIVE |= set(re.findall(r'\{id:"([a-z0-9-]+)",cat:"[a-z]+"', open(p, encoding="utf-8").read()))

# name -> id, from every surface a writer might use
INDEX = {}
def add(key, eid):
    k = norm(key)
    if k: INDEX.setdefault(k, []).append(eid)
for eid in LIVE:
    e = ENTRIES.get(eid)
    if not e: continue
    add(eid.replace("-", " "), eid)
    add(e["name"]["en"], eid)
    add(e["name"]["fr"], eid)

# Words a writer adds that the atlas does not carry in the entry name.
QUALIFIER = {"fresh","dried","aged","whole","raw","cooked","ground","chopped",
             "double","heavy","thick","greek","dry","cured","drycured","young",
             "black","white","green","red","wild","baby","sea","fine","good",
             "quality","best","extra","virgin","unsalted","salted","toasted"}
HEAD = {"cheese","mushrooms","mushroom","vinegar","powder","syrup","juice",
        "noodles","flour","cherries","cherry","flowers","flower","yoghurt",
        "yogurt","cream","stock","broth","liqueur","spices","oil","wine","ants",
        "leaves","leaf","seeds","seed","wings","wing","yolks","yolk","whites","white"}

def _singulars(k):
    yield k
    if k.endswith("s"): yield k[:-1]
    yield k + "s"
    if k.endswith("ies"): yield k[:-3] + "y"

def resolve(name):
    k = norm(name)
    for alt in _singulars(k):
        if alt in INDEX:
            how = "exact" if alt == k else "plural"
            return {"name": name, "id": INDEX[alt][0], "how": how,
                    "ambiguous": INDEX[alt][1:] or None}
    toks = k.split()
    # Drop qualifiers the atlas does not name, then retry.
    stripped = " ".join(t for t in toks if t not in QUALIFIER)
    if stripped and stripped != k:
        for alt in _singulars(stripped):
            if alt in INDEX:
                return {"name": name, "id": INDEX[alt][0], "how": "qualifier-stripped"}
    # Drop a trailing generic head noun ("Stilton cheese" -> "Stilton").
    if len(toks) > 1 and toks[-1] in HEAD:
        base = " ".join(toks[:-1])
        for alt in _singulars(base):
            if alt in INDEX:
                return {"name": name, "id": INDEX[alt][0], "how": "head-noun-dropped"}
    # An atlas name wholly contained in the query, as whole words.
    hits = [(c, ids) for c, ids in INDEX.items()
            if c and set(c.split()) <= set(toks) and len(c.split()) >= 1]
    if hits:
        c, ids = max(hits, key=lambda h: len(h[0]))
        return {"name": name, "id": ids[0], "how": f"contained ({c})"}
    best, score = None, 0.0
    for cand, ids in INDEX.items():
        r = SequenceMatcher(None, k, cand).ratio()
        if r > score: best, score = ids[0], r
    if score >= 0.90:
        return {"name": name, "id": best, "how": f"fuzzy {score:.2f}"}
    return {"name": name, "id": None, "how": "UNRESOLVED",
            "nearest": best, "nearest_score": round(score, 2)}

if __name__ == "__main__":
    # Control: known-good names resolve, invented ones must NOT.
    cases = [("salmon", True), ("sorrel", True), ("black truffle", True),
             ("cream", True), ("oysters", True), ("caviar", True),
             ("unobtanium root", False), ("flurb", False), ("moon cheese", False)]
    ok = True
    for name, should in cases:
        r = resolve(name)
        got = r["id"] is not None
        mark = "PASS" if got == should else "FAIL"
        if got != should: ok = False
        print(f"  {mark}  {name:18s} -> {str(r['id']):26s} ({r['how']})")
    print(f"\n{len(LIVE)} live ids, {len(INDEX)} searchable names")
    print("CONTROLS", "ALL PASS" if ok else "SOME FAILED")
    sys.exit(0 if ok else 1)
