"""Bilingual contradiction check, second pass.

The first pass flagged paraphrase, not error: English "in the 1920s" against
French "dans les années 1920", or "nineteenth-century" against "XIXe siecle".
This pass normalises those forms and flags only a genuine contradiction — both
languages state a value of the same kind, and the values disagree.
"""
import json, re, sys
from collections import Counter

WORD_CENT = {"first":1,"second":2,"third":3,"fourth":4,"fifth":5,"sixth":6,
 "seventh":7,"eighth":8,"ninth":9,"tenth":10,"eleventh":11,"twelfth":12,
 "thirteenth":13,"fourteenth":14,"fifteenth":15,"sixteenth":16,"seventeenth":17,
 "eighteenth":18,"nineteenth":19,"twentieth":20,"twenty-first":21}
ROMAN = {"I":1,"II":2,"III":3,"IV":4,"V":5,"VI":6,"VII":7,"VIII":8,"IX":9,"X":10,
 "XI":11,"XII":12,"XIII":13,"XIV":14,"XV":15,"XVI":16,"XVII":17,"XVIII":18,
 "XIX":19,"XX":20,"XXI":21}

def years(t):
    return {int(m) for m in re.findall(r"\b(1[0-9]{3}|20[0-9]{2})s?\b", t)}

def centuries(t, lang):
    out = set()
    for m in re.findall(r"\b(\d{1,2})(?:st|nd|rd|th)[- ]century\b", t, re.I): out.add(int(m))
    for w, n in WORD_CENT.items():
        if re.search(r"\b" + w + r"[- ]century\b", t, re.I): out.add(n)
    for m in re.findall(r"\b([IVXLC]+)\s?[eè](?:me|r)?\s+si[èe]cle\b", t, re.I):
        if m.upper() in ROMAN: out.add(ROMAN[m.upper()])
    for m in re.findall(r"\b(\d{1,2})\s?[eè](?:me)?\s+si[èe]cle\b", t, re.I): out.add(int(m))
    return out

def nums(t, unit):
    t = re.sub(r"(\d),(\d)", r"\1.\2", t)          # French decimal comma
    if unit == "pct":
        return {float(x) for x in re.findall(r"(\d{1,3}(?:\.\d+)?)\s?(?:%|\s?(?:per ?cent|pour ?cent))", t)}
    return {float(x) for x in re.findall(r"(\d{1,3}(?:\.\d+)?)\s?°", t)}

def field(e, f, lang): return (e.get(f) or {}).get(lang) or ""

def run(ents, out_path=None, quiet=False):
    rows = []
    for e in ents:
        for f in ("story", "tip", "origin"):
            en, fr = field(e, f, "en"), field(e, f, "fr")
            if not en or not fr: continue
            checks = [("year", years(en), years(fr)),
                      ("century", centuries(en, "en"), centuries(fr, "fr")),
                      ("percent", nums(en, "pct"), nums(fr, "pct")),
                      ("temp", nums(en, "deg"), nums(fr, "deg"))]
            for kind, a, b in checks:
                # a contradiction needs a value on BOTH sides that disagree
                if a and b and a != b:
                    rows.append({"id": e["id"], "field": f, "kind": kind,
                                 "en_values": sorted(a), "fr_values": sorted(b),
                                 "en": en, "fr": fr})
    if out_path: json.dump(rows, open(out_path,"w"), ensure_ascii=False, indent=1)
    if not quiet:
        print(f"{len(rows)} contradictions across {len({r['id'] for r in rows})} entries")
        print(dict(Counter(r["kind"] for r in rows)))
    return rows

ents = json.load(open("/tmp/draw/all.json"))
run(ents, "/tmp/draw/verify/enfr2_flags.json")

# Control: the check must fire on a planted contradiction and stay silent on a
# faithful translation.
good = [{"id":"__ok","story":{"en":"Banned in 1915.","fr":"Interdite en 1915."},
         "tip":{"en":"","fr":""},"origin":{"en":"","fr":""}}]
bad  = [{"id":"__bad","story":{"en":"Banned in 1915.","fr":"Interdite en 1925."},
         "tip":{"en":"","fr":""},"origin":{"en":"","fr":""}}]
para = [{"id":"__para","story":{"en":"It faded in the 1920s.","fr":"Il disparut dans les années 1920."},
         "tip":{"en":"","fr":""},"origin":{"en":"","fr":""}}]
cent = [{"id":"__cent","story":{"en":"A nineteenth-century dish.","fr":"Un plat du XIXe siècle."},
         "tip":{"en":"","fr":""},"origin":{"en":"","fr":""}}]
for label, sample, expect in (("faithful", good, 0), ("planted 1915/1925", bad, 1),
                              ("paraphrased decade", para, 0), ("spelled century", cent, 0)):
    n = len(run(sample, quiet=True))
    print(f"  control {label:22s} -> {n} flag(s), expected {expect}  {'PASS' if n==expect else 'FAIL'}")
