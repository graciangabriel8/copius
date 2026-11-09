#!/usr/bin/env python3
"""The caption a reel goes out with: its own "caption" in social/reels.json when it has one
(the Copius film), otherwise the ingredient caption make-card.py writes for its id.
With --en, the same for @copius.en: social/_reels-en.json (underscore: never served), and make-card.py in English.

    python3 tools/reel-caption.py [--en] <id>
"""
import json, pathlib, subprocess, sys

args = sys.argv[1:]
en = args[:1] == ["--en"]
if en:
    args = args[1:]
if len(args) != 1:
    sys.exit(__doc__)
root = pathlib.Path(__file__).resolve().parent.parent
reels = json.loads((root / "social" / ("_reels-en.json" if en else "reels.json")).read_text())["reels"]
own = [r["caption"] for r in reels if r["id"] == args[0] and r.get("caption")]
if own:
    if not own[0].strip():
        sys.exit("empty caption for " + args[0])
    print(own[0])
else:
    sys.exit(subprocess.run([sys.executable, str(root / "tools" / "make-card.py")] + (["--lang", "en"] if en else [])
                            + ["--caption-id", args[0]]).returncode)
