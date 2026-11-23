#!/usr/bin/env python3
"""Stage 3: verify candidate places on Naver and build final listing rows for map/index.html."""
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, "/workspace/dailyfoodfighter/tools")
import places

ROOT = Path("/workspace/dailyfoodfighter")
DATA = ROOT / "data"

# city prefix -> region short name
def region_of(addr):
    if not addr:
        return None
    a = addr.replace("강원특별자치도", "강원").replace("강원도", "강원")
    if not a.startswith("강원"):
        return None
    rest = a[2:].strip()
    m = re.match(r"(속초시|강릉시|동해시|삼척시|태백시|원주시|춘천시|홍천군|횡성군|평창군|정선군|영월군|인제군|고성군|양양군|양구군|화천군|철원군)", rest)
    return "강원" if m else None


def kind_of(category, name, menus):
    c = (category or "") + " " + name
    mapping = [
        (("한식", "국밥", "밥집"), "한식"),
        (("중식", "짬뽕", "짜장"), "중식"),
        (("일식", "돈까스", "라멘", "초밥", "스시", "회센터"), "일식"),
        (("양식", "파스타", "스테이크", "버거"), "양식"),
        (("분식", "떡볶이", "김밥"), "분식"),
        (("횟집", "횟수", "생선회", "물회", "효자", "해산물", "횟집"), "해산물"),
        (("카페", "베이커리", "빵집", "제빵", "디저트", "커피"), "카페"),
        (("고기", "삼겹", "구이", "갈비", "바비큐", "정육", "곱창", "숯불"), "고기"),
        (("국수", "칼국수", "막국수", "면요리", "소바", "라면"), "면요리"),
        (("분식", "떡볶이"), "분식"),
        (("국밥", "해장국", "감자탕"), "국밥"),
    ]
    for keys, k in mapping:
        for key in keys:
            if key in c:
                return k
    # menus guess
    mtext = " ".join(menus or [])
    for key, k in (("국수", "면요리"), ("라면", "면요리"), ("삼겹", "고기"), ("카페", "카페")):
        if key in mtext:
            return k
    return "한식"


def clean_addr(addr):
    """Full road address for area field; keep city part."""
    a = addr.replace("강원특별자치도", "강원").replace("강원도", "강원").strip()
    return a


def pick_menu(menus, category):
    skip = ("사용가능", "포장", "테이크아웃", "단체", "주차", "와이파이", "예약")
    for m in menus or []:
        if not any(s in m for s in skip) and len(m) <= 14:
            return m
    for m in menus or []:
        if not any(s in m for s in skip):
            return m[:14]
    return None


def main():
    cand = json.loads((DATA / "gangwon_candidates.json").read_text())
    verified = []
    seen = set()
    for x in cand:
        nm = re.sub(r"\s+", " ", x["name"]).strip()
        nm = re.sub(r"\s*(맛집|카페|커피|베이커리|강릉시내|강문해변|안목해변|주문진|사천|초당동|외곽)$", "", nm).strip()
        nm = re.sub(r"\s*\([^)]*\)$", "", nm).strip()
        nm = re.sub(r"^(?:\d+|[①-⑳])[.、)]\s*", "", nm)
        nm = re.sub(r"→.*$", "", nm).strip()
        nm = nm.split("(")[0].strip()
        city = re.match(r"강원(?:특별자치도)?\s*(\S{2,5}[시군])", x["addr"])
        citytok = city.group(1) if city else ""
        q = f"{citytok} {nm}" if citytok else nm
        r = places.search_place(q, limit=3)
        if not r:
            r = places.search_place(nm + " 강원", limit=3)
        hit = None
        for row in r:
            if row["name"].replace(" ", "") == nm.replace(" ", ""):
                hit = row
                break
            if nm.replace(" ", "") in row["name"].replace(" ", "") or row["name"].replace(" ", "") in nm.replace(" ", ""):
                hit = row
                break
        if not hit:
            continue
        det = places.place_detail(hit["id"], kind="restaurant")
        if not det or not det.get("roadAddress"):
            continue
        road = det["roadAddress"]
        if region_of(road) != "강원":
            continue
        key = (det["name"].replace(" ", ""), road[:14])
        if key in seen:
            continue
        seen.add(key)
        verified.append(dict(
            store=det["name"], road=clean_addr(road), category=det.get("category"),
            menus=det.get("menus"), lat=det.get("lat"), lon=det.get("lon"),
            channel=x["channelName"], ytChannel=x["ytChannel"], subs=x["subs"],
            videoId=x["videoId"], time=x.get("time"), query=q))
    (DATA / "gangwon_verified.json").write_text(json.dumps(verified, ensure_ascii=False, indent=1))
    print(f"verified {len(verified)} / {len(cand)}")
    for v in verified:
        print(f"  {v['store']} | {v['road'][:40]} | {v['category']} | {v['ytChannel'][:12]} | {v['videoId']} | {v['time']}")


if __name__ == "__main__":
    main()
