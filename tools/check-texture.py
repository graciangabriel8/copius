#!/usr/bin/env python3
"""Check a texture assignment against the closed vocabulary.

Structural faults only — whether a tag is TRUE of the food is a judgement this
cannot make, and the audit agents cover that half. Run:

    python3 tools/check-texture.py <file.json> [more.json ...]
"""
import json, io, sys, collections

AXES = {
    "yield":    ["soft", "tender", "firm", "hard", "tough"],
    "surface":  ["crisp", "crunchy", "brittle", "smooth"],
    "body":     ["creamy", "silky", "gelatinous", "viscous", "airy"],
    "moisture": ["juicy", "moist", "dry"],
    "grain":    ["fibrous", "granular", "flaky", "powdery", "chewy"],
}
AXIS_OF = {t: a for a, ts in AXES.items() for t in ts}
VOCAB = set(AXIS_OF)
assert len(VOCAB) == 22, "the vocabulary is 22 tags, found %d" % len(VOCAB)


# What the axes were really guarding against was contradiction, and they were
# wrong in both directions: "viscous, smooth, creamy" describes a mayonnaise
# exactly and trips a one-per-axis rule, while "crisp" and "soft" sit on
# different axes and cannot both be true. Name the impossible pairs instead.
CONTRADICTS = [
    ("soft", "hard"), ("soft", "firm"), ("soft", "tough"),
    ("soft", "crisp"), ("soft", "crunchy"), ("soft", "brittle"),
    ("tender", "tough"), ("tender", "hard"),
    ("creamy", "brittle"), ("silky", "granular"), ("smooth", "granular"),
    ("smooth", "fibrous"), ("juicy", "dry"), ("moist", "dry"),
    ("airy", "hard"), ("airy", "viscous"),
]


def faults(row):
    out = []
    tags = row.get("texture") or []
    bad = [t for t in tags if t not in VOCAB]
    if bad:
        out.append("not in the vocabulary: " + ", ".join(bad))
    if not 2 <= len(tags) <= 3:
        out.append("%d tags, the rule is 2 or 3" % len(tags))
    have = set(tags)
    clash = ["%s + %s" % (a, b) for a, b in CONTRADICTS if a in have and b in have]
    if clash:
        out.append("cannot both be true: " + "; ".join(clash))
    # two from one axis is fine; three says nothing was observed but one quality
    seen = collections.Counter(AXIS_OF[t] for t in tags if t in VOCAB)
    heavy = [a for a, n in seen.items() if n > 2]
    if heavy:
        out.append("all three tags on one axis: " + ", ".join(heavy))
    if len(set(tags)) != len(tags):
        out.append("a tag is repeated")
    return out


def main(paths):
    rows, bad = [], 0
    for p in paths:
        try:
            rows += json.load(io.open(p, encoding="utf-8"))
        except Exception as e:
            print("  could not read %s: %s" % (p, e)); return 2
    ids = [r.get("id") for r in rows]
    dupes = [i for i, n in collections.Counter(ids).items() if n > 1]
    for r in rows:
        f = faults(r)
        if f:
            bad += 1
            print("  %-34s %-30s %s" % (r.get("id"), ",".join(r.get("texture") or []), "; ".join(f)))
    print("\n  %d rows, %d with faults, %d duplicate ids" % (len(rows), bad, len(dupes)))
    if dupes:
        print("  duplicates: " + ", ".join(dupes[:10]))
    spread = collections.Counter(t for r in rows for t in (r.get("texture") or []))
    print("  tags in use: %d of 22" % len(spread))
    unused = sorted(VOCAB - set(spread))
    if unused:
        print("  never used: " + ", ".join(unused))
    print("  most common: " + ", ".join("%s %d" % kv for kv in spread.most_common(6)))
    return 1 if (bad or dupes) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
