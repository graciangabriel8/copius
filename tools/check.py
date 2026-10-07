#!/usr/bin/env python3
"""The checks a change must pass before it goes live. .github/workflows/deploy.yml runs them on every push to main
and moves the branch OVH deploys (live) only when they pass; run them by hand with `python3 tools/check.py`.
Prints one line per failure and exits 1 on any.

1. data: node tools/validate.js (ids, pairings, both languages, the free list, the js/ files .htaccess serves)
2. scripts parse: node --check on js/*.js, service-worker.js and every distinct inline <script> of a page;
   every JSON-LD block (the structured data search engines read) is valid JSON
3. links: every local href and src of a served page, https://copius.fr/ links included, and every url() of a
   stylesheet points at a file of the repo that .htaccess serves (script bodies are skipped: their quotes build
   URLs at run time)
4. cache versions: every css/ and js/ file a page loads carries ?v=, the same on every page, and service-worker.js
   has that version and caches only files that exist; a loaded css/ or js/ file that differs from the live branch
   needs a new ?v= (on GitHub the workflow fetches live; by hand, origin/live as last fetched)
5. secrets: no live or test key, token or deploy-hook address in any tracked file (the scanner first proves it
   catches a planted fake of each kind), and no credential file (config.php, *.key, .env, copius-private) tracked
6. generated files: the generators bump.sh runs (all but the share card's jpg) run on a copy of the repo, and
   what they write matches what is committed: a data change pushed without `sh tools/bump.sh` fails, and so does
   a page left over for an ingredient that left the free list. sitemap.xml's <lastmod> dates are not compared.
7. PHP: php -l on api/*.php (required on GitHub, whose PHP is 8.3: OVH's 8.4-only syntax would need setup-php;
   skipped with a note where php is missing)
"""
import hashlib, html, json, os, re, shutil, subprocess, sys, pathlib, tempfile

root = pathlib.Path(__file__).resolve().parent.parent
CI = os.environ.get("GITHUB_ACTIONS") == "true"
failures = []
def fail(msg): failures.append(msg)
def tracked(*globs):
    out = subprocess.run(["git", "-C", str(root), "ls-files", "-z", *globs], capture_output=True, text=True, check=True).stdout
    return [root / p for p in out.split("\0") if p]
def capped(kind, items, n=10):   # one line each for the first n, then how many more: never a silent cap
    for i in items[:n]: fail(kind + i)
    if len(items) > n: fail(kind + "and %d more like these" % (len(items) - n))

# Pages: what visitors get. .htaccess refuses names starting with "_" or "." and the folders tools/ and docs/.
pages = [p for p in tracked("*.html") if p.is_file() and not any(part[:1] in "_." or part in ("tools", "docs") for part in p.relative_to(root).parts)]
text = {p: p.read_text(encoding="utf-8") for p in pages}
node, php = shutil.which("node"), shutil.which("php")

# 1. data
if node:
    r = subprocess.run([node, str(root / "tools/validate.js")], capture_output=True, text=True)
    lines = [l for l in (r.stdout + r.stderr).strip().splitlines() if l.strip()]
    if r.returncode != 0: capped("data: ", [l.strip() for l in lines if l.startswith("  - ")] or lines or ["tools/validate.js failed"])
elif CI: fail("data: node is missing on the runner")
else: print("note: node missing here, data not validated")

# 2. scripts parse
if node:
    for js in tracked("js/*.js", "service-worker.js"):
        r = subprocess.run([node, "--check", str(js)], capture_output=True, text=True)
        if r.returncode != 0: fail("script %s does not parse: %s" % (js.relative_to(root), next((l for l in r.stderr.splitlines() if "Error" in l), "?").strip()))
elif CI: fail("scripts: node is missing on the runner")
else: print("note: node missing here, scripts not parsed")
INLINE = re.compile(r"(?is)<script\b([^>]*)>(.*?)</script>")
inline = {}   # distinct inline code -> (pages using it, module or not): the generated pages repeat a dozen scripts
for page in pages:
    for attrs, body in INLINE.findall(text[page]):
        kind = re.search(r'\stype="([^"]*)"', attrs)
        kind = kind.group(1).lower() if kind else ""
        if re.search(r"\ssrc=", attrs) or not body.strip(): continue
        if kind == "application/ld+json":
            try: json.loads(body)
            except ValueError as e: fail("structured data on %s is not valid JSON: %s" % (page.relative_to(root), e))
        elif kind in ("", "text/javascript", "module"):
            inline.setdefault(body, ([], kind == "module"))[0].append(page)
