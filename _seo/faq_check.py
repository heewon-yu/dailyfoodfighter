#!/usr/bin/env python3
"""Compare FAQPage JSON-LD items with the visible page text (fuzzy) for given URLs."""
import difflib
import json
import re
import sys

import lxml.html

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from p0_deep_audit import fetch, faq_items, analyse_html, norm_ws  # noqa: E402


def main(urls):
    rows = []
    for u in urls:
        r = fetch(u)
        p = analyse_html(u, r["body"])
        items = faq_items(p["jsonld"])
        vis = norm_ws(p["visible_text"])
        # candidate question lines: text ending with '?' or '？' near the FAQ section
        cands = [s.strip() for s in re.findall(r"[^.!?]{5,160}\?", p["visible_text"])]
        for it in items:
            q = norm_ws(it["q"])
            a = norm_ws(it["a"])
            q_in = q in vis
            # nearest visible question
            best = max(cands, key=lambda c: difflib.SequenceMatcher(None, norm_ws(c), q).ratio(), default="")
            ratio = difflib.SequenceMatcher(None, norm_ws(best), q).ratio() if best else 0
            a_head = a[:60]
            rows.append({
                "url": u,
                "q_ld": q,
                "q_in_visible": q_in,
                "q_visible_best": norm_ws(best)[-140:],
                "q_ratio": round(ratio, 3),
                "a_head": a_head,
                "a_in_visible": a_head in vis if a_head else None,
                "a_len": len(a),
            })
    for r in rows:
        flag = "OK " if (r["q_in_visible"] and r["a_in_visible"]) else "CHK"
        print(f"{flag} {r['url']}")
        if flag == "CHK":
            print(f"     LD  Q: {r['q_ld']}")
            print(f"     VIS Q: {r['q_visible_best']}  (ratio {r['q_ratio']})")
            print(f"     A head({r['a_head']}) in visible={r['a_in_visible']}")
    print(json.dumps(rows, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1:])
