#!/usr/bin/env python3
"""Check every page before publishing: search, answer engines, and AI citation.

Run from the repo root:   python3 scripts/seo-audit.py
Exits non-zero if anything FAILS, so it can gate a commit.

Three audiences, and they want different things:
  SEO  - Google's crawler. Title and description within the pixel budget, one h1,
         a canonical, alt text, images it can fetch.
  AEO  - answer engines and voice. Question-shaped headings with short answers
         under them, and FAQPage markup so the answer can be lifted directly.
  GEO  - the models that cite sources. Structured data, a named author with dates,
         and real references, which is what makes a page quotable rather than
         merely readable.

Limits are Google's rendered width in practice, not a style preference: a title
over about 60 characters is cut off in results, and a description over about 160
is truncated mid-sentence.
"""
import os, re, sys
from html.parser import HTMLParser

TITLE_MIN, TITLE_MAX = 25, 60
DESC_MIN, DESC_MAX = 70, 160
SITE = "https://mkadri85.github.io"

FAIL, WARN = "FAIL", "warn"


def text_of(pattern, html, group=1):
    m = re.search(pattern, html, re.S | re.I)
    return re.sub(r"\s+", " ", m.group(group)).strip() if m else None


def meta(name, html, attr="name"):
    return text_of(rf'<meta[^>]+{attr}=["\']{name}["\'][^>]+content=["\']([^"\']*)["\']', html) \
        or text_of(rf'<meta[^>]+content=["\']([^"\']*)["\'][^>]+{attr}=["\']{name}["\']', html)


class Headings(HTMLParser):
    def __init__(self):
        super().__init__(); self.levels = []; self._cur = None; self.h1s = []
    def handle_starttag(self, tag, attrs):
        if re.fullmatch(r"h[1-6]", tag):
            self.levels.append(int(tag[1])); self._cur = tag
    def handle_data(self, data):
        if self._cur == "h1" and data.strip():
            self.h1s.append(data.strip())
    def handle_endtag(self, tag):
        if tag == self._cur:
            self._cur = None


def audit(path, html, is_article):
    out = []
    def add(level, check, detail): out.append((level, check, detail))

    title = text_of(r"<title>(.*?)</title>", html)
    if not title:
        add(FAIL, "title", "missing")
    elif len(title) > TITLE_MAX:
        add(FAIL, "title", f"{len(title)} chars, cut off in results above {TITLE_MAX}: {title!r}")
    elif len(title) < TITLE_MIN:
        add(WARN, "title", f"only {len(title)} chars, room to say more: {title!r}")

    desc = meta("description", html)
    if not desc:
        add(FAIL, "description", "missing")
    elif len(desc) > DESC_MAX:
        add(FAIL, "description", f"{len(desc)} chars, truncated above {DESC_MAX}")
    elif len(desc) < DESC_MIN:
        add(WARN, "description", f"only {len(desc)} chars")

    if not re.search(r'<link[^>]+rel=["\']canonical["\']', html, re.I):
        add(FAIL, "canonical", "missing")
    if not re.search(r'<html[^>]+lang=', html, re.I):
        add(FAIL, "lang", "no lang attribute on <html>")

    h = Headings(); h.feed(html)
    n_h1 = h.levels.count(1)
    if n_h1 == 0: add(FAIL, "h1", "no h1")
    elif n_h1 > 1: add(FAIL, "h1", f"{n_h1} h1 elements, should be exactly one")
    prev = 0
    for lv in h.levels:
        if prev and lv > prev + 1:
            add(WARN, "headings", f"jumps from h{prev} to h{lv}"); break
        prev = lv

    imgs = re.findall(r"<img[^>]*>", html, re.I)
    noalt = [i for i in imgs if not re.search(r'\balt=', i, re.I)]
    if noalt:
        add(FAIL, "alt text", f"{len(noalt)} of {len(imgs)} images have no alt")

    for prop in ("og:title", "og:description", "og:image", "og:url", "og:type"):
        if not meta(prop, html, attr="property"):
            add(FAIL if prop == "og:image" else WARN, "open graph", f"{prop} missing")
    if not meta("twitter:card", html):
        add(WARN, "twitter", "twitter:card missing")

    blocks = re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', html, re.S | re.I)
    kinds = set(re.findall(r'"@type"\s*:\s*"([^"]+)"', " ".join(blocks)))
    if not blocks:
        add(FAIL, "structured data", "no JSON-LD - models and answer engines have nothing to lift")
    if is_article:
        for want in ("Article", "BlogPosting", "TechArticle"):
            if want in kinds: break
        else:
            add(WARN, "structured data", f"no Article type, found: {sorted(kinds) or 'none'}")
        if "FAQPage" not in kinds:
            add(WARN, "AEO", "no FAQPage markup - the Q&A cannot be lifted into an answer box")
        if not re.search(r'"datePublished"', html):
            add(WARN, "GEO", "no datePublished - models weight dated sources higher")
        if not re.search(r'"author"', html):
            add(WARN, "GEO", "no author in structured data")
        refs = len(re.findall(r'<li id="ref-\d+"', html))
        cites = len(set(re.findall(r'href="#ref-(\d+)"', html)))
        if refs == 0:
            add(WARN, "GEO", "no reference list - cited pages get quoted more often")
        elif cites < refs:
            add(WARN, "GEO", f"{refs - cites} of {refs} references never cited in the text")
        qs = re.findall(r'<h[23][^>]*>([^<]*\?)</h[23]>', html)
        if not qs:
            add(WARN, "AEO", "no question-shaped heading - answer engines match on questions")
    return out


def main():
    root = "."
    pages, failed = 0, 0
    results = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules", "assets")]
        for fn in sorted(filenames):
            if not fn.endswith(".html"):
                continue
            path = os.path.relpath(os.path.join(dirpath, fn), root)
            html = open(path, encoding="utf-8", errors="replace").read()
            is_article = path.startswith("blog/") and path != "blog/index.html"
            issues = audit(path, html, is_article)
            pages += 1
            if issues:
                results.append((path, issues))
            if any(l == FAIL for l, _, _ in issues):
                failed += 1

    for path, issues in results:
        print(f"\n{path}")
        for level, check, detail in issues:
            mark = "  FAIL " if level == FAIL else "  warn "
            print(f"{mark}{check:18s} {detail}")

    total_fail = sum(1 for _, i in results for l, _, _ in i if l == FAIL)
    total_warn = sum(1 for _, i in results for l, _, _ in i if l == WARN)
    print(f"\n{pages} pages checked - {total_fail} failures on {failed} pages, {total_warn} warnings")
    return 1 if total_fail else 0


sys.exit(main())
