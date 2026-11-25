#!/usr/bin/env python3
"""P0 deep technical SEO audit for dailyfoodfighter.com (production).

Checks, for every URL in the live sitemap plus a set of negative controls:
  - HTTP status, redirect chain, final URL, soft-404 markers
  - title / meta description / robots / canonical / hreflang reciprocity
  - GA4 tag, AdSense script, viewport
  - JSON-LD: parse errors, duplicate Article/BlogPosting, FAQPage items vs visible text
  - internal links (all a[href]) status -- catches 404s and 301/308 links in body
  - images (img[src], og:image) status

Writes a JSON report and prints a summary. No writes to the repo, no external APIs.
Usage: python3 _seo/p0_deep_audit.py --out /tmp/p0_audit.json [--limit N]
"""
import argparse
import concurrent.futures as cf
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict

import lxml.html
import lxml.etree

HOST = "dailyfoodfighter.com"
BASE = f"https://{HOST}"
UA = "Mozilla/5.0 (compatible; DFF-SEO-Audit/1.0; +https://dailyfoodfighter.com/)"
GA_ID = "G-KBV8HQ5J6Z"
ADSENSE = "ca-pub-7921440641343288"
TIMEOUT = 30
WORKERS = 8

CTX = ssl.create_default_context()

_cache = {}


def fetch(url, max_redirects=8):
    """GET a URL, follow redirects manually and record the chain."""
    if url in _cache:
        return _cache[url]
    chain = []
    cur = url
    status = None
    body = ""
    ctype = ""
    err = None
    started = time.time()
    for _ in range(max_redirects + 1):
        req = urllib.request.Request(cur, headers={"User-Agent": UA, "Accept": "text/html,*/*"})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT, context=CTX) as r:
                status = r.status
                ctype = r.headers.get("content-type", "")
                cur = r.geturl()
                data = r.read()
                try:
                    body = data.decode("utf-8", "replace")
                except Exception:
                    body = ""
        except urllib.error.HTTPError as e:
            status = e.code
            ctype = e.headers.get("content-type", "") if e.headers else ""
            cur = e.geturl() if hasattr(e, "geturl") else cur
            try:
                body = e.read().decode("utf-8", "replace")
            except Exception:
                body = ""
        except Exception as e:  # DNS, TLS, timeout
            err = f"{type(e).__name__}: {e}"
            status = None
            break
        if status in (301, 302, 303, 307, 308):
            m = re.search(r'<a href="([^"]+)"', body)
            nxt = m.group(1) if m else None
            if not nxt:
                break
            chain.append({"from": cur, "status": status, "to": nxt})
            cur = nxt
            continue
        break
    res = {
        "url": url,
        "status": status,
        "final_url": cur,
        "chain": chain,
        "ctype": ctype,
        "body": body,
        "error": err,
        "elapsed_ms": int((time.time() - started) * 1000),
    }
    _cache[url] = res
    return res


def text_of(node):
    return re.sub(r"\s+", " ", node.text_content()).strip() if node is not None else ""


