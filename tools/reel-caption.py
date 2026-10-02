#!/usr/bin/env python3
"""The caption a reel goes out with: its own "caption" in social/reels.json when it has one
(the Copius film), otherwise the ingredient caption make-card.py writes for its id.

    python3 tools/reel-caption.py <id>
"""
import json, pathlib, subprocess, sys

if len(sys.argv) != 2:
    sys.exit(__doc__)
root = pathlib.Path(__file__).resolve().parent.parent
reels = json.loads((root / "social" / "reels.json").read_text())["reels"]
own = [r["caption"] for r in reels if r["id"] == sys.argv[1] and r.get("caption")]
if own:
    if not own[0].strip():
        sys.exit("empty caption for " + sys.argv[1])
    print(own[0])
else:
    sys.exit(subprocess.run([sys.executable, str(root / "tools" / "make-card.py"), "--caption-id", sys.argv[1]]).returncode)
