#!/usr/bin/env python3
"""Build cgv/index.html (https://copius.fr/cgv/) from the two Markdown files of
the terms of sale: the French text (binding) first, the English translation
under id="cgv-en". Re-run it to regenerate the page; it then checks the result.

    python3 tools/build-cgv.py <cgv-copius-VERSION-fr.md> <cgv-copius-VERSION-en.md> [--print DIR]

The version comes from the file names and names the two PDFs the page links,
copius-cgv-VERSION-fr.pdf and -en.pdf, which sit next to the page and which the
order confirmation attaches. With --print, one print-ready HTML file per
language is also written to DIR, for a browser to print to those PDFs.

The text is never retyped: each Markdown line is converted, escaped and given
French typography by the rules below, and the check at the end compares every
source line with the page. Standard library only; tools/ is never served."""
import html
import pathlib
import re
import sys
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "cgv" / "index.html"
FR_MD = EN_MD = None          # set from the command line
PDF_FR = PDF_EN = None

NBSP, NNBSP, STAR = " ", " ", ""   # STAR stands for an escaped \*

PAGE = """<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<script>try{var t=localStorage.getItem("copius-theme"),r=document.documentElement;if(t==="dark"||t==="light"){r.setAttribute("data-theme",t);var m=document.createElement("meta");m.name="theme-color";m.content=t==="dark"?"#14160F":"#F7F6F1";document.head.appendChild(m)}}catch(e){}</script>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conditions générales de vente · Terms of sale — Copius</title>
<meta name="description" content="Conditions générales de vente de l’abonnement à la version complète de Copius, avec leur traduction anglaise. Terms of sale of the Copius full-version subscription; the French text is the binding one.">
<link rel="canonical" href="https://copius.fr/cgv/">
<meta name="tdm-reservation" content="1">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<link rel="icon" sizes="192x192" href="/icons/icon-192.png">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#F7F6F1">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#14160F">
<link rel="stylesheet" href="../css/page.css?v=@@V@@">
<style>
  main{overflow-wrap:break-word}
  .sep{border:0;border-top:1px solid var(--border);margin:40px 0 32px}
  .switch{margin:4px 0 22px;font-size:14px}
  .n{font-weight:600;color:var(--ink)}
  ul,ol{margin:0 0 14px;padding-left:22px;color:var(--ink-2)}
  li{margin:0 0 4px}
  .box{margin:16px 0 20px;padding:14px 16px;background:var(--card);border:1px solid var(--border);border-radius:12px;font-size:14.5px}
  .box p{margin:0 0 10px}
  .box p:last-child{margin:0}
  @media print{
    *{color:#000!important;background:#fff!important;border-color:#000!important}
    header,footer,.switch,.sep{display:none}
    main{max-width:none;padding:0}
    body{font-size:11pt;line-height:1.45}
    a{text-decoration:none}
    h1,h2{break-after:avoid}
    p,li{orphans:3;widows:3}
    #cgv-en{break-before:page}
  }
</style>
</head>
<body>
<header>
  <a class="home" href="../">Copius</a>
  <nav><a href="../about/">À propos · <span lang="en">About</span></a> · <a href="../atlas.html">Ouvrir l’atlas · <span lang="en">Open the atlas</span></a></nav>
</header>

<main>

<div lang="fr" id="cgv-fr">

@@FR@@

</div>

<hr class="sep">

<div lang="en" id="cgv-en">

@@EN@@

</div>

</main>

<footer>
  <a href="../resilier/">Résilier votre contrat</a> · <a href="../renoncer/">Renoncer au contrat ici</a> · <a href="../confidentialite/">Confidentialité</a><br>
  <a href="../resilier/">Cancel your contract</a> · <a href="../renoncer/">Withdraw from contract here</a> · <a href="../confidentialite/">Privacy</a><br>
  Copius — Gabriel Gracian-Leroudier, entrepreneur individuel (Nokime) · <a href="mailto:contact@copius.fr">contact@copius.fr</a>
</footer>
</body>
</html>
"""

