#!/usr/bin/env python3
"""Align FAQPage JSON-LD answer text with the visible FAQ answer (P1-1 class 7).

For every post, each FAQPage Question is matched to the visible `### Q..` / `**A:**`
block on the same page and the structured answer is replaced with the visible answer
text (markdown/links reduced to plain text), so the structured data and the rendered
page say the same thing verbatim. Questions are left untouched.

Usage:
  python3 _seo/p1_align_faq_jsonld.py --root .            # dry run, prints changes
  python3 _seo/p1_align_faq_jsonld.py --root . --apply     # writes files
"""
import argparse, json, re
from difflib import SequenceMatcher
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("--root", default=".")
ap.add_argument("--apply", action="store_true")
a = ap.parse_args()
root = Path(a.root)

LD_RE = re.compile(r'(<script[^>]*type=["\']application/ld\+json["\'][^>]*>\s*)(.*?)(\s*</script>)', re.S)


def visible_faq(body):
    out = []
    for b in re.split(r"\n(?=### )", body):
        m = re.match(r"###\s*(?:Q\d*\.?\s*)?(.+?)\s*\n+(.*)", b, re.S)
        if not m:
            continue
        am = re.search(r"\*\*A[:：]\*\*\s*(.+?)(?:\n\n|\n#|\n<div|\n<script|$)", m.group(2), re.S)
        if am:
            out.append((m.group(1).strip(), am.group(1).strip()))
    return out


def plain(md):
    s = md
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", s)
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)
    s = s.replace("**", "").replace("__", "").replace("`", "")
    s = re.sub(r"(?<!\*)\*(?!\*)", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


changed = []
for f in sorted((root / "_posts").glob("*.md")):
    raw = f.read_text(encoding="utf-8")
    fm = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", raw, re.S)
    if not fm:
        continue
    front, body = fm.groups()
    vis = visible_faq(body)
    if not vis:
        continue
    new_body, n_sub = body, 0

    def repl(m):
        global n_sub
        head, payload, tail = m.groups()
        try:
            d = json.loads(payload)
        except ValueError:
            return m.group(0)
        if not isinstance(d, dict) or d.get("@type") != "FAQPage":
            return m.group(0)
        for e in d.get("mainEntity", []):
            q = e.get("name", "")
            best = max(vis, key=lambda p: SequenceMatcher(None, q, p[0]).ratio())
            if SequenceMatcher(None, q, best[0]).ratio() < 0.55:
                continue
            ans = plain(best[1])
            if not ans or len(ans) > 1200:
                continue
            if ans != e.get("acceptedAnswer", {}).get("text", ""):
                e["acceptedAnswer"]["text"] = ans
                n_sub += 1
        if not n_sub:
            return m.group(0)
        return head + json.dumps(d, ensure_ascii=False, indent=2) + tail

    new_body = LD_RE.sub(repl, body)
    if n_sub and new_body != body:
        changed.append((f.name, n_sub))
        if a.apply:
            f.write_text("---\n" + front + "\n---\n" + new_body, encoding="utf-8")

print(json.dumps({"posts_changed": len(changed), "answers_replaced": sum(n for _, n in changed),
                  "applied": a.apply, "sample": changed[:10]}, ensure_ascii=False, indent=2))