def analyse_html(url, body):
    out = {"jsonld": [], "links": [], "images": []}
    try:
        doc = lxml.html.fromstring(body)
    except Exception as e:
        out["parse_error"] = f"{type(e).__name__}: {e}"
        return out
    out["title"] = text_of(doc.find(".//title"))
    for m in doc.iter("meta"):
        n = (m.get("name") or m.get("property") or "").lower()
        if n == "description":
            out["description"] = (m.get("content") or "").strip()
        elif n == "robots":
            out["robots"] = (m.get("content") or "").strip()
        elif n == "viewport":
            out["viewport"] = (m.get("content") or "").strip()
        elif n == "google-adsense-account":
            out["adsense_meta"] = (m.get("content") or "").strip()
        elif n == "og:image":
            out["og_image"] = (m.get("content") or "").strip()
        elif n == "og:url":
            out["og_url"] = (m.get("content") or "").strip()
    for l in doc.iter("link"):
        rel = (l.get("rel") or "").lower()
        if rel == "canonical":
            out["canonical"] = (l.get("href") or "").strip()
        if "alternate" in rel.split() and l.get("hreflang"):
            out.setdefault("hreflang", []).append(
                {"hreflang": l.get("hreflang"), "href": (l.get("href") or "").strip()}
            )
    out["lang"] = (doc.get("lang") or "").strip()

    # GA4 / AdSense / viewport presence
    out["ga4"] = [x for x in re.findall(r"GTAG|g[tag]{1}tag|\bG-[A-Z0-9]{8,12}\b|gtag/js\?id=([A-Z0-9-]+)", body)]
    out["ga4_ids"] = sorted(set(re.findall(r"\bG-[A-Z0-9]{8,12}\b", body)))
    out["adsense"] = ADSENSE in body
    out["adsense_script"] = "adsbygoogle.js" in body

    # h1 count
    out["h1"] = [text_of(h)[:120] for h in doc.iter("h1")]

    # JSON-LD
    for s in doc.xpath('//script[@type="application/ld+json"]'):
        raw = s.text or ""
        item = {"raw_len": len(raw)}
        try:
            item["data"] = json.loads(raw)
        except Exception as e:
            item["error"] = f"{type(e).__name__}: {e}"
            item["snippet"] = re.sub(r"\s+", " ", raw)[:200]
        out["jsonld"].append(item)

    # visible text for FAQ comparison
    for bad in doc.xpath("//script|//style|//noscript"):
        if bad.getparent() is not None:
            bad.getparent().remove(bad)
    out["visible_text"] = re.sub(r"\s+", " ", doc.text_content())

    # links
    for a in doc.iter("a"):
        href = (a.get("href") or "").strip()
        if not href:
            continue
        out["links"].append({"href": href, "text": text_of(a)[:80], "rel": a.get("rel") or ""})

    # images
    for img in doc.iter("img"):
        src = (img.get("src") or "").strip()
        if src:
            out["images"].append(src)
    out["h2"] = [text_of(h)[:100] for h in doc.iter("h2")]
    out["word_count"] = len(re.findall(r"[\w가-힣]+", out.get("visible_text", "")))
    return out


def norm_ws(s):
    return re.sub(r"[\s\u00a0]+", " ", s or "").strip()


def jsonld_types(blocks):
    types = []
    for b in blocks:
        d = b.get("data")
        if isinstance(d, dict):
            t = d.get("@type")
            if isinstance(t, list):
                types.extend(t)
            elif t:
                types.append(t)
            for g in d.get("@graph", []) if isinstance(d.get("@graph"), list) else []:
                if isinstance(g, dict) and g.get("@type"):
                    types.append(g.get("@type"))
    return types


def faq_items(blocks):
    items = []
    for b in blocks:
        d = b.get("data")
        if isinstance(d, dict) and d.get("@type") == "FAQPage":
            for q in d.get("mainEntity", []) or []:
                if isinstance(q, dict):
                    ans = q.get("acceptedAnswer") or {}
                    items.append(
                        {
                            "q": q.get("name") or "",
                            "a": (ans.get("text") if isinstance(ans, dict) else "") or "",
                        }
                    )
    return items


