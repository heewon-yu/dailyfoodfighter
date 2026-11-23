#!/usr/bin/env python3
"""Foreground candidate verifier for 한입지도. Resumable: appends verified rows to data/verified_rows.jsonl."""
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, "/workspace/dailyfoodfighter/tools")
import places  # noqa: E402

ROOT = Path("/workspace/dailyfoodfighter")
DATA = ROOT / "data"
OUT = DATA / "verified_rows.jsonl"
LOG = DATA / "verify_progress.log"

PROV = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기",
        "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]
PROV_FIX = {
    "서울특별시": "서울", "서울시": "서울", "부산광역시": "부산", "대구광역시": "대구",
    "인천광역시": "인천", "광주광역시": "광주", "대전광역시": "대전", "울산광역시": "울산",
    "세종특별자치시": "세종", "경기도": "경기", "강원특별자치도": "강원", "강원도": "강원",
    "충청북도": "충북", "충청남도": "충남", "전북특별자치도": "전북", "전라북도": "전북",
    "전라남도": "전남", "경상북도": "경북", "경상남도": "경남", "제주특별자치도": "제주",
    "제주도": "제주",
}

MARKET = re.compile(r"(시장|5일장|전통시장|중앙시장)$")
DONG = re.compile(r"(\S{1,6}(?:동|읍|면|리))(?![가-힣])")

GENERIC = re.compile(
    r"^(이용 ?정보|위치|지번|주소|영상|오늘|여기|이곳|호텔 ?정보|방문 ?위치|매장 ?정보|"
    r"가격|메뉴|전화|예약|주차|영업|촬영|협조|정보|소개|코스|일정|촬영지|맛집 ?정보|"
    r"지도|네이버|인스타|블로그|구독|댓글|공지|타임라인|타임 ?스탬프|챕터)$")