def switch(pfx):
    if pfx == "fr":
        return '<p class="switch"><a href="%s">Télécharger en PDF</a> · <a href="#cgv-en">English translation ↓</a></p>' % PDF_FR
    return '<p class="switch"><a href="%s">Download as PDF</a> · <a href="#cgv-fr" lang="fr">Lire en français ↑</a></p>' % PDF_EN

# ---- inline ---------------------------------------------------------------

TOKEN = re.compile(
    r"\*\*(?P<b>.+?)\*\*"
    r"|\*(?P<i>[^*\s](?:[^*]*[^*\s])?)\*"
    r"|(?P<u>https?://[^\s<>\"]+)")


def typo(s, fr):
    """Typography of a plain-text run. Both languages: curly apostrophes and
    quotes, no-break digit groups, narrow no-break space inside « ». French
    only: no-break space before « : » and « % » and before a € sign, narrow
    no-break space before « ; ? ! »."""
    s = re.sub(r"(?<=\w)'(?=\w)", "’", s)
    s = re.sub(r'"([^"]+)"', (lambda m: "« %s »" % m.group(1)) if fr
               else (lambda m: "“%s”" % m.group(1)), s)
    s = re.sub(r"(?<=\d) (?=\d{3}\b)", NBSP, s)
    s = re.sub(r"(?<=\b[LRD]\.) (?=\d)", NBSP, s)        # L. 215-1, R. 221-1
    s = re.sub(r"(?<=\d) (?=[A-Z]\b)", NBSP, s)           # 293 B
    s = re.sub(r"(?<=\d) (?=[€%])", NBSP, s)
    s = re.sub(r"«\s*", "«" + NNBSP, s)
    s = re.sub(r"\s*»", NNBSP + "»", s)
    if fr:
        s = re.sub(r"[  ]+:", NBSP + ":", s)
        s = re.sub(r"[  ]+([;?!])", NNBSP + r"\1", s)
    return s


def text(s, fr):
    s = html.escape(typo(s, fr), quote=False)
    return s.replace(NBSP, "&nbsp;").replace(NNBSP, "&#8239;").replace(STAR, "*")


def inline(s, fr):
    s = s.replace("\\*", STAR)
    out, pos = [], 0
    for m in TOKEN.finditer(s):
        out.append(text(s[pos:m.start()], fr))
        if m.group("b") is not None:
            out.append("<strong>%s</strong>" % inline(m.group("b"), fr))
        elif m.group("i") is not None:
            out.append("<em>%s</em>" % inline(m.group("i"), fr))
        else:
            url, trail = m.group("u"), ""
            while url[-1] in ".,;:!?)":
                url, trail = url[:-1], url[-1] + trail
            out.append('<a href="%s" rel="noopener">%s</a>%s' % (
                html.escape(url, quote=True), html.escape(url, quote=False), text(trail, fr)))
        pos = m.end()
    out.append(text(s[pos:], fr))
    return "".join(out)


# ---- blocks ---------------------------------------------------------------

NUM = re.compile(r"(\d+(?:\.\d+)+\.)\s+")
HEAD = re.compile(r"(#{1,3})\s+(.*)")
ITEM = re.compile(r"(?:- |\d+\. +)(.*)")


def heading_id(title, pfx):
    m = re.match(r"(\d+)\.", title) or re.match(r"(?:Annexe|Annex) (\d+)", title)
    if not m:
        return ""
    return ' id="%s-%s%s"' % (pfx, "art-" if title[0].isdigit() else "annexe-", m.group(1))


