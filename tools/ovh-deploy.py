# Run by .github/workflows/deploy.yml right after `live` moves: asks OVH's API to deploy `live`, then waits until
# copius.fr serves this commit. GitHub's webhook on `live` was the only trigger until OVH kept refusing it with a bare
# 401 from 27 Oct 2026, while every run stayed green and the site stayed old. The API key's only rights are the deploy
# calls of this hosting's sites (Actions secrets OVH_APP_KEY, OVH_APP_SECRET, OVH_CONSUMER_KEY, and OVH_SERVICE, the
# hosting's name, kept out of this public file and out of the log); a second deploy of the same `live` changes nothing.
# A refused call is red at once, whatever the site shows. Once OVH took it, the files the move changed and the front
# pages are compared with the site: the run is green only when every one comes out as committed (a deleted one as a
# 404 or a redirect) and the full version's data still answers 404, once SETTLE has passed since OVH took the call, so
# a deploy that breaks the site or opens the paid files goes red too, and red if one is still off WAIT after that.
import hashlib, http.client, json, os, re, subprocess, sys, time, urllib.error, urllib.parse, urllib.request

API = "https://eu.api.ovh.com/1.0"
SITE = "https://copius.fr/"
# ASSUMED ASK = 6 min: how long OVH takes to deploy the whole site is unknown. The checks take 2 to 4 minutes, so ASK
# and WAIT together stay inside the job's 25.
WAIT, SETTLE, EVERY, ASK, GAP = 12 * 60, 3 * 60, 15, 6 * 60, 30
LOOK = 12
# What the site never serves as is: .htaccess answers 404 for tools/, docs/ and any name starting with . or _ at any
# depth, and the PHP under api/ is not what the site sends.
NOT_SERVED = ("tools/", "docs/", "api/")
# api/card.php answers social/'s cards only on their days (.htaccess); social/reels/ is served as committed.
CARD = re.compile(r"social/[a-z0-9-]+(\.2)?\.jpg")
# js/ answers 404 for anything else, the full version's data above all (.htaccess, PUBLISHED_JS in tools/validate.js).
PUBLIC_JS = ("js/app.js", "js/i18n.js", "js/photos.js", "js/page.js", "js/free.js", "js/data-techniques.js")
# One of each family of those files, asked every run: if one answers, paid content is public.
LOCKED = ("js/data-meat.js", "js/trios-premium.js", "js/plate.js")
# No .mp4: a reel is 12 MB on every pass, and social/reels.json and the covers land with it.
SERVED = (".html", ".css", ".js", ".xml", ".json", ".txt", ".svg", ".png", ".jpg", ".webp", ".ico", ".pdf", ".woff2")
# Loaded on every visit, and rewritten by every version bump.
FRONT = ("index.html", "atlas.html", "css/style.css", "js/app.js", "js/i18n.js", "service-worker.js")
# What a deploy task can be once OVH took it; `cancelled` is the other value in OVH's schema.
TAKEN = ("init", "todo", "doing", "done")
# A network blip, a connection cut mid-answer included: http.client's errors are not OSErrors.
NET = (urllib.error.URLError, OSError, http.client.HTTPException)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):   # a redirect would carry the signed headers to another address, and a retired
        return None                      # page's redirect would read as its target's bytes


def git(*args):
    return subprocess.run(("git",) + args, stdout=subprocess.PIPE, check=True).stdout   # git's errors reach the log


def ask_once(keys):
    # None when OVH took it; otherwise (why, worth asking again).
    ak, secret, ck, service = keys

    def hide(text):   # the log's mask misses a cut or escaped copy
        for key in keys:
            text = text.replace(key, "***")
        return text

    url = API + "/hosting/web/" + service + "/website/4230679/deploy"
    body = '{"reset":false}'
    try:
        ts = urllib.request.urlopen(API + "/auth/time", timeout=15).read().decode().strip()
        sig = "$1$" + hashlib.sha1("+".join([secret, ck, "POST", url, body, ts]).encode()).hexdigest()
        req = urllib.request.Request(url, data=body.encode(), method="POST", headers={
            "Content-Type": "application/json", "X-Ovh-Application": ak, "X-Ovh-Consumer": ck,
            "X-Ovh-Timestamp": ts, "X-Ovh-Signature": sig})
        with urllib.request.build_opener(NoRedirect).open(req, timeout=30) as r:
            task = json.load(r)
    except urllib.error.HTTPError as e:
        try:
            why = hide(e.read().decode("utf-8", "replace"))[:300]
        except NET + (ValueError,):
            why = "its answer was cut off"
        return "OVH refused the deploy (%d): %s" % (e.code, why), e.code == 409 or e.code >= 500
    except (urllib.error.URLError, OSError) as e:
        return "OVH's API could not be reached: " + hide(str(e)), True
    except (http.client.HTTPException, ValueError) as e:
        # The type alone: the URL or header value it may be complaining about holds the name or a key.
        return "OVH's API answered with something this script cannot read (%s)" % type(e).__name__, False
    status = task.get("status") if isinstance(task, dict) else None
    if status not in TAKEN:
        return "OVH answered without taking the deploy (task status %s)" % hide(str(status))[:40], False
    print("OVH took the deploy: task %s, %s" % (hide(str(task.get("id")))[:40], status))
    return None