def is_internal(href, page_url):
    if href.startswith(("mailto:", "tel:", "javascript:", "data:")):
        return None
    p = urllib.parse.urlparse(urllib.parse.urljoin(page_url, href))
    if p.netloc and p.netloc != HOST:
        return None
    if p.scheme not in ("http", "https", ""):
        return None
    clean = urllib.parse.urlunparse(("https", HOST, p.path, "", p.query, ""))
    return clean


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="/tmp/p0_audit.json")
    ap.add_argument("--sitemap", default=f"{BASE}/sitemap.xml")
    args = ap.parse_args()

    print(f"[1] sitemap {args.sitemap}", flush=True)
    sm = fetch(args.sitemap)
    locs = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", sm["body"])
    print(f"    sitemap status={sm['status']} urls={len(locs)}", flush=True)

    negatives = [
        f"{BASE}/nonexistent-test-page-xyz/",
        f"{BASE}/en/nonexistent-test-page-xyz/",
        f"{BASE}/posts/nonexistent-test-page-xyz/",
        f"{BASE}/category/nonexistent/",
        f"{BASE}/en/nonexistent-test-page-xyz",
    ]

    targets = list(dict.fromkeys(locs + negatives))
    print(f"[2] fetching {len(targets)} URLs with {WORKERS} workers", flush=True)
    pages = {}
    with cf.ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(fetch, u): u for u in targets}
        done = 0
        for f in cf.as_completed(futs):
            u = futs[f]
            try:
                pages[u] = f.result()
            except Exception as e:
                pages[u] = {"url": u, "error": str(e), "status": None, "body": "", "chain": [], "final_url": u}
            done += 1
            if done % 25 == 0:
                print(f"    {done}/{len(targets)}", flush=True)

    print("[3] parsing html", flush=True)
    parsed = {}
    for u in locs:
        r = pages[u]
        if r.get("body") and "html" in (r.get("ctype") or ""):
            parsed[u] = analyse_html(u, r["body"])

    # ---- sitemap URL results
    sm_rows = []
    for u in locs:
        r = pages[u]
        p = parsed.get(u, {})
        chain = r.get("chain") or []
        row = {
            "url": u,
            "status": r.get("status"),
            "final_url": r.get("final_url"),
            "redirects": [f"{c['status']} {c['from']} -> {c['to']}" for c in chain],
            "title": p.get("title"),
            "title_len": len(p.get("title") or ""),
            "description": p.get("description"),
            "desc_len": len(p.get("description") or ""),
            "robots": p.get("robots"),
            "canonical": p.get("canonical"),
            "canonical_ok": (p.get("canonical") or "").rstrip("/") == u.rstrip("/"),
            "hreflang": p.get("hreflang"),
            "lang": p.get("lang"),
            "h1": p.get("h1"),
            "h1_count": len(p.get("h1") or []),
            "ga4_ids": p.get("ga4_ids"),
            "adsense": p.get("adsense"),
            "adsense_script": p.get("adsense_script"),
            "viewport": p.get("viewport"),
            "jsonld_count": len(p.get("jsonld") or []),
            "jsonld_errors": [b.get("snippet") for b in (p.get("jsonld") or []) if b.get("error")],
            "jsonld_types": jsonld_types(p.get("jsonld") or []),
            "faq_count": len(faq_items(p.get("jsonld") or [])),
            "faq_mismatch": None,
            "word_count": p.get("word_count"),
            "parse_error": p.get("parse_error"),
        }
        # duplicate Article/BlogPosting
        t = [x for x in row["jsonld_types"] if x in ("Article", "BlogPosting", "NewsArticle")]
        row["article_ld_count"] = len(t)
        # FAQ visible-text consistency
        items = faq_items(p.get("jsonld") or [])
        if items:
            vis = norm_ws(p.get("visible_text"))
            miss = []
            for it in items:
                if it["q"] and norm_ws(it["q"])[:60] not in vis:
                    miss.append(it["q"][:80])
            row["faq_mismatch"] = miss
        sm_rows.append(row)

    # ---- internal links
    print("[4] collecting internal links", flush=True)
    link_map = defaultdict(list)  # target -> list of source urls
    skipped = {"assets": 0}
    for u, p in parsed.items():
        for l in p.get("links") or []:
            tgt = is_internal(l["href"], u)
            if tgt:
                link_map[tgt].append(u)
    # same-host links to non-html assets are still checked once
    targets_links = sorted(link_map)
    print(f"    unique internal link targets: {len(targets_links)}", flush=True)

    link_results = {}
    with cf.ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(fetch, t): t for t in targets_links}
        for f in cf.as_completed(futs):
            t = futs[f]
            try:
                r = f.result()
            except Exception as e:
                r = {"status": None, "error": str(e), "chain": [], "final_url": t}
            link_results[t] = r

    bad_links = {"notfound": [], "redirect": [], "error": [], "other": []}
    for t in targets_links:
        r = link_results[t]
        st = r.get("status")
        srcs = sorted(set(link_map[t]))[:5]
        entry = {"target": t, "status": st, "final": r.get("final_url"), "sources": srcs,
                 "chain": [f"{c['status']} -> {c['to']}" for c in (r.get("chain") or [])]}
        if r.get("error") or st is None:
            bad_links["error"].append(entry)
        elif st == 404:
            bad_links["notfound"].append(entry)
        elif st in (301, 302, 307, 308) or (r.get("final_url") and r["final_url"].rstrip("/") != t.rstrip("/")):
            bad_links["redirect"].append(entry)
        elif st >= 400:
            bad_links["other"].append(entry)

    # links exactly equal to a sitemap URL vs. sitemap URL without trailing slash
    sitemap_set = set(locs)
    noncanonical_link_targets = [
        t for t in targets_links
        if t + "/" in sitemap_set and t not in sitemap_set
    ]

    # ---- images
    print("[5] checking images", flush=True)
    imgs = set()
    for u, p in parsed.items():
        for s in p.get("images") or []:
            tgt = is_internal(s, u)
            if tgt:
                imgs.add(tgt)
        if p.get("og_image"):
            tgt = is_internal(p["og_image"], u)
            if tgt:
                imgs.add(tgt)
    img_results = {}
    with cf.ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(fetch, t): t for t in imgs}
        for f in cf.as_completed(futs):
            t = futs[f]
            try:
                r = f.result()
            except Exception as e:
                r = {"status": None, "error": str(e)}
            img_results[t] = {"status": r.get("status"), "ctype": r.get("ctype"),
                              "final": r.get("final_url"), "error": r.get("error")}
    bad_imgs = {k: v for k, v in img_results.items() if v["status"] != 200}

    # external sample: og:image absolute URLs not on host
    ext_og = {}
    for u, p in parsed.items():
        og = p.get("og_image") or ""
        if og and HOST not in og:
            ext_og[u] = og

    # ---- negative controls
    neg_rows = []
    soft404_markers = ["404", "not found", "페이지를", "없습니다"]
    for u in negatives:
        r = pages[u]
        body = (r.get("body") or "").lower()
        has_marker = any(m.lower() in body for m in soft404_markers[:2]) or "찾을 수 없" in body
        neg_rows.append({
            "url": u,
            "status": r.get("status"),
            "final_url": r.get("final_url"),
            "redirects": [f"{c['status']} -> {c['to']}" for c in (r.get("chain") or [])],
            "title": (re.search(r"<title>(.*?)</title>", r.get("body") or "", re.S) or [None, None])[1],
            "soft404_suspect": r.get("status") == 200 and not has_marker,
            "bytes": len(r.get("body") or ""),
        })

    # ---- aggregate checks over sitemap rows
    problems = defaultdict(list)
    for row in sm_rows:
        u = row["url"]
        if row["status"] != 200:
            problems["sitemap_status"].append((u, row["status"]))
        if row["final_url"] and row["final_url"].rstrip("/") != u.rstrip("/"):
            problems["sitemap_final_mismatch"].append((u, row["final_url"]))
        if row["redirects"]:
            problems["sitemap_redirect"].append((u, row["redirects"]))
        if not row["canonical_ok"]:
            problems["canonical"].append((u, row["canonical"]))
        if not row["title"]:
            problems["no_title"].append(u)
        if not row["description"]:
            problems["no_description"].append(u)
        if row["h1_count"] != 1:
            problems["h1"].append((u, row["h1_count"], row["h1"]))
        if not row["ga4_ids"] or GA_ID not in (row["ga4_ids"] or []):
            problems["ga4"].append((u, row["ga4_ids"]))
        if not row["adsense_script"]:
            problems["adsense"].append(u)
        if not row["viewport"]:
            problems["viewport"].append(u)
        if row["jsonld_errors"]:
            problems["jsonld_error"].append((u, row["jsonld_errors"]))
        if row["article_ld_count"] > 1:
            problems["jsonld_dup_article"].append((u, row["article_ld_count"]))
        if row["faq_mismatch"]:
            problems["faq_mismatch"].append((u, row["faq_mismatch"]))
        if row["parse_error"]:
            problems["parse_error"].append((u, row["parse_error"]))
        if (row["robots"] or "").startswith("noindex"):
            problems["noindex_in_sitemap"].append(u)
        if not row["hreflang"]:
            problems["no_hreflang"].append(u)

    # duplicate titles/descriptions across pages
    tc = defaultdict(list)
    dc = defaultdict(list)
    for row in sm_rows:
        if row["title"]:
            tc[row["title"]].append(row["url"])
        if row["description"]:
            dc[row["description"]].append(row["url"])
    problems["dup_title"] = [(t, us) for t, us in tc.items() if len(us) > 1]
    problems["dup_description"] = [(d[:80], us) for d, us in dc.items() if len(us) > 1]

    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "sitemap": {"url": args.sitemap, "status": sm["status"], "count": len(locs), "locs": locs},
        "pages": sm_rows,
        "negatives": neg_rows,
        "internal_links": {
            "unique_targets": len(targets_links),
            "bad": bad_links,
            "noncanonical_trailing_slash": noncanonical_link_targets[:100],
        },
        "images": {"count": len(imgs), "bad": bad_imgs, "external_og": ext_og},
        "problems": {k: v for k, v in problems.items()},
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)

    print("\n=== SUMMARY ===")
    print(f"sitemap urls: {len(locs)}")
    print("problem counts:")
    for k, v in sorted(problems.items(), key=lambda x: -len(x[1])):
        print(f"  {k}: {len(v)}")
    print(f"internal link targets: {len(targets_links)} | 404: {len(bad_links['notfound'])} | "
          f"redirect: {len(bad_links['redirect'])} | error: {len(bad_links['error'])} | other: {len(bad_links['other'])}")
    print(f"images: {len(imgs)} | bad: {len(bad_imgs)}")
    print("negatives:")
    for n in neg_rows:
        print(f"  {n['status']} {n['url']} -> {n['final_url']} soft404={n['soft404_suspect']}")
    print(f"report: {args.out}")


if __name__ == "__main__":
    main()
