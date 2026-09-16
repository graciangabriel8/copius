#!/usr/bin/env python3
"""Write texture tags into the ingredient data files.

Inserts `texture:[...]` immediately after each entry's `flavor:[...]`, which
every entry has. Idempotent: an entry that already carries a texture is
rewritten, not duplicated.

    python3 tools/apply-texture.py --dry <texture-*.json ...>
    python3 tools/apply-texture.py        <texture-*.json ...>
"""
import json, io, re, sys, glob, os, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_tags(paths):
    tags = {}
    for p in paths:
        for r in json.load(io.open(p, encoding="utf-8")):
            tags[r["id"]] = r["texture"]
    return tags


def apply_file(path, tags, dry):
    src = io.open(path, encoding="utf-8").read()
    out, wrote, seen = [], 0, 0
    # every entry opens with {id:"…" and carries exactly one flavor:[…]
    pos = 0
    for m in re.finditer(r'\{id:"([^"]+)"', src):
        ident = m.group(1)
        if ident not in tags:
            continue
        # the flavor array belonging to THIS entry: the first one after it, and
        # before the next entry begins
        nxt = src.find('{id:"', m.end())
        window = src[m.end(): nxt if nxt != -1 else len(src)]
        fm = re.search(r'flavor:\[[^\]]*\]', window)
        if not fm:
            continue
        seen += 1
        abs_end = m.end() + fm.end()
        existing = re.match(r'\s*,\s*texture:\[[^\]]*\]', src[abs_end:])
        ins = ',texture:' + json.dumps(tags[ident], separators=(",", ":"))
        out.append(src[pos:abs_end])
        out.append(ins)
        pos = abs_end + (existing.end() if existing else 0)
        wrote += 1
    out.append(src[pos:])
    new = "".join(out)
    if not dry and wrote:
        io.open(path, "w", encoding="utf-8").write(new)
    return wrote, seen


def main(argv):
    dry = "--dry" in argv
    paths = [a for a in argv if a != "--dry"]
    tags = load_tags(paths)
    print("  %d ids to place" % len(tags))
    total = 0
    for f in sorted(glob.glob(os.path.join(ROOT, "js", "data-*.js"))):
        if re.search(r'data-(chefs|trees|techniques|bases)\.js$', f):
            continue
        w, _ = apply_file(f, tags, dry)
        if w:
            total += w
            print("    %-28s %d" % (os.path.basename(f), w))
    print("  %d written%s" % (total, " (dry run, nothing saved)" if dry else ""))
    missing = total != len(tags)
    if missing:
        print("  WARNING: %d ids were not placed" % (len(tags) - total))
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
