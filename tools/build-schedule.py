#!/usr/bin/env python3
"""Write social/schedule.json: which ingredient goes out on which day.

    {"start": "2026-09-09", "days": ["id", "id", ...]}   one id per day from start

The day -> ingredient map used to be a stride over the ingredient list, so any
edit to the data reshuffled every day and the pre-built cards stopped matching
the date. This file pins the order instead. Re-running never changes a day that
is already scheduled: ids new to the data are appended, shuffled with the same
seed, and nothing is dropped — an id that has since left the data stays in the
file and make-card.py falls forward past it.
    python3 tools/build-schedule.py
"""
import importlib.util, json, pathlib, random, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "social" / "schedule.json"
START = "2026-09-09"
SEED = 20260909      # fixed on purpose: the same data must give the same order

spec = importlib.util.spec_from_file_location("make_card", ROOT / "tools" / "make-card.py")
make_card = importlib.util.module_from_spec(spec)
spec.loader.exec_module(make_card)


def main():
    rows = make_card.load()
    cat = {r["id"]: r["cat"] for r in rows}
    sched = (json.loads(OUT.read_text()) if OUT.exists()
             else {"start": START, "days": []})
    have = set(sched["days"])
    new = sorted(i for i in cat if i not in have)
    random.Random(SEED).shuffle(new)
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
    print("appended %d: %s" % (len(new), " ".join(new) or "-"))
    print("schedule: %s + %d days (ends %s)" % (
        sched["start"], len(sched["days"]),
        make_card.datetime.date.fromisoformat(sched["start"])
        + make_card.datetime.timedelta(days=len(sched["days"]) - 1)))


if __name__ == "__main__":
    main()
