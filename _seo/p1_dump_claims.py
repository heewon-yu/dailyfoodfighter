#!/usr/bin/env python3
"""Dump every high-risk claim context per post for human review (read-only)."""
import re, sys, glob, os

PATTERNS = {
    "C1 치료/완치/예방·해독": r"[^.\n]{0,90}(치료(?!제)|완치|항암|암세포|암 예방|cures?|detox|해독|디톡스|노화 ?방지|anti-?aging|면역력)[^.\n]{0,90}",
    "C2 흡수율/배수": r"[^.\n]{0,80}((\d+(\.\d+)?([~-]\d+(\.\d+)?)?\s*배)|(흡수율|생체이용률|이용률)[^.\n]{0,25}\d+\s*%|bioavailability[^.\n]{0,20}\d+)[^.\n]{0,80}",
    "C3 일괄 안전량": r"[^.\n]{0,80}(안전합니다|안전하다|is safe|are safe|문제 ?없)[^.\n]{0,60}",
    "C5 GI/GL": r"[^.\n]{0,70}(GI|GL|혈당지수|glycemic)[^.\n]{0,70}",
    "C6 동물/시험관": r"[^.\n]{0,70}(쥐|마우스|시험관|세포 ?실험|동물 ?실험|in vitro|in mice|rodent)[^.\n]{0,110}",
    "C7 무근거 %": r"[^.\n]{0,70}\d{2,3}\s*%\s*(까지|나)?\s*(높|낮|줄|감소|증가|개선|향상|억제|차단|단축|상승)[^.\n]{0,50}",
}

target = sys.argv[1:] or sorted(glob.glob("_posts/*.md"))
for f in target:
    raw = open(f, encoding="utf-8").read()
    flat = re.sub(r"<[^>]+>", " ", raw)
    flat = re.sub(r"\s+", " ", flat)
    print(f"\n########## {os.path.basename(f)}")
    for name, rx in PATTERNS.items():
        seen = set()
        out = []
        for m in re.finditer(rx, flat, re.I):
            s = re.sub(r"\s+", " ", m.group(0)).strip()
            key = s[:60]
            if key in seen:
                continue
            seen.add(key)
            out.append("    · " + s[:260])
        if out:
            print(f"  [{name}]")
            print("\n".join(out[:6]))
