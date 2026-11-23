#!/usr/bin/env python3
"""Broader candidate extraction: name + address variants + naver place links."""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, "/workspace/dailyfoodfighter/tools")
import verify_batch as vb  # noqa: E402

DATA = Path("/workspace/dailyfoodfighter/data")
DESC = DATA / "desc_store.json"
PROV = "서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주"
A1 = re.compile(r"((?:" + PROV + r")[^\n]{0,45}?[가-힣A-Za-z0-9]+(?:로|길|대로)\s?\d{1,4}(?:-\d{1,4})?)")
A2 = re.compile(r"((?:" + PROV + r")[^\n]{0,40}?(?:[가-힣]{1,6}(?:동|가|읍|면|리))\s?\d{1,4}(?:-\d{1,4})?)")
A3 = re.compile(r"((?:" + PROV + r")\s?[가-힣]{1,8}(?:시|군|구)[^\n]{0,25}?\d{1,4}(?:-\d{1,4})?)")
NAVER = re.compile(r"https?://(?:naver\.me/[A-Za-z0-9]+|(?:m\.)?(?:map|place|pcmap)\.naver\.com/[^\s\)\]\"<>]+)")
LABEL = re.compile(r"^[\s•·▪▫▶☞📍🗺️\-–—*#>\[\]\(\)]+|(?:매장명|상호|가게명|가게|위치|주소|장소|식당정보|name|Location|Address)\s*[:：()]?",
                   re.I)


def clean(s):
    s = NAVER.sub(" ", s)
    s = re.sub(r"https?://\S+", " ", s)
    s = re.sub(r"^[\s•·▪▫▶☞📍🗺️\-–—*#>\d\.\)\[\]]+", " ", s)
    s = re.sub(r"(?:매장명|상호|가게명|가게|위치|주소|장소|식당정보)\s*[:：]", " ", s)
    s = re.sub(r"\d{1,2}:\d{2}(?::\d{2})?", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def plausible(nm):
    nm = vb.clean_name(nm)
    if not vb.name_ok(nm):
        return None
    if re.search(r"(영업|휴무|주차|카드|예약|전화|문의|시간|라스트|가능|메뉴|가격|원$|입니다|합니다)", nm):
        return None
    if re.search(r"\d{2,}", nm):
        return None
    return nm


def main():
    desc = json.loads(DESC.read_text())
    targets = json.loads((DATA / "targets67.json").read_text())
    by_cid = {v["channelId"]: k for k, v in targets.items() if v.get("channelId")}
    out, seen = [], set()

    def add(name, addr, channel, vid, link=None):
        nm = plausible(name or "")
        if not nm:
            return
        prov = vb.prov_of(addr or "")
        if not prov and not link:
            return
        key = (vb.norm(nm), prov or "?", vb.norm((addr or "")[:12]))
        if key in seen:
            return
        seen.add(key)
        out.append(dict(name=nm, addr=vb.norm_prov(addr or ""), prov=prov, city=vb.city_of(addr or ""),
                        street=vb.street_of(addr or ""), dong=vb.dong_of(addr or ""),
                        channel=channel, subs=targets.get(channel, {}).get("subs"),
                        videoId=vid, link=link))

    for vid, v in desc.items():
        if not v or v.get("failed"):
            continue
        d = v.get("description") or ""
        if not d.strip():
            continue
        ch = v.get("channel") or ""
        cid = v.get("channelId")
        if ch not in targets and cid in by_cid:
            ch = by_cid[cid]
        lines = [l.strip() for l in d.splitlines()]
        for i, line in enumerate(lines):
            if not line:
                continue
            m = A1.search(line) or A2.search(line) or A3.search(line)
            if m:
                addr = m.group(1)
                cands = [clean(line[:m.start()]), clean(line[m.end():])]
                for back in (1, 2):
                    if i - back >= 0:
                        cands.append(clean(lines[i - back]))
                for c in cands:
                    c = re.sub(r"^[\(\[].{0,6}[\)\]]", "", c).strip()
                    if 2 <= len(c) <= 24 and not A1.search(c) and not A2.search(c):
                        add(c, addr, ch, vid)
                continue
            lm = NAVER.search(line)
            if lm:
                cands = [clean(line[:lm.start()])]
                for back in (1, 2):
                    if i - back >= 0:
                        cands.append(clean(lines[i - back]))
                for c in cands:
                    if 2 <= len(c) <= 24 and not A1.search(c):
                        add(c, "", ch, vid, link=lm.group(0))
                        break
    (DATA / "cand3.json").write_text(json.dumps(out, ensure_ascii=False, indent=0))
    import collections
    print("candidates", len(out), "link", sum(1 for x in out if x["link"]))
    print(collections.Counter(x["channel"] for x in out).most_common(18))


if __name__ == "__main__":
    main()
