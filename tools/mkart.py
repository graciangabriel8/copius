#!/usr/bin/env python3
"""Rasterise an atlas drawing for a reel: img/<id>.svg -> <id>-art.svg.png, 1200 px, light only,
page colour behind it. qlmanage renders in the Mac's own appearance, so the dark-mode rule goes."""
import io, os, subprocess, sys
root, ident, out = sys.argv[1], sys.argv[2], sys.argv[3]
s = io.open(os.path.join(root, "img", ident + ".svg"), encoding="utf-8").read()
s = s.replace('width="104" height="104"', 'width="1200" height="1200"', 1)
i, j = s.find("@media"), s.find("</style>")
if i > 0 and j > i: s = s[:i] + s[j:]
s = s.replace("</style>", '</style><rect width="96" height="96" fill="#F7F6F1"/>', 1)
svg = os.path.join(out, ident + "-art.svg"); io.open(svg, "w", encoding="utf-8").write(s)
png = svg + ".png"
if os.path.exists(png): os.remove(png)
subprocess.run(["qlmanage", "-t", "-s", "1200", "-o", out, svg], capture_output=True)
print("wrote", png if os.path.exists(png) else "NOTHING — qlmanage failed")