def deploy():
    keys = [os.environ.get(k, "").strip() for k in ("OVH_APP_KEY", "OVH_APP_SECRET", "OVH_CONSUMER_KEY", "OVH_SERVICE")]
    if not all(keys):
        return "the OVH_* secrets are not set, so no deploy was asked"
    # Bounded, and a second deploy changes nothing: a blip, a 5xx, or a 409, OVH's answer while another deployment runs,
    # which may have started before `live` moved.
    deadline = time.time() + ASK
    while True:
        answer = ask_once(keys)
        if answer is None:
            return None
        if not answer[1] or time.time() >= deadline:
            return answer[0]
        time.sleep(GAP)


def fetch(path):
    # The site's bytes, its error status, or None on a network blip. A fresh query every time, and no-cache, so that
    # no cache between here and the site answers with what it kept from an earlier fetch.
    url = SITE + urllib.parse.quote(path[:-len("index.html")] if path.endswith("index.html") else path)
    req = urllib.request.Request(url + "?deploy=%d" % time.time_ns(), headers={"Cache-Control": "no-cache"})
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=20) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        return e.code
    except NET:
        return None   # a network blip: the next pass asks again


def committed(path):
    if not os.path.isfile(path):
        return 404   # deleted by the move: the site must stop serving it
    with open(path, "rb") as f:
        return f.read()


def served(path):
    if path.startswith(NOT_SERVED) or CARD.fullmatch(path) or any(part[0] in "._" for part in path.split("/")):
        return False
    return path in PUBLIC_JS if path.startswith("js/") else path.endswith(SERVED)


def landed(path, got):
    want = expected[path]
    return got == want or (want == 404 and isinstance(got, int) and 300 <= got < 400)


def files():
    # The checkout's origin/live is the old `live`, fetched before the move, so the diff lists what the move changed.
    # On a re-run or a dispatch `live` already was this commit, and the commit's own changes stand in (deploy.yml
    # fetches live two commits deep for this). Bounded: LOOK files from the move, first to last, then the front pages.
    base = "refs/remotes/origin/live"
    if git("rev-parse", base) == git("rev-parse", "HEAD"):
        base = "HEAD^"
    names = [os.fsdecode(n) for n in git("diff", "-z", "--name-only", "--no-renames", base, "HEAD").split(b"\0")]
    moved = [p for p in names if p and served(p)]
    if not moved:
        print("::warning::this push changed no file the run can compare, so green only means OVH took the call and the "
              "site still answers: OVH's deployment history is the proof")
    picks = moved
    if len(moved) > LOOK:
        print("%d changed files, comparing %d from first to last" % (len(moved), LOOK))
        picks = [moved[i * (len(moved) - 1) // (LOOK - 1)] for i in range(LOOK)]
    return {**{p: committed(p) for p in picks + [p for p in FRONT if p not in picks]}, **{p: 404 for p in LOCKED}}


picked = None
try:
    expected = files()
except (subprocess.CalledProcessError, OSError) as e:
    # Comparing is only how the run checks the deploy: the deploy is still asked for, then the run is red.
    picked = "the files to compare could not be picked (%s)" % type(e).__name__

problem = deploy()
if problem or picked:
    print("::error::" + "; ".join(filter(None, (problem, picked))))
    sys.exit(1)

asked = time.time()   # after any asking again, which must not eat the window that catches a deploy breaking the site
while True:
    last = {p: fetch(p) for p in expected}
    pending = [p for p in expected if not landed(p, last[p])]
    waited = time.time() - asked
    if (not pending and waited >= SETTLE) or waited > WAIT:
        break
    time.sleep(EVERY)
if pending:
    def says(p):
        r = last[p]
        if r is None or isinstance(r, int):
            return "no answer" if r is None else "HTTP %d" % r
        return "the file itself, not a 404" if expected[p] == 404 else "another copy"
    print("::error::%d minutes after the deploy, copius.fr still answers %s" % (
        WAIT // 60, ", ".join("%s with %s" % (p, says(p)) for p in pending)))
    sys.exit(1)
print("copius.fr serves this commit's " + ", ".join(expected))
