#!/usr/bin/env python3
"""Extract verified-ready restaurant candidates (name + address/link) from descriptions."""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import verify_batch as vb  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DESC = DATA / "desc_store.json"

PROV = "서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주"
ADDR_LINE = re.compile(
    r"((?:" + PROV + r")[^\n]{0,45}?(?:[가-힣A-Za-z0-9]+(?:로|길|대로))\s?\d{1,4}(?:-\d{1,4})?)")
ADDR_LINE2 = re.compile(r"((?:" + PROV + r")[^\n]{0,40}?(?:읍|면|동)\s?[가-힣]{0,6}\d{1,4}(?:-\d{1,4})?)")
LINK = re.compile(r"https?://(?:naver\.me/[A-Za-z0-9]+|(?:m\.)?(?:map|place)\.naver\.com/[^\s\)\]\"<>]+)")
GMAP = re.compile(r"https?://maps\.app\.goo\.gl/[A-Za-z0-9]+")


def name_from_line(line):
    s = line
    s = re.sub(LINK, " ", s)
    s = re.sub(r"https?://\S+", " ", s)
    s = re.sub(r"^[\s•·▪▫▶☞📍🗺️\-–—*#\d\.\)\]]+", " ", s)
    s = re.sub(r"(?:주소|위치|장소)\s*[:：]", " ", s)
    return s


def main():
    desc = json.loads(DESC.read_text())
    subs = json.loads((DATA / "targets67.json").read_text())
    out = []
    seen = set()

    def add(name, addr, channel, vid, start=None, link=None, src="desc"):
        nm = vb.clean_name(name)
        if not vb.name_ok(nm):
            return
        prov = vb.prov_of(addr or "")
        if not prov:
            return
        st = vb.street_of(addr or "")
        key = (vb.norm(nm), prov)
        if key in seen:
            return
        seen.add(key)
        out.append(dict(name=nm, addr=vb.norm_prov(addr), prov=prov, city=vb.city_of(addr),
                        street=st, dong=vb.dong_of(addr), channel=channel,
                        subs=subs.get(channel, {}).get("subs"), videoId=vid, start=start,
                        link=link, src=src))

    for vid, v in desc.items():
        if not v or v.get("failed"):
            continue
        d = v.get("description") or ""
        if not d.strip():
            continue
        ch = v.get("channel") or ""
        lines = [l.strip() for l in d.splitlines()]
        for i, line in enumerate(lines):
            if not line:
                continue
            # address in this line
            m = ADDR_LINE.search(line) or ADDR_LINE2.search(line)
            if m:
                addr = m.group(1)
                # name = text before the address on the same line
                before = line[:m.start()]
                nm = name_from_line(before)
                if len(vb.clean_name(nm)) < 2:
                    # name = text after the address on the same line (e.g. '서울 ... 1594 앵그리포테이토')
                    after = name_from_line(line[m.end():])
                    after = re.sub(r"\d+층.*$", "", after)
                    after = re.sub(r"\(.*?\)", " ", after)
                    nm = after
                if len(vb.clean_name(nm)) < 2 and i > 0:
                    prev = name_from_line(lines[i - 1])
                    prev = re.sub(r"\d{1,2}:\d{2}(?::\d{2})?", " ", prev)
                    if 2 <= len(vb.clean_name(prev)) <= 24:
                        nm = prev
                add(nm, addr, ch, vid, None)
                continue
            # link-only line: use preceding name line
            lm = LINK.search(line) or GMAP.search(line)
            if lm and i > 0:
                prev = name_from_line(lines[i - 1])
                prev = re.sub(r"\d{1,2}:\d{2}(?::\d{2})?", " ", prev)
                if 2 <= len(vb.clean_name(prev)) <= 24:
                    add(prev, "", ch, vid, None, link=lm.group(0), src="link")
    # keep only entries with a usable address or a naver place link
    out = [x for x in out if x["street"] or (x["link"] and "naver" in x["link"])]
    (DATA / "cand2.json").write_text(json.dumps(out, ensure_ascii=False, indent=0))
    print("candidates", len(out))
    import collections
    print(collections.Counter(x["channel"] for x in out).most_common(15))
    print("with street", sum(1 for x in out if x["street"]), "naver link", sum(1 for x in out if x.get("link")))


if __name__ == "__main__":
    main()
