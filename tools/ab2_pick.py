#!/usr/bin/env python3
"""2차 확장: 호텔별 대표 영상을 고르고 검토용 표를 만든다."""
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAND = ROOT / "data" / "ab2_cand2.json"
DESC = ROOT / "data" / "ab2_desc_cand.json"
SUBS = ROOT / "data" / "ab2_subs.json"
OUT = ROOT / "data" / "ab2_pick.json"

KEEP_BRANDS = {"리츠칼튼", "세인트레지스", "JW 메리어트", "에디션", "불가리", "럭셔리 컬렉션",
               "콘래드", "월도프 아스토리아", "LXR", "파크 하얏트", "그랜드 하얏트", "안다즈",
               "하얏트 리젠시", "인터컨티넨탈", "리젠트", "식스센스", "킴튼", "소피텔",
               "페어몬트", "래플스", "반얀트리", "알릴라", "아만", "포시즌스", "로즈우드",
               "만다린 오리엔탈", "카펠라", "샹그릴라", "페닌슐라", "호시노야", "파크로얄",
               "자누", "벨몬드", "오베로이", "아틀란티스", "주메이라", "마리나베이샌즈"}
HOTELWORD = re.compile(r"호텔|리조트|숙소|스테이|호캉스|투숙|숙박|객실|스위트|풀빌라|체크인|료칸")
HANGUL = re.compile(r"[가-힣]")


def main():
    rows = json.loads(CAND.read_text())
    subs = json.loads(SUBS.read_text()) if SUBS.exists() else {}
    groups = defaultdict(list)
    seen = set()
    for r in rows:
        if r["brand"] not in KEEP_BRANDS:
            continue
        if not HANGUL.search(r["channel"]) or not HANGUL.search(r["title"]):
            continue
        if r["videoId"] in seen:
            continue
        # 제목에 호텔 단어가 있거나, 브랜드와 도시가 붙어 있는 경우만 (예: "만다린 오리엔탈 타이베이")
        low = r["title"].lower()
        bw = min((low.find(v.lower()) for v in [r["brand"], r["brand"].replace(" ", "")] if low.find(v.lower()) >= 0), default=-1)
        cw = low.find(r["city"].lower())
        adjacent = bw >= 0 and cw >= 0 and abs(bw - cw) <= 10
        if not HOTELWORD.search(r["title"]) and not adjacent:
            continue
        seen.add(r["videoId"])
        s = subs.get(r.get("channelId") or "", {}).get("subs") or r.get("subs") or 0
        r["subs"] = s
        r["score"] = (HOTELWORD.search(r["title"]) is not None) * 1000000 + s
        groups[(r["brand"], r["city"])].append(r)
    picks = []
    for (brand, city), items in sorted(groups.items()):
        items.sort(key=lambda r: -r["score"])
        top = items[0]
        picks.append(dict(brand=brand, city=city, region=top["region"], country=top["country"],
                          chain=top["chain"], videoId=top["videoId"], channel=top["channel"],
                          title=top["title"], subs=top["subs"], n=len(items),
                          others=[dict(videoId=r["videoId"], channel=r["channel"], title=r["title"],
                                       subs=r["subs"]) for r in items[1:]]))
    picks.sort(key=lambda p: (p["brand"], p["city"]))
    OUT.write_text(json.dumps(picks, ensure_ascii=False, indent=0))
    print("hotels", len(picks))
    for p in picks:
        print(f"{p['brand']}|{p['city']}|{p['region']}|n{p['n']}|{p['channel']}({p['subs']})|{p['videoId']}|{p['title'][:80]}")


if __name__ == "__main__":
    main()