def blocks(lines, fr, pfx):
    out, para, i = [], [], 0

    def flush():
        if para:
            m = NUM.match(para[0])
            head = ""
            if m:
                head, para[0] = '<span class="n">%s</span> ' % m.group(1), para[0][m.end():]
            out.append("<p>%s%s</p>" % (head, "<br>\n".join(inline(l, fr) for l in para)))
            del para[:]

    while i < len(lines):
        ln = lines[i]
        if not ln.strip():
            flush()
            i += 1
        elif ln.startswith(">"):
            flush()
            quote = []
            while i < len(lines) and lines[i].startswith(">"):
                quote.append(re.sub(r"^> ?", "", lines[i]))
                i += 1
            out.append('<blockquote class="box">\n%s\n</blockquote>' % "\n".join(blocks(quote, fr, pfx)))
        elif re.fullmatch(r"-{3,}", ln.strip()):
            flush()
            out.append('<hr class="sep">')
            i += 1
        elif HEAD.fullmatch(ln):
            flush()
            hashes, title = HEAD.fullmatch(ln).groups()
            n = len(hashes)
            out.append("<h%d%s>%s</h%d>" % (n, heading_id(title, pfx) if n == 2 else "", inline(title, fr), n))
            i += 1
        elif ITEM.fullmatch(ln):
            flush()
            tag = "ul" if ln.startswith("- ") else "ol"
            items = []
            while i < len(lines) and ITEM.fullmatch(lines[i]) and lines[i].startswith("- ") == (tag == "ul"):
                items.append("<li>%s</li>" % inline(ITEM.fullmatch(lines[i]).group(1), fr))
                i += 1
            out.append("<%s>\n%s\n</%s>" % (tag, "\n".join(items), tag))
        else:
            para.append(ln)
            i += 1
    flush()
    return out


def render(md_path, fr):
    pfx = "fr" if fr else "en"
    body = blocks(md_path.read_text(encoding="utf-8").splitlines(), fr, pfx)
    assert body[0].startswith("<h1"), "the Markdown must open with a # title"
    body.insert(1, switch(pfx))
    out = "\n\n".join(body)
    if not fr:
        # The French words inside the translation (names of the functions and
        # buttons, the French title) are marked so screen readers say them in French.
        out = re.sub(r"«&#8239;(.*?)&#8239;»", r'<span lang="fr">«&#8239;\1&#8239;»</span>', out)
        out = re.sub(r"<em>(Conditions générales de vente[^<]*)</em>", r'<em lang="fr">\1</em>', out)
    return out


PRINT = """<!doctype html>
<html lang="%s"><head><meta charset="utf-8"><title>%s</title>
<style>
  @page{size:A4;margin:18mm 17mm}
  body{font:10.5pt/1.45 Georgia,"Times New Roman",serif;color:#000;background:#fff}
  h1{font-size:17pt;margin:0 0 4pt}h2{font-size:12.5pt;margin:14pt 0 5pt;break-after:avoid}h3{font-size:11pt}
  p,li{orphans:3;widows:3}p{margin:0 0 6pt}ul,ol{margin:0 0 6pt;padding-left:16pt}
  .switch,.sep{display:none}.n{font-weight:bold}a{color:#000;text-decoration:none}
  .box{border:1px solid #000;padding:6pt 8pt;margin:8pt 0}
</style></head><body>
%s
</body></html>
"""


# ---- check ----------------------------------------------------------------