def clean_name(raw):
    s = re.sub(r"[\U0001F300-\U0001FAFF]", " ", raw or "")
    s = re.sub(r"[\[\]\(\)<>★☆▪▫•·|:;\"'~`!@#$%^&*+=_/\\]", " ", s)
    s = re.sub(r"→.*$", " ", s)
    s = re.sub(r"^[\s\-–—.,]+", "", s)
    s = re.sub(r"^(매장명|가게명|상호|매장)\s*", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\s*(맛집|카페|커피|베이커리|빵집|본점|지점|외곽)$", "", s).strip()
    s = re.sub(r"\s*(맛집|카페|커피)$", "", s).strip()
    s = re.sub(r"\s*(강릉시내|강문해변|안목해변|주문진|사천|초당동)$", "", s).strip()
    return s


def name_ok(n):
    if not n or len(n) < 2 or len(n) > 22:
        return False
    if GENERIC.match(n):
        return False
    if re.fullmatch(r"[\d\s:.\-~]+", n):
        return False
    if n.count(" ") > 4:
        return False
    if re.search(r"(입니다|합니다|습니다|하세요|보세요|있습니다|드립니다)$", n):
        return False
    if "#" in n:
        return False
    if MARKET.search(n):
        return False
    return True


def norm_prov(a):
    a = a or ""
    for k, v in PROV_FIX.items():
        a = a.replace(k, v)
    return a.strip()


def prov_of(addr):
    a = norm_prov(addr)
    for p in PROV:
        if a.startswith(p):
            return p
    return None


def city_of(addr):
    a = norm_prov(addr)
    m = re.match(r"(?:%s)\s*(\S{2,6}?(?:시|군|구))" % "|".join(PROV), a)
    return m.group(1) if m else None


STREET = re.compile(r"([가-힣A-Za-z0-9·]+(?:로|길|대로)\s?\d+(?:-\d+)?)")


def street_of(addr):
    a = norm_prov(addr)
    m = STREET.search(a)
    if not m:
        return None
    s = m.group(1)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def dong_of(addr):
    a = norm_prov(addr)
    a = re.sub(r"^\S+\s+", "", a)   # drop province
    a = re.sub(r"^\S{2,6}?(?:시|군|구)\s*", "", a)  # drop city/district
    m = DONG.search(a)
    return m.group(1) if m else None


def norm(s):
    return re.sub(r"[\s\.\-_·,()\[\]]", "", (s or "")).lower()


def name_match(a, b):
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    if na in nb or nb in na:
        return 0.8
    # token overlap after splitting on space
    ta = set(re.findall(r"[가-힣A-Za-z0-9]+", (a or "").lower()))
    tb = set(re.findall(r"[가-힣A-Za-z0-9]+", (b or "").lower()))
    if not ta or not tb:
        return 0.0
    return 0.5 * len(ta & tb) / len(ta | tb)


KIND_MAP = [
    (("국밥", "해장국", "감자탕", "순대"), "국밥"),
    (("물회", "횟집", "생선회", "해산물", "게요리", "조개", "복어", "생선구이", "생선", "조기", "갈치", "고등어", "대게", "홍게", "오징어", "낙지", "주꾸미"), "해산물"),
    (("국수", "칼국수", "막국수", "냉면", "라멘", "파스타", "우동", "쫄면", "면"), "면요리"),
    (("중식", "중국", "짬뽕", "짜장", "마라", "양꼬치", "딤섬"), "중식"),
    (("일식", "초밥", "스시", "돈까스", "돈가스", "이자카야", "사시미", "규동", "덮밥"), "일식"),
    (("양식", "스테이크", "버거", "피자", "이탈리", "브런치", "멕시", "인도"), "양식"),
    (("분식", "떡볶이", "김밥", "튀김"), "분식"),
    (("카페", "디저트", "베이커리", "빵", "커피", "제과", "아이스크림", "빙수"), "카페"),
    (("고기", "삼겹", "갈비", "구이", "정육", "곱창", "막창", "숯불", "닭갈비", "바비큐", "찜닭"), "고기"),
    (("치킨", "닭"), "고기"),
    (("술집", "호프", "포차", "주점", "와인", "바"), "한식"),
    (("한식", "백반", "한정식", "비빔밥", "정식", "찌개", "전골", "불고기", "족발", "보쌈"), "한식"),
]
MENU_SKIP = ("사용가능", "포장", "테이크아웃", "단체", "주차", "와이파이", "예약", "배달", "최소", "무료", "세트메뉴", "2인", "1인")


def kind_of(category, name):
    c = f"{category or ''} {name or ''}"
    for keys, k in KIND_MAP:
        for key in keys:
            if key in c:
                return k
    return "한식"


def menu_of(menus, kind):
    for m in menus or []:
        m = m.strip()
        if not m or len(m) > 16:
            continue
        if any(s in m for s in MENU_SKIP):
            continue
        return m
    return kind


def search(q):
    try:
        return places.search_place(q, limit=8)
    except Exception:
        return []


def detail(pid):
    try:
        return places.place_detail(pid)
    except Exception:
        return None


def candidates():
    items = []
    seen = set()

    def add(name, addr, channel, subs, vid, start, prio):
        nm = clean_name(name)
        if not name_ok(nm):
            return
        st = street_of(addr or "")
        key = (norm(nm), norm(st or (addr or ""))[:10])
        if key in seen:
            return
        seen.add(key)
        items.append(dict(name=nm, addr=norm_prov(addr or ""), street=st, dong=dong_of(addr or ""),
                          prov=prov_of(addr or ""), city=city_of(addr or ""),
                          channel=channel, subs=subs, videoId=vid, start=start, prio=prio))

    # 1) gangwon candidates (highest priority)
    try:
        for x in json.loads((DATA / "gangwon_candidates.json").read_text()):
            add(x["name"], x.get("addr"), x["channelName"], x["subs"], x["videoId"], x.get("time"), 0)
    except Exception as e:
        print("gangwon err", e)

    # 2) all video descriptions with address pairs
    try:
        import descparse
        vids = json.loads((DATA / "videos.json").read_text())
        for vid, d in vids.items():
            if (d.get("subs") or 0) < 100000:
                continue
            for e in descparse.parse(d.get("description") or ""):
                a = norm_prov(e.get("addr") or "")
                if not prov_of(a):
                    continue
                add(e["name"], a, d["channel"], d["subs"], vid, e.get("time"),
                    0 if prov_of(a) == "강원" else 1)
    except Exception as e:
        print("desc err", e)

    # 3) entries_v2 leftovers
    try:
        for e in json.loads((DATA / "entries_v2.json").read_text()):
            a = norm_prov(e.get("addr") or "")
            if not prov_of(a):
                continue
            add(e["name"], a, e["channelName"], e["subs"], e["videoId"], e.get("time"),
                0 if prov_of(a) == "강원" else 2)
    except Exception as e:
        print("entries err", e)

    items.sort(key=lambda x: (x["prio"], x["prov"] != "강원"))
    return items


def verify_one(c):
    city = c["city"] or ""
    prov = c["prov"] or ""
    st = c["street"]
    pool = {}

    if city:
        for r in search(f"{city} {c['name']}"):
            pool.setdefault(r["id"], r)
    if not pool:
        for r in search(f"{prov} {c['name']}"):
            pool.setdefault(r["id"], r)
    if st:
        q = f"{city} {st}" if city else f"{prov} {st}"
        for r in search(q):
            if norm(st.split()[0]) in norm(r.get("roadAddress") or ""):
                pool.setdefault(r["id"], r)
    if not pool:
        return None, "no-search-result"

    def score(r):
        s = 0.0
        rd = norm_prov(r.get("roadAddress") or "") + " " + norm_prov(r.get("address") or "")
        if prov and rd.startswith(prov):
            s += 0.3
        if st and norm(st) .replace(" ", "") in norm(rd):
            s += 1.0
        s += name_match(c["name"], r.get("name") or "")
        return s

    ranked = sorted(pool.values(), key=score, reverse=True)[:2]
    for r in ranked:
        det = detail(r["id"])
        if not det or not det.get("roadAddress"):
            continue
        road = norm_prov(det["roadAddress"])
        rprov = prov_of(road)
        if prov and rprov != prov:
            continue
        if city and city not in road and city not in norm_prov(det.get("address") or ""):
            continue
        if st and norm(st).replace(" ", "") not in norm(road):
            # street mismatch: accept only on very strong name match
            if name_match(c["name"], det["name"]) < 0.95:
                continue
        if not st:
            nm_score = name_match(c["name"], det["name"])
            if nm_score < 0.6:
                continue
            dong = c.get("dong")
            if dong and norm(dong) not in norm(road) and dong not in norm_prov(det.get("address") or ""):
                # no street, and dong not confirmed -> only accept exact name match in the same city
                if nm_score < 0.95:
                    continue
        kind = kind_of(det.get("category"), det["name"])
        return dict(store=det["name"].strip(), road=road.strip(), category=det.get("category"),
                    kind=kind, menu=menu_of(det.get("menus"), kind),
                    region=rprov, channel=c["channel"], subs=c["subs"],
                    videoId=c["videoId"], start=c["start"], query=c["name"]), None
    return None, "no-address-match"


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 25
    cands = candidates()
    done = set()
    if OUT.exists():
        for line in OUT.read_text().splitlines():
            try:
                r = json.loads(line)
            except Exception:
                continue
            done.add((norm(r.get("query") or r.get("store") or ""), norm(r.get("videoId") or "")))
    todo = [c for c in cands if (norm(c["name"]), norm(c["videoId"])) not in done]
    print(f"candidates={len(cands)} done={len(done)} todo={len(todo)}", flush=True)
    t0 = time.time()
    n = 0
    for c in todo[:limit]:
        if time.time() - t0 > 245:
            print("time budget reached", flush=True)
            break
        row, why = verify_one(c)
        if row:
            row["query"] = c["name"]
            with OUT.open("a") as f:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
            print(f"OK   {row['store']} | {row['road']} | {row['kind']} | {row['channel']} {row['subs']}", flush=True)
        else:
            print(f"miss {c['name']} ({c['city']}) [{why}]", flush=True)
        n += 1
    print(f"processed {n} this run; total rows={sum(1 for _ in OUT.open()) if OUT.exists() else 0}", flush=True)


if __name__ == "__main__":
    main()
