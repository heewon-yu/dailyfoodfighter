#!/usr/bin/env python3
"""Extract restaurant entries from video descriptions across several formats. v2"""
import re

TS = re.compile(r"^\s*[\[\(]?(\d{1,2}:\d{2}(?::\d{2})?)[\]\)]?\s*[|\-–:.]?\s*(.*)$")
LINK = re.compile(r"https?://(?:naver\.me|(?:m\.)?map\.naver\.com|(?:m\.)?place\.naver\.com)/[^\s\)\]\"<>]+")
ADDR = re.compile(r"((?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\n,]{3,45}?(?:로|길|동|읍|면|리)\s?[\d\-]*)")
NUMNAME = re.compile(r"^\s*(?:\d+|[①-⑳])[.、)]\s*(.+)$")


def to_sec(t):
    parts = [int(p) for p in t.split(":")]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    return parts[0] * 3600 + parts[1] * 60 + parts[2]


def clean_name(s):
    s = re.sub(r"[\[\]\(\)<>★☆▪▫•·\-–—|:]{1,4}", " ", s)
    s = re.sub(r"^\s*(📍|🗺️|👉|▶|☞|#)\s*", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def parse(desc, max_name_len=40):
    lines = [l.strip() for l in desc.splitlines()]
    out = []
    cur = {"time": None, "name": "", "addr": None}
    for line in lines:
        if not line:
            continue
        links = LINK.findall(line)
        if links:
            for lk in links:
                nm = cur.get("name") or ""
                nm = re.sub(r"(네이버|카카오|구글)\s*지도.*$", "", nm)
                nm = clean_name(nm)
                if nm and len(nm) <= max_name_len:
                    out.append(dict(time=cur.get("time"), name=nm, link=lk, addr=cur.get("addr")))
            if re.fullmatch(r"\s*(?:🗺️|📍|👉|지도|네이버지도|map)?\s*:?\s*(?:https?://\S+\s*)+", line):
                cur = {"time": None, "name": "", "addr": None}
            continue
        m = TS.match(line)
        if m and m.group(2) and len(clean_name(m.group(2))) <= max_name_len:
            nm = clean_name(m.group(2))
            am = ADDR.search(nm)
            cur = dict(time=to_sec(m.group(1)), name=nm, addr=am.group(1) if am else None)
            continue
        # numbered name line, e.g. '1. 전원식당'
        mn = NUMNAME.match(line)
        if mn and not ADDR.search(line):
            nm = clean_name(mn.group(1))
            if nm and len(nm) <= max_name_len:
                cur = dict(time=cur.get("time"), name=nm, addr=None)
            continue
        # address line, e.g. '📍위치 : 강원 속초시 영금정로 15' or '가게명 | 주소'
        am = ADDR.search(line)
        if am:
            if cur.get("name") and not cur.get("addr"):
                cur["addr"] = am.group(1)
                out.append(dict(time=cur.get("time"), name=cur["name"], link=None, addr=am.group(1)))
                cur = dict(time=cur.get("time"), name="", addr=None)
                continue
            rest = line
            pos = rest.find(am.group(1))
            tail = rest[:pos]
            tail = re.sub(r"(?:📍|🗺️)?\s*(위치|주소|장소)?\s*[:：]?\s*$", "", tail).strip()
            nm = clean_name(tail)
            if nm and len(nm) <= 20:
                out.append(dict(time=cur.get("time"), name=nm, link=None, addr=am.group(1)))
                cur = dict(time=cur.get("time"), name="", addr=None)
            continue
        # '가게명 | 주소' where addr on same line handled above; marker name-only line
        if re.match(r"^(?:📍|🗺️|▪|▫|•|▶|☞)\s*\S", line) and len(clean_name(line)) <= max_name_len:
            nm = clean_name(line)
            am = ADDR.search(nm)
            cur = dict(time=cur.get("time"), name=nm, addr=am.group(1) if am else None)
            continue
    return out