class Page(HTMLParser):
    """Collects the text of each language region and flags unbalanced tags."""
    VOID = {"meta", "link", "br", "hr", "img", "input"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.region, self.text, self.errors = [], None, {"fr": [], "en": []}, []

    def handle_starttag(self, tag, attrs):
        if tag in self.VOID:
            return
        self.stack.append((tag, dict(attrs).get("id")))
        rid = dict(attrs).get("id")
        if tag == "div" and rid in ("cgv-fr", "cgv-en"):
            self.region = rid[-2:]

    def handle_endtag(self, tag):
        if tag in self.VOID:
            return
        if not self.stack or self.stack[-1][0] != tag:
            self.errors.append("unbalanced </%s> at line %d" % (tag, self.getpos()[0]))
            return
        _, rid = self.stack.pop()
        if rid in ("cgv-fr", "cgv-en"):
            self.region = None

    def handle_data(self, data):
        if self.region:
            self.text[self.region].append(data)


def norm(s):
    s = s.replace(NBSP, " ").replace(NNBSP, " ").replace("’", "'").replace("“", '"').replace("”", '"')
    s = re.sub(r"\*\*|\\\*", lambda m: "*" if m.group() == "\\*" else "", s)
    return re.sub(r"\s+", " ", s).strip()


def check(page_html):
    p = Page()
    p.feed(page_html)
    p.close()
    problems = list(p.errors)
    if p.stack:
        problems.append("unclosed tags: %s" % [t for t, _ in p.stack])
    for lang, path in (("fr", FR_MD), ("en", EN_MD)):
        md = path.read_text(encoding="utf-8")
        page_text = norm("".join(p.text[lang]))
        # every article number (7.2.) and every article heading is on the page
        numbers = re.findall(r"^(\d+(?:\.\d+)+)\. ", md, re.M) + re.findall(r"^## (\d+)\. ", md, re.M)
        for n in numbers:
            if not re.search(r"(?<![\d.])%s\. " % re.escape(n), page_text):
                problems.append("%s: article %s. missing" % (lang, n))
        # every source line, stripped of its Markdown, is on the page
        lines = 0
        for ln in md.splitlines():
            src = re.sub(r"^(?:>\s?|#{1,3}\s+|- |\d+\. +)+", "", ln)
            src = norm(re.sub(r"(?<!\\)\*+", "", src))
            if src and not re.fullmatch(r"-{3,}", src):
                lines += 1
                if src not in page_text:
                    problems.append("%s: line not on the page: %.60s" % (lang, src))
        # no Markdown markers left; no regular space where French typography wants none
        raw = "".join(p.text[lang])
        for marker in ("**", "## ", "\\*"):
            if marker in raw:
                problems.append("%s: Markdown marker %r left in the text" % (lang, marker))
        if re.search(r"[\"']", raw):
            problems.append("%s: straight quote left in the text" % lang)
        if lang == "fr" and re.search(r" [:;?!»%€]|« |\d [€%]", raw):
            problems.append("fr: regular space where a no-break space belongs")
        print("%s: %d article numbers, %d source lines found on the page" % (lang, len(numbers), lines))
    return problems


def main():
    global FR_MD, EN_MD, PDF_FR, PDF_EN
    args = sys.argv[1:]
    printdir = None
    if "--print" in args:
        k = args.index("--print"); printdir = pathlib.Path(args[k + 1]); del args[k:k + 2]
    if len(args) != 2:
        sys.exit(__doc__)
    FR_MD, EN_MD = pathlib.Path(args[0]), pathlib.Path(args[1])
    m = re.fullmatch(r"cgv-copius-(\d{4}-\d{2}-\d{2})-fr\.md", FR_MD.name)
    if not m or EN_MD.name != "cgv-copius-%s-en.md" % m.group(1):
        sys.exit("expected cgv-copius-VERSION-fr.md and cgv-copius-VERSION-en.md, the same VERSION")
    PDF_FR, PDF_EN = "copius-cgv-%s-fr.pdf" % m.group(1), "copius-cgv-%s-en.pdf" % m.group(1)
    fr_html, en_html = render(FR_MD, True), render(EN_MD, False)
    # The asset version the other pages carry, read where bump.sh moves it.
    v = re.search(r"\?v=(\d+)", (ROOT / "atlas.html").read_text()).group(1)
    page = PAGE.replace("@@FR@@", fr_html).replace("@@EN@@", en_html).replace("@@V@@", v)
    if printdir:
        printdir.mkdir(parents=True, exist_ok=True)
        for lang, body, title in (("fr", fr_html, "Conditions générales de vente — Copius"), ("en", en_html, "Terms of sale — Copius")):
            (printdir / ("copius-cgv-%s-%s.html" % (m.group(1), lang))).write_text(PRINT % (lang, title, body), encoding="utf-8")
        print("print files in %s" % printdir)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(page, encoding="utf-8")
    print("wrote %s (%d bytes)" % (OUT, len(page.encode("utf-8"))))
    problems = check(page)
    for pr in problems:
        print("PROBLEM:", pr)
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
