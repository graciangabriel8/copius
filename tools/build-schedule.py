#!/usr/bin/env python3
"""Write social/schedule.json: which ingredient goes out on which day.

    {"start": "2026-09-09", "days": ["id", "id", ...]}   one id per day from start

The day -> ingredient map used to be a stride over the ingredient list, so any
edit to the data reshuffled every day and the pre-built cards stopped matching
the date. This file pins the order instead. Re-running never changes a day that
is already scheduled: ids new to the data are appended and nothing is dropped —
an id that has since left the data stays in the file and make-card.py falls
forward past it.

Order is by how central an ingredient is: the number of OTHER entries that name
it as a pairing. Butter is named by 477, garlic by 413; 1 140 entries are named
by nobody. A feed that opens on hop shoots and myeolchi aekjeot reaches the
handful of people already searching those. Basics carry further, and the niche
entries keep their day — later.

    python3 tools/build-schedule.py                  append new ids, in rank order
    python3 tools/build-schedule.py --reorder-pending  also re-rank every day
                                                     that has not happened yet
"""
import datetime as _dt
import importlib.util, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "social" / "schedule.json"
START = "2026-09-09"


def inbound(root):
    """How many other entries name each id as a pairing — the atlas's own
    measure of how central an ingredient is. Ties break alphabetically so the
    order is stable across runs."""
    atlas = (root / "atlas.html").read_text()
    counts = {}
    for fn in re.findall(r'src="js/(data-[a-z-]+\.js)\?', atlas):
        if "trees" in fn:
            continue
        txt = (root / "js" / fn).read_text()
        for m in re.finditer(r'pairs:\[([^\]]*)\]', txt):
            for pid in re.findall(r'"([a-z0-9\u00e9-]+)"', m.group(1)):
                counts[pid] = counts.get(pid, 0) + 1
    return counts

spec = importlib.util.spec_from_file_location("make_card", ROOT / "tools" / "make-card.py")
make_card = importlib.util.module_from_spec(spec)
spec.loader.exec_module(make_card)


def main():
    rows = make_card.load()
    cat = {r["id"]: r["cat"] for r in rows}
    sched = (json.loads(OUT.read_text()) if OUT.exists()
             else {"start": START, "days": []})
    have = set(sched["days"])
    rank = inbound(ROOT)
    def key(i):
        return (-rank.get(i, 0), i)

    reorder = "--reorder-pending" in sys.argv
    if reorder:
        # Days already past keep whatever went out on them; everything from
        # today forward is re-ranked. Nothing is dropped, only moved.
        # +1: today's card goes out at 17:00 and may already have. Today is
        # spent, so the re-rank starts at tomorrow.
        gone = (_dt.date.today() - _dt.date.fromisoformat(sched["start"])).days + 1
        gone = max(0, min(gone, len(sched["days"])))
        pending = sched["days"][gone:]
        sched["days"] = sched["days"][:gone]
        have = set(sched["days"])
        new = sorted(set(pending) | {i for i in cat if i not in have} - have, key=key)
        print("re-ranking %d pending days; %d already gone are untouched" % (len(pending), gone))
    else:
        new = sorted((i for i in cat if i not in have), key=key)
    # Two consecutive days never share a family: when they would, swap the
    # offender with the first later id of another family. The walk is forward,
    # so the id swapped back is checked again when its turn comes.
    prev = sched["days"][-1] if sched["days"] else None
    for k in range(len(new)):
        if prev is not None and cat.get(prev) == cat[new[k]]:
            for j in range(k + 1, len(new)):
                if cat[new[j]] != cat.get(prev):
                    new[k], new[j] = new[j], new[k]
                    break
        prev = new[k]
    sched["days"].extend(new)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(sched, indent=0, ensure_ascii=False) + "\n")
    print("appended %d, first 12: %s" % (len(new), " ".join(new[:12]) or "-"))
    print("schedule: %s + %d days (ends %s)" % (
        sched["start"], len(sched["days"]),
        make_card.datetime.date.fromisoformat(sched["start"])
        + make_card.datetime.timedelta(days=len(sched["days"]) - 1)))


if __name__ == "__main__":
    main()
