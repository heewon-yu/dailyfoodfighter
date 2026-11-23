#!/usr/bin/env python3
"""2차 확장: 검색 결과에서 (브랜드+도시)가 제목에 함께 확인되는 숙소 리뷰 후보를 뽑는다.
브랜드 공식 채널·방송 예능 채널·광고/매장 영상은 제외한다."""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import yt  # noqa: E402

sys.path.insert(0, str(Path(__file__).parent))
from ab2_extract import BRANDS, CITIES, DOMESTIC, GENERIC, find_brand, find_city  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SEARCHES = [ROOT / "data" / "ab2_search.json", ROOT / "data" / "ab2_search2.json", ROOT / "data" / "ab2_search3.json"]
OUT = ROOT / "data" / "ab2_cand2.json"

OFFICIAL = re.compile(r"bvlgari|hilton|marriott|hyatt|accor|ihg|four seasons|aman|mandarin oriental|"
                      r"capella|rosewood|shangri|peninsula|raffles|fairmont|sofitel|conrad|waldorf|"
                      r"ritz|st\.? regis|edition|alila|six senses|regent|intercontinental|kimpton|lxr|"
                      r"jumeirah|hoshino|park hyatt|grand hyatt|andaz|westin|sheraton|luxury collection|"
                      r"hotels & resorts|hotel indigo|canopy by", re.I)
BROADCAST = re.compile(r"tvN|디글|JTBC|SBS|MBC|KBS|채널A|엠넷|Mnet|올리브|스토리온|코미디TV")
BADTITLE = re.compile(r"매장|플라자|화보|런칭|쇼룸|광고 모델|모델 공개|시티투어|추리|예능|웃음|개그|"
                      r"브랜드 캠페인|오프닝 파티|그랜드 오픈 기념")
MULTI = re.compile(r"비교|모음|\d곳|베스트|순위|\bBEST\b|\bTop\b|톱\s?\d|\bVS\b|\bvs\b")


def city_regex(key):
    if len(key) <= 1:
        return re.compile(r"(?<![가-힣])" + re.escape(key) + r"(?![가-힣])")
    return re.compile(re.escape(key))


def main():
    data = {}
    for f in SEARCHES:
        if f.exists():
            data.update(json.loads(f.read_text()))
    cand, seen = [], set()
    for q, videos in data.items():
        for v in videos:
            vid = v["videoId"]
            title = v["title"]
            ch = v.get("channel", "")
            cid = v.get("channelId", "")
            key = (vid,)
            if key in seen:
                continue
            if DOMESTIC.search(title) or MULTI.search(title) or BADTITLE.search(title):
                continue
            if OFFICIAL.search(ch) or BROADCAST.search(ch):
                continue
            brand = find_brand(title)
            if not brand or brand[0] in GENERIC:
                continue
            city = find_city(title)
            if not city:
                continue
            low = title.lower()
            bi = low.find(brand[0].lower())
            vars_ = [x for variants, b, c in BRANDS if b == brand[0] for x in variants]
            for var in vars_:
                i = low.find(var.lower())
                if i >= 0:
                    bi = i
                    break
            # 도시 표기 위치 (긴 표기 우선)
            ci = -1
            for ck in sorted(CITIES, key=len, reverse=True):
                m = city_regex(ck).search(low)
                if m and CITIES[ck][1] == city[1]:
                    ci = m.start()
                    break
            if ci < 0 or abs(bi - ci) > 24:
                continue
            if brand[0] == "식스센스" and not re.search(r"호텔|리조트|숙소|스테이", title):
                continue
            seen.add(key)
            cand.append(dict(videoId=vid, title=title, channel=ch, channelId=cid,
                             views=v.get("views", ""), brand=brand[0], chain=brand[1],
                             region=city[0], city=city[1], country=city[2], query=q))
    cand.sort(key=lambda c: (c["brand"], c["city"], c["videoId"]))
    OUT.write_text(json.dumps(cand, ensure_ascii=False, indent=0))
    print("candidates", len(cand), "channels", len({c["channel"] for c in cand}))
    groups = {}
    for c in cand:
        groups.setdefault((c["brand"], c["city"]), []).append(c)
    print("hotels", len(groups))
    for (b, city), items in sorted(groups.items()):
        print(f"{b} {city} ({items[0]['region']}) x{len(items)}: " +
              " / ".join(f"{i['channel'][:14]}" for i in items[:6]))


if __name__ == "__main__":
    main()
