import json, re, unicodedata
from collections import Counter

def norm(s):
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower().replace("’", "'").replace("`", "'")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()

reg   = json.load(open("/tmp/eambrosia_all.json"))["results"]
atlas = {e["id"]: e for e in json.load(open("/tmp/draw/all.json"))}
marks = json.load(open("/tmp/draw/marks.json"))
LIVE  = {"Registered", "Published"}

names = []           # (normalized single name, record)
for r in reg:
    for part in (r.get("protectedName") or "").split("/"):
        k = norm(part)
        if k:
            names.append((k, r))
exact = {}
for k, r in names:
    exact.setdefault(k, []).append(r)

def contains_word(hay, needle):
    return re.search(r"(?:^| )" + re.escape(needle) + r"(?:$| )", hay) is not None

WANT = {"AOP": "PDO", "DOP": "PDO", "PDO": "PDO", "IGP": "PGI", "PGI": "PGI"}

out = []
for eid, claimed in sorted(marks.items()):
    e = atlas[eid]
    cands = [e["name"]["fr"], e["name"]["en"]]
    want  = WANT[claimed]
    rec = {"id": eid, "claimed": claimed, "want": want, "names": cands}

    hit = None
    for n in cands:
        if norm(n) in exact:
            hit = exact[norm(n)]; break
    if hit:
        live  = [h for h in hit if h.get("status") in LIVE] or hit
        codes = sorted({h["geographicalIndicatorTypeCode"] for h in live})
        rec.update(verdict = "CONFIRMED" if want in codes else "WRONG_SCHEME",
                   register_codes = codes,
                   register_name  = live[0]["protectedName"],
                   country        = live[0]["countries"],
                   status         = sorted({h["status"] for h in live}))
        out.append(rec); continue

    # The generic-name trap: protection belongs to a LONGER registered name.
    longer = []
    for n in cands:
        k = norm(n)
        if not k: continue
        for rk, r in names:
            if rk != k and contains_word(rk, k) and r.get("status") in LIVE:
                longer.append(r)
    if longer:
        seen, uniq = set(), []
        for r in longer:
            key = r["protectedName"]
            if key not in seen:
                seen.add(key); uniq.append(r)
        rec.update(verdict = "GENERIC_NAME",
                   register_matches = [
                       {"name": r["protectedName"],
                        "code": r["geographicalIndicatorTypeCode"],
                        "country": r["countries"]} for r in uniq[:6]],
                   n_matches = len(uniq))
        out.append(rec); continue

    rec["verdict"] = "ABSENT"
    out.append(rec)

json.dump(out, open("/tmp/draw/verify/gi_verdicts2.json", "w"),
          ensure_ascii=False, indent=1)
print("TOTAL", len(out), dict(Counter(o["verdict"] for o in out)))
