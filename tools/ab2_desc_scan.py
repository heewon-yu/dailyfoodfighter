#!/usr/bin/env python3
"""2차 확장: 이미 받아 둔 영상 설명(abroad_desc.json)에서 해외 5대 체인·하이엔드 호텔 리뷰를 찾는다.
설명에 호텔 이름(브랜드)과 해외 도시가 함께 나오는 영상만 근거로 남긴다."""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from ab2_extract import BRANDS, CITIES, DOMESTIC, GENERIC  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DESC = ROOT / "data" / "abroad_desc.json"
SUBS = ROOT / "data" / "abroad_subs.json"
OUT = ROOT / "data" / "ab2_desc_cand.json"


def main():
    desc = json.loads(DESC.read_text())
    subs = json.loads(SUBS.read_text())
    rows = []
    for vid, v in desc.items():
        d = (v.get("description") or "")
        t = v.get("title") or ""
        text = t + "\n" + d
        if not d and not t:
            continue
        if DOMESTIC.search(t):
            continue
        hits = []
        low = text.lower()
        for variants, brand, chain in BRANDS:
            for var in variants:
                i = low.find(var.lower())
                if i >= 0:
                    hits.append((i, brand, chain, var))
                    break
        if not hits:
            continue
        cities = []
        for key, val in CITIES.items():
            i = low.find(key)
            if i >= 0:
                cities.append((i, val))
        if not cities:
            continue
        # 도시가 여러 개면 제목에 있는 도시만 인정
        title_cities = {val[1] for key, val in CITIES.items() if key in t.lower()}
        if len({c[1][1] for c in cities}) > 1 and len(title_cities) != 1:
            continue
        for i, brand, chain, var in hits:
            if brand in GENERIC:
                continue
            nearby = [(abs(i - ci), val) for ci, val in cities]
            nearby.sort()
            dist, city = nearby[0]
            if len(title_cities) == 1:
                city = next(val for key, val in CITIES.items() if key in t.lower() and val[1] in title_cities)
                dist = 0
            if dist > 120:
                continue
            rows.append(dict(videoId=vid, title=t, channel=v.get("channel") or "",
                             subs=v.get("subs") or subs.get(v.get("channel"), {}).get("subs"),
                             brand=brand, chain=chain, region=city[0], city=city[1], country=city[2],
                             evidence=d[max(0, i - 70):i + 90].replace("\n", " ")))
            break
    rows.sort(key=lambda r: (r["channel"], -(r["subs"] or 0)))
    OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=0))
    print("rows", len(rows), "channels", len({r['channel'] for r in rows}))
    for r in rows:
        print(f"[{r['channel']}|{r['subs']}] {r['brand']} {r['city']} | {r['videoId']} | {r['title'][:50]}\n    {r['evidence'][:150]}")


if __name__ == "__main__":
    main()
