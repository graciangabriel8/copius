#!/usr/bin/env python3
"""Merge generated entries into the data files, one file per family.

Reads a JSON array of entries (the shape the writing agents return) and
rewrites js/data-<family>.js so that each family lives in exactly one file.
Existing entries are moved verbatim — their raw text is never re-serialised,
so nothing is reformatted or lost in translation.

    python3 tools/merge-entries.py new-entries.json [more.json ...]
"""
import json, re, sys, pathlib, html

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "js"

def existing_blocks():
    """Every current entry as (id, cat, raw text), in script order."""
    idx = (ROOT / "index.html").read_text()
    out = []
    for fn in re.findall(r'src="js/(data-[a-z0-9-]+\.js)\?', idx):
        if "chefs" in fn or "trees" in fn:
            continue
        t = (DATA / fn).read_text()
        for blk in re.findall(r'^\{id:".*?(?=^\{id:"|\n\s*\]|\Z)', t, re.S | re.M):
            m = re.match(r'\{id:"([a-z0-9-]+)",\s*cat:"([a-z]+)"', blk)
            if m:
                out.append((m.group(1), m.group(2), blk.rstrip().rstrip(",")))
    return out

def esc(s):
    """Double-quoted JS string body. The corpus uses curly quotes in prose, so
    a straight double quote is almost always a mistake — convert rather than
    escape, to keep the typography consistent."""
    s = html.unescape(s or "").replace("\\", "\\\\")
    s = s.replace('"', "”")
    return s.replace("\n", " ").strip()

def render(e):
    svg = html.unescape(e["svg"]).replace("'", "’")   # field is single-quoted
    return (
        '{{id:"{id}",cat:"{cat}",name:{{en:"{en}",fr:"{fr}"}},latin:"{latin}",\n'
        'origin:{{en:"{oen}",fr:"{ofr}"}},season:[{season}],\n'
        'flavor:[{flavor}],\n'
        'story:{{en:"{sen}",\n'
        'fr:"{sfr}"}},\n'
        'tip:{{en:"{ten}",\n'
        'fr:"{tfr}"}},\n'
        'pairs:[{pairs}],\n'
        "svg:'{svg}'}}"
    ).format(
        id=e["id"], cat=e["cat"], en=esc(e["en"]), fr=esc(e["fr"]), latin=esc(e.get("latin", "")),
        oen=esc(e["originEn"]), ofr=esc(e["originFr"]),
        season=",".join(str(int(m)) for m in e.get("season", [])),
        flavor=",".join('"%s"' % f for f in e["flavor"]),
        sen=esc(e["storyEn"]), sfr=esc(e["storyFr"]),
        ten=esc(e["tipEn"]), tfr=esc(e["tipFr"]),
        pairs=",".join('"%s"' % p for p in e["pairs"]),
        svg=svg)

def main(paths):
    rows = existing_blocks()
    have = {i for i, _, _ in rows}
    added = 0
    for p in paths:
        for e in json.load(open(p)):
            if e["id"] in have:
                continue
            have.add(e["id"])
            rows.append((e["id"], e["cat"], render(e)))
            added += 1

    by_cat = {}
    for i, c, blk in rows:
        by_cat.setdefault(c, []).append(blk)

    # one file per family, alphabetical within it
    for old in DATA.glob("data-*.js"):
        if "chefs" not in old.name and "trees" not in old.name:
            old.unlink()
    order = []
    for cat in sorted(by_cat):
        blocks = sorted(by_cat[cat], key=lambda b: re.search(r'name:\{en:"([^"]*)"', b).group(1).lower())
        fn = f"data-{cat}.js"
        (DATA / fn).write_text(
            "window.INGREDIENTS = (window.INGREDIENTS || []).concat([\n"
            + ",\n\n".join(blocks) + "\n]);\n")
        order.append((fn, len(blocks)))
    return added, order, len(rows)

if __name__ == "__main__":
    added, order, total = main(sys.argv[1:])
    print(json.dumps({"added": added, "total": total,
                      "files": [{"f": f, "n": n} for f, n in order]}, indent=1))