if node:
    with tempfile.TemporaryDirectory() as tmp:
        for body, (used, module) in inline.items():
            f = pathlib.Path(tmp) / (hashlib.sha1(body.encode()).hexdigest() + (".mjs" if module else ".js"))
            f.write_text(body, encoding="utf-8")
            r = subprocess.run([node, "--check", str(f)], capture_output=True, text=True)
            if r.returncode != 0: fail("inline script on %s%s does not parse: %s" % (used[0].relative_to(root), " and %d other page(s)" % (len(used) - 1) if len(used) > 1 else "",
                                                                                   next((l for l in r.stderr.splitlines() if "Error" in l), "?").strip()))

# 3. links
ATTR = re.compile(r'\s(?:href|src|poster)="([^"]*)"')
SCRIPT_BODY = re.compile(r"(?is)(<script\b[^>]*>).*?(</script>)")   # keeps <script src="…">, drops the code between
SELF = re.compile(r"(?i)^https?://(?:www\.)?copius\.fr(?=/|$)")
def local(url):
    return url and not re.match(r"(?i)^([a-z][a-z0-9+.-]*:|#|//)", url)   # any other scheme (mailto:, instagram…) is outside the repo
m = re.search(r"RewriteRule \^js/\(\?!\(([\w|-]+)\)", (root / ".htaccess").read_text(encoding="utf-8"))
if not m: fail("links: .htaccess has no js/ allow-list line, which this check reads to know the served js/ files")
SERVED_JS = set(m.group(1).split("|")) if m else set()
def refused(rel):   # what .htaccess answers 404 to, so a link to it is broken on copius.fr even though the file exists
    parts = rel.parts
    return (any(x[:1] in "_." for x in parts) and parts[:1] != (".well-known",) or parts[:1] in (("tools",), ("docs",))
            or (len(parts) == 2 and parts[0] == "js" and not (rel.suffix == ".js" and rel.stem in SERVED_JS)))
def resolve(base, url):
    path = url.split("#")[0].split("?")[0]
    if not path: return None
    target = (root / path.lstrip("/")) if path.startswith("/") else (base / path)
    return pathlib.Path(os.path.normpath(target)), path
def exists(base, url):
    got = resolve(base, url)
    if not got: return True
    target, path = got
    if root not in target.parents and target != root: return False   # leaves the site
    if target != root and refused(target.relative_to(root)): return False
    return (target / "index.html").is_file() if path.endswith("/") or target.is_dir() else target.is_file()
refs = {}   # page -> its local references, for the links and the versions
for page in pages:
    urls = [html.unescape(u) for u in ATTR.findall(SCRIPT_BODY.sub(r"\1\2", text[page]))]
    refs[page] = [SELF.sub("", u) or "/" for u in urls if local(SELF.sub("", u) or "/")]
broken = ["%s points at %s, which is not in the repo or not served" % (p.relative_to(root), u) for p in pages for u in refs[p] if not exists(p.parent, u)]
for css in tracked("css/*.css"):
    for url in re.findall(r"url\(\s*['\"]?([^'\")]+)['\"]?\s*\)", css.read_text(encoding="utf-8")):
        if local(url) and not exists(css.parent, url): broken.append("%s points at %s, which is not in the repo or not served" % (css.relative_to(root), url))
capped("link: ", broken)

# 4. cache versions
ASSET = re.compile(r"(?:^|/)(?:css|js)/[^/?#]+\.(?:css|js)(?:\?|#|$)")
seen, bare = {}, []
for page in pages:
    for u in refs[page]:
        if not ASSET.search(u): continue
        v = re.search(r"[?&]v=(\d+)", u)
        if v: seen.setdefault(v.group(1), set()).add(str(page.relative_to(root)))
        else: bare.append("%s loads %s without ?v=, so browsers keep an old copy" % (page.relative_to(root), u))
