#!/usr/bin/env python3
"""A stand-in for the sign-in API, to exercise the client without PHP. It serves
the checkout like the dev server and answers /api/*.php with canned responses:
no tokens, no limits, no database. The real endpoints are in DESIGN.md
(kairos/copius-step2), section 2.

    python3 tools/signin-stub.py [port]          default 8658
    GET /api/stub?verify=410&premium=noaccess    sets what the next calls answer

  login    the status login.php answers (200)
  verify   200 sets both cookies; nocookie answers 200 and sets none; else that status
  premium  bundle (js/_premium.js, built locally) or ended | noaccess | unavailable | down
  me       the status me.php answers (200); access 1 or 0
  preview.php answers from api/_preview.json; hit.php prints its event and answers 204
  order.php prints its body; an address with « used » in it asking for a trial
  gets the « mailed » answer of a trial already had, a trial other than 0 or 7
  the 409 of a changed offer, any other the 503 of sales closed (no Stripe here)
"""
import http.server, json, pathlib, sys, urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
MODE = {"login": "200", "verify": "200", "premium": "bundle", "me": "200", "access": "1"}
MAX_AGE = "; Path=/; Secure; SameSite=Lax; Max-Age=2592000"
SET = ("__Host-copius_s=stub; HttpOnly" + MAX_AGE, "__Host-copius_full=1" + MAX_AGE)
CLEAR = ("__Host-copius_s=; Path=/; Secure; Max-Age=0", "__Host-copius_full=; Path=/; Secure; Max-Age=0")


class Stub(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)

    def answer(self, code, body=b"", ctype="application/json", cookies=()):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "private, no-store")
        for c in cookies:
            self.send_header("Set-Cookie", c)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/api/stub":
            MODE.update({k: v[0] for k, v in urllib.parse.parse_qs(u.query).items() if k in MODE})
            return self.answer(200, json.dumps(MODE).encode())
        if u.path == "/api/premium.php":
            m = MODE["premium"]
            if m == "down":
                return self.answer(503)
            if m == "bundle":
                return self.answer(200, (ROOT / "js" / "_premium.js").read_bytes(), "text/javascript")
            return self.answer(200, ('window.COPIUS_SESSION = "%s";' % m).encode(), "text/javascript",
                               CLEAR if m == "ended" else ())
        if u.path == "/api/me.php":
            if MODE["me"] != "200":
                return self.answer(int(MODE["me"]))
            me = {"email": "prof@ac-lyon.fr", "access": MODE["access"] == "1"}
            return self.answer(200, json.dumps(me).encode())
        if u.path == "/api/preview.php":
            pv = json.loads((ROOT / "api" / "_preview.json").read_text())
            ids = pv.get(urllib.parse.parse_qs(u.query).get("id", [""])[0], [])[:3]
            return self.answer(200, json.dumps({"ids": ids}).encode())
        return super().do_GET()

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/order.php":
            print("order", body.decode("utf-8", "replace"), flush=True)
            o = json.loads(body or b"{}")
            if o.get("trial", 0) not in (0, 7):
                return self.answer(409, json.dumps({"error": "offer", "trial": 7}).encode())
            if "used" in str(o.get("email", "")) and o.get("trial"):
                return self.answer(200, json.dumps({"mailed": True}).encode())
            return self.answer(503, b"{}")
        if path == "/api/login.php":
            return self.answer(int(MODE["login"]), b'{"ok":true}')
        if path == "/api/verify.php":
            v = MODE["verify"]
            return self.answer(200 if v == "nocookie" else int(v), b"{}", cookies=SET if v == "200" else ())
        if path == "/api/logout.php":
            return self.answer(204, cookies=CLEAR)
        if path == "/api/hit.php":
            print("hit", urllib.parse.urlparse(self.path).query, flush=True)
            return self.answer(204)
        self.answer(404)


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8658
http.server.ThreadingHTTPServer(("127.0.0.1", port), Stub).serve_forever()
