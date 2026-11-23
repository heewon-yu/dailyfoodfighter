#!/usr/bin/env python3
"""Build candidate rows (brand hit in title, channel >=100k subs) for abroad map."""
import json
import re
import sys
from collections import Counter
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"

ALIASES = [
    ("메리어트", ["리츠칼튼", "리츠 칼튼", "ritz-carlton", "ritz carlton", "세인트 레지스", "세인트레지스",
                 "st. regis", "st regis", "jw 메리어트", "jw메리어트", "jw marriott", "w 호텔", "w hotel",
                 "에디션 호텔", "에디션호텔", "edition hotel", "럭셔리 컬렉션", "luxury collection",
                 "불가리", "bvlgari", "bulgari", "웨스틴", "westin", "르메르디앙", "르 메르디앙",
                 "le meridien", "쉐라톤", "sheraton", "코트야드", "courtyard", "메리어트", "marriott"]),
    ("힐튼", ["월도프", "waldorf", "콘래드", "conrad", "lxr", "카노피", "canopy", "힐튼", "hilton",
             "큐리오", "curio", "더블트리", "더블 트리", "doubletree", "double tree"]),
    ("하얏트", ["파크 하얏트", "파크하얏트", "park hyatt", "안다즈", "andaz", "알릴라", "alila",
               "그랜드 하얏트", "그랜드하얏트", "grand hyatt", "톰슨 호텔", "톰슨호텔", "thompson hotel",
               "하얏트 리젠시", "하얏트리젠시", "hyatt regency", "하얏트 센트릭", "hyatt centric",
               "하얏트", "hyatt"]),
    ("IHG", ["식스센스", "식스 센스", "six senses", "리젠트", "regent", "인터컨티넨탈", "intercontinental",
             "킴튼", "kimpton", "인디고", "indigo", "크라운 플라자", "크라운플라자", "crowne plaza"]),
    ("아코르", ["래플스", "raffles", "페어몬트", "fairmont", "소피텔", "sofitel", "반얀트리", "banyan tree",
               "풀만", "pullman", "노보텔", "novotel", "머큐어", "mercure"]),
]

DOMESTIC = ["서울", "부산", "인천", "대구", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남",
            "전북", "전남", "경북", "경남", "제주", "명동", "여의도", "해운대", "평창", "양양", "속초",
            "경주", "파주", "용산", "잠실", "송도", "중문", "서귀포", "한국", "korea", "seoul", "busan",
            "jeju", "incheon"]


def brand_of(text):
    t = text.lower()
    for chain, words in ALIASES:
        for w in words:
            if w in t:
                return chain, w
    return None, None


def main():
    ch = json.loads((DATA / "abroad_ch.json").read_text())
    qs = json.loads((DATA / "abroad_q.json").read_text())
    subs = json.loads((DATA / "abroad_subs.json").read_text())
    rows = {}
    for label, d in ch.items():
        for v in d["videos"]:
            rows.setdefault(v["videoId"], dict(videoId=v["videoId"], title=v["title"], channel=label,
                                              channelId=d["channelId"], views=v.get("views", ""), src=["ch"]))
    for q, lst in qs.items():
        for v in lst:
            key = v["videoId"]
            if key in rows:
                rows[key]["src"].append(q)
            else:
                rows[key] = dict(videoId=key, title=v["title"], channel=v["channel"],
                                 channelId=v.get("channelId", ""), views=v.get("views", ""), src=[q])
    out = []
    for r in rows.values():
        chain, word = brand_of(r["title"])
        if not chain:
            continue
        s = (subs.get(r["channel"]) or {}).get("subs") or 0
        if s < 100000:
            continue
        r["chain"] = chain
        r["hit"] = word
        r["subs"] = s
        r["domestic"] = any(d in r["title"] for d in DOMESTIC)
        out.append(r)
    out.sort(key=lambda r: (r["chain"], -r["subs"]))
    print(f"candidates={len(out)}  domestic-flag={sum(r['domestic'] for r in out)}")
    print("chains:", Counter(r["chain"] for r in out))
    print("channels:", len({r["channel"] for r in out}))
    (DATA / "abroad_cand.json").write_text(json.dumps(out, ensure_ascii=False, indent=0))


if __name__ == "__main__":
    main()