capped("cache: ", bare)
if len(seen) > 1: fail("cache versions differ between pages: " + "; ".join("v=%s on %d page(s), e.g. %s" % (v, len(ps), sorted(ps)[0]) for v, ps in sorted(seen.items()))
                      + " (a new static page goes in the page list of tools/bump.sh)")
loaded = set()   # the css/ and js/ files pages load with ?v=
for page in pages:
    for u in refs[page]:
        got = resolve(page.parent, u) if ASSET.search(u) and "v=" in u else None
        if got and root in got[0].parents: loaded.add(str(got[0].relative_to(root)))
live = subprocess.run(["git", "-C", str(root), "rev-parse", "--verify", "-q", "refs/remotes/origin/live^{commit}"], capture_output=True, text=True).stdout.strip()
if live and len(seen) == 1:
    now = next(iter(seen))
    then = re.search(r"(?:css|js)/[\w.-]+\.(?:css|js)\?v=(\d+)", subprocess.run(["git", "-C", str(root), "show", live + ":atlas.html"], capture_output=True, text=True).stdout)
    moved = subprocess.run(["git", "-C", str(root), "diff", "--name-only", live, "--", "css", "js"], capture_output=True, text=True).stdout.split()
    stale = sorted(set(moved) & loaded)
    if then and then.group(1) == now and stale:
        fail("cache: %s changed since the live version but ?v= is still %s, so visitors keep the old copy: run sh tools/bump.sh" % (", ".join(stale), now))
elif not live and CI: fail("cache: the live branch was not fetched, so a change without a new ?v= cannot be seen")
elif not live: print("note: no origin/live here (git fetch origin), changes without a new ?v= not checked")
sw = (root / "service-worker.js").read_text(encoding="utf-8")
m = re.search(r"const VERSION = 'v(\d+)'", sw)
if not m: fail("cache: service-worker.js has no VERSION line")
elif len(seen) == 1 and m.group(1) not in seen: fail("cache: service-worker.js is v%s, the pages v%s: run python3 tools/build-sw.py" % (m.group(1), next(iter(seen))))
assets = re.search(r"const ASSETS = \[(.*?)\];", sw, re.S)
for a in re.findall(r"'([^']+)'", assets.group(1) if assets else ""):
    if not exists(root, a if a != "./" else "index.html"): fail("cache: service-worker.js caches %s, which is not in the repo" % a)

# 5. secrets
SECRET = re.compile(r"\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}|\bwhsec_[0-9A-Za-z]{16,}|\bgh[opsur]_[0-9A-Za-z]{30,}"
                    r"|\bgithub_pat_[0-9A-Za-z_]{30,}|\bEAA[0-9A-Za-z]{40,}|\bIGAA[0-9A-Za-z_-]{40,}|\bxox[abpr]-[0-9A-Za-z-]{10,}"
                    r"|\bAKIA[0-9A-Z]{16}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----|webhooks-webhosting\.[a-z.]+/1\.0/vcs/github/push/[A-Za-z0-9._-]{40,}")
PLANTED = ["sk_" + "live_" + "Z" * 24, "rk_" + "test_" + "Z" * 24, "whsec_" + "Z" * 32, "gh" + "o_" + "Z" * 36, "github_" + "pat_" + "Z" * 40,
           "E" + "AA" + "Z" * 60, "IG" + "AA" + "Z" * 60, "-----BEGIN " + "RSA PRIVATE KEY-----",
           "xo" + "xb-" + "Z" * 20, "AK" + "IA" + "Z" * 16, "https://webhooks-" + "webhosting.eu.ovhapis.com/1.0/vcs/github/push/" + "Z" * 48]
for planted in PLANTED:
    if not SECRET.search("x = '%s';" % planted): fail("secrets: the scanner missed a planted fake (%s…), so its silence proves nothing" % planted[:6])
