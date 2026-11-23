#!/usr/bin/env python3
"""Load / validate / report on map/index.html data blocks."""
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = ROOT / "map" / "index.html"
REGIONS = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
           "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]
KINDS = ["국밥", "면요리", "중식", "일식", "양식", "분식", "고기", "해산물", "베이커리", "카페", "한식"]


def load(text=None):
    text = text if text is not None else HTML.read_text(encoding="utf-8")
    s = re.search(r"const subscribers = (\{.*?\});", text, re.S).group(1)
    l = re.search(r"const listings = (\[.*?\n\]);", text, re.S).group(1)
    subs = json.loads(s)
    listings = json.loads(l)
    return subs, listings


def norm(name):
    return re.sub(r"\s+", "", name.normalize("NFKC").lower())


def check(subs=None, listings=None):
    subs, listings = (subs, listings) if subs is not None else load()
    errs = []
    for i, r in enumerate(listings):
        if len(r) != 8:
            errs.append(f"row {i} len={len(r)} {r[0] if r else ''}")
            continue
        if r[1] not in REGIONS:
            errs.append(f"row {i} bad region {r[1]} ({r[0]})")
        if r[6] not in subs:
            errs.append(f"row {i} unknown channel {r[6]} ({r[0]})")
        if not re.fullmatch(r"[A-Za-z0-9_-]{11}", str(r[5])):
            errs.append(f"row {i} bad youtubeId {r[5]} ({r[0]})")
        if r[3] not in KINDS:
            errs.append(f"row {i} bad kind {r[3]} ({r[0]})")
        if r[7] is not None and not isinstance(r[7], int):
            errs.append(f"row {i} bad start {r[7]}")
    keys = Counter((norm(r[0]), r[1]) for r in listings)
    for k, v in keys.items():
        if v > 1:
            errs.append(f"duplicate {k[0]}|{k[1]} x{v}")
    return errs


def report(subs=None, listings=None):
    subs, listings = (subs, listings) if subs is not None else load()
    print(f"channels={len(subs)} listings={len(listings)}")
    print("regions:", dict(sorted(Counter(r[1] for r in listings).items(), key=lambda x: -x[1])))
    print("kinds:", dict(sorted(Counter(r[3] for r in listings).items(), key=lambda x: -x[1])))
    bych = Counter(r[6] for r in listings)
    print("channels with listings:", len(bych))
    print("0-listing channels:", [c for c in subs if c not in bych])
    print("thinnest:", [f"{c}({n})" for c, n in bych.most_common()[-20:]])
    print("richest:", [f"{c}({n})" for c, n in bych.most_common(10)])


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "report"
    if cmd == "check":
        e = check()
        print(f"{len(e)} problems")
        for x in e:
            print(" -", x)
        sys.exit(1 if e else 0)
    report()
