"""Internal consistency: within one unit, the price band must not contradict the
printed range. Finds records whose euros-per-kilo sits far outside the band's own
span, which is a data error regardless of any outside source.
"""
import json, re, statistics
from collections import defaultdict

entries = json.load(open("/tmp/draw/all.json"))
NUM = r"(\d+(?:[.,]\d+)?)"
pat = re.compile(NUM + r"\s*[–\-]\s*" + NUM + r"\s*€\s*/\s*(\S+)")
one = re.compile(r"^\s*" + NUM + r"\s*€\s*/\s*(\S+)")

def per_kg(pk):
    m = pat.search(pk or "") or one.search(pk or "")
    if not m: return None, None
    g = m.groups()
    if len(g) == 3:
        lo, hi, unit = float(g[0].replace(",", ".")), float(g[1].replace(",", ".")), g[2]
    else:
        lo = hi = float(g[0].replace(",", ".")); unit = g[1]
    mid = (lo + hi) / 2
    u = unit.lower().strip(".")
    if u.startswith("kg"):  return mid, "kg"
    if u == "g":            return mid * 1000, "kg"
    if u.startswith("l"):   return mid, "kg"      # litre ~ kilo for cooking liquids
    if u.startswith("cl"):  return mid * 100, "kg"
    return None, u

bands = defaultdict(list)
rows = []
for e in entries:
    v, u = per_kg(e.get("pk"))
    if v is None: continue
    b = e.get("price") or 2
    bands[b].append(v)
    rows.append((e["id"], b, v, e.get("pk")))

print("band   n     median €/kg     range")
for b in sorted(bands):
    xs = sorted(bands[b])
    print(f"  {b}  {len(xs):5d}   {statistics.median(xs):11.1f}   {xs[0]:.1f} – {xs[-1]:.1f}")

# A record contradicts its band when its €/kg sits beyond the neighbouring band's median.
med = {b: statistics.median(v) for b, v in bands.items()}
bad = []
for eid, b, v, pk in rows:
    if b < 4 and v > med.get(b + 1, 1e18) * 3:
        bad.append((eid, b, v, pk, f"dearer than band {b+1}'s median x3"))
    if b > 1 and v < med.get(b - 1, 0) / 3:
        bad.append((eid, b, v, pk, f"cheaper than band {b-1}'s median /3"))
bad.sort(key=lambda r: -r[2])
print(f"\n{len(bad)} records whose printed price contradicts their band:")
for eid, b, v, pk, why in bad:
    print(f"  {eid:32s} band {b}  {v:9.1f} €/kg  pk={pk!r:22s} {why}")
json.dump([{"id": r[0], "band": r[1], "eur_per_kg": round(r[2],1), "pk": r[3], "why": r[4]} for r in bad],
          open("/tmp/draw/verify/price_flags.json","w"), ensure_ascii=False, indent=1)