for f in tracked():   # every tracked file, read as bytes: no extension or encoding lets one through
    try: data = f.read_bytes().decode("utf-8", errors="replace")
    except OSError: continue
    for m in SECRET.finditer(data):   # the logs are public: say where, never any character of what
        fail("secret: %s line %d holds something shaped like a key, token or deploy-hook address" % (f.relative_to(root), data.count("\n", 0, m.start()) + 1))
for f in tracked():
    rel = f.relative_to(root)
    if (rel.name in ("config.php", "hmac.key") or rel.name.startswith(".env") or rel.suffix in (".key", ".p12", ".pfx")
            or "copius-private" in rel.parts or str(rel) == "js/_premium.js"):
        fail("secret: %s is tracked; credentials and the full bundle never go in the repository (the repository is public: rotate whatever it held)" % rel)

# 6. generated files: run on a copy of the tracked files (social/'s media are not needed), never on the repo
GENERATORS = [[node, "tools/build-free.js"], [sys.executable, "tools/build-sw.py"], [node, "tools/dump-dishes.js"],
              [sys.executable, "tools/build-og.py"], [sys.executable, "tools/build-pages.py"]]   # bump.sh's order, minus the version bump
LASTMOD = re.compile(rb"<lastmod>[^<]*</lastmod>")
if node:
    with tempfile.TemporaryDirectory() as tmp:
        copy = pathlib.Path(tmp) / "site"
        kept = [f.relative_to(root) for f in tracked() if f.relative_to(root).parts[0] != "social" and f.is_file()]
        for rel in kept:
            (copy / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(root / rel, copy / rel)
        stopped = None
        for cmd in GENERATORS:
            # build-og.py writes index.html, then renders the share card with macOS's qlmanage: without a PATH it
            # stops there, on every machine alike, after the part compared here
            og = cmd[1] == "tools/build-og.py"
            env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", **({"PATH": ""} if og else {}))   # no __pycache__ in the copy
            r = subprocess.run(cmd, capture_output=True, text=True, cwd=str(copy), env=env)
            if r.returncode != 0 and not (og and "qlmanage" in r.stderr):
                stopped = "%s stopped: %s" % (cmd[1], ((r.stderr or r.stdout).strip().splitlines() or ["?"])[-1])
                break
        if stopped: fail("generated: " + stopped)
        else:
            norm = lambda rel, b: LASTMOD.sub(b"", b) if rel.name == "sitemap.xml" else b
            changed = [str(rel) for rel in kept if not (copy / rel).is_file() or norm(rel, (copy / rel).read_bytes()) != norm(rel, (root / rel).read_bytes())]
            gone = [r for r in changed if not (copy / r).is_file()]
            capped("generated: ", ["%s differs from what the generators write: run sh tools/bump.sh and commit" % r for r in changed if r not in gone])
            capped("generated: ", ["%s is no longer generated (left over): run sh tools/bump.sh and commit the removal" % r for r in gone])
            made = sorted(str(p.relative_to(copy)) for p in copy.rglob("*") if p.is_file())
            new = sorted(set(made) - {str(r) for r in kept})
            ignored = set(subprocess.run(["git", "-C", str(root), "check-ignore", "--no-index", "--stdin"], input="\n".join(new),
                                         capture_output=True, text=True).stdout.split("\n")) if new else set()
            capped("generated: ", ["%s is generated but not committed: run sh tools/bump.sh and commit it" % r for r in new if r not in ignored])
elif CI: fail("generated: node is missing on the runner")
else: print("note: node missing here, generated files not compared")

# 7. PHP
if php:
    for f in tracked("api/*.php"):
        r = subprocess.run([php, "-l", str(f)], capture_output=True, text=True)
        out = (r.stdout + r.stderr).strip().splitlines() or ["?"]   # "Errors parsing" alone says nothing: show the parse error
        if r.returncode != 0: fail("PHP %s: %s" % (f.relative_to(root), next((l for l in out if "error:" in l.lower()), out[0]).strip()))
elif CI: fail("PHP: php is missing on the runner")
else: print("note: php missing here, api/*.php not linted (GitHub does it)")

for f in failures: print("FAIL " + f)
print("%d page(s) checked: %s" % (len(pages), "all good" if not failures else "%d failure(s)" % len(failures)))
sys.exit(1 if failures else 0)
