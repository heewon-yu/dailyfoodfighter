#!/usr/bin/env python3
"""Filter, dedupe and merge verified new venues into map/index.html listings."""
import json
import re
from pathlib import Path

ROOT = Path("/workspace/dailyfoodfighter")
MAP = ROOT / "map/index.html"
DATA = ROOT / "data"

STRICT = re.compile(
    r"(한식|중식|일식|양식|분식|국수|칼국수|국밥|순대|곱창|막창|족발|보쌈|삼계탕|백숙|설렁탕|곰탕|감자탕|"
    r"추어탕|해물|생선|횟집|초밥|스시|돈가스|돈까스|치킨|닭강정|피자|햄버거|샌드위치|토스트|떡볶이|김밥|"
    r"만두|냉면|우동|라멘|파스타|스테이크|브런치|뷔페|마라|쌀국수|양꼬치|주꾸미|낙지|조개|대게|장어|육류|"
    r"고기요리|구이|두부|죽|카페|커피|베이커리|제과|디저트|아이스크림|주점|호프|술집|포차|이자카야|선술집|"
    r"막걸리|와인바|한정식|기사식당|백반|찌개|전골|불고기|갈비|닭갈비|오리|양고기|염소|태국|베트남|인도|"
    r"멕시코|차,커피|빙수|떡집|떡방|요리|식당|음식)")
BADCAT = re.compile(r"(보드|PC방|노래방|당구|볼링|만화|스터디|오락|사진|네일|헬스|필라테스|요가|골프|클라이밍|"
                    r"방탈출|독서실|사회복지|테마카페|관광|명소|숙박|캠핑|휴양|자동차|기업|빌딩|공사|부동산)")
CHAIN = re.compile(r"(스타벅스|이디야|메가 ?커피|컴포즈|투썸|빽다방|파리바게|뚜레쥬르|던킨|배스킨|맥도날드|"
                   r"롯데리아|버거킹|KFC|써브웨이|서브웨이|맘스터치|노브랜드|이마트|코스트코|쉐이크쉑|폴바셋|"
                   r"할리스|탐앤탐스|엔제리너스|커피빈|더벤티|매머드|요거트|배달의민족)")
BADNAME = re.compile(r"(보드게임|PC방|노래방|당구장|방탈출|케이블카|유원지|휴양림|캠핑장|정류장|터미널|주차장|"
                     r"공원|전망대|전시관|체험관|박물관|미술관|도서관|시청|구청|주민센터|족욕|쉼터|복합쉼터)")
GENERIC = {"대한민국", "한국", "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원",
           "충북", "충남", "전북", "전남", "경북", "경남", "제주", "맛집", "식당", "음식점", "가게", "매장",
           "위치", "주소", "장소", "영업시간", "메뉴", "가격", "카페", "커피", "분식", "치킨", "국밥", "국수",
           "고기", "회", "빵집", "베이커리", "시장", "전통시장", "먹자골목", "식당가", "본점", "지점"}

PROVS = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원",
         "충북", "충남", "전북", "전남", "경북", "경남", "제주"]


def norm(s):
    return re.sub(r"[\s\.\-_·,()\[\]'\"′`]", "", (s or "")).lower()


def base(name):
    n = norm(name)
    return re.sub(r"(본점|지점|직영점|분점|호점)$", "", n)


def load_map():
    h = MAP.read_text()
    m = re.search(r"const listings = \[(.*?)\n\];", h, re.S)
    rows = json.loads("[" + m.group(1) + "]")
    subs = {}
    for line in re.search(r"const subscribers = \{(.*?)\n\};", h, re.S).group(1).strip().split("\n"):
        mm = re.match(r'\s*"(.*)":\s*(\d+),?\s*$', line)
        subs[mm.group(1)] = int(mm.group(2))
    return h, rows, subs, m


def main():
    h, rows, subs, m = load_map()
    cand = json.loads((DATA / "new_places.json").read_text())

    drop = {}
    kept = []
    for r in cand:
        cat = r.get("category") or ""
        nm = (r.get("store") or "").strip()
        if not STRICT.search(cat) or BADCAT.search(cat):
            drop["cat"] = drop.get("cat", 0) + 1
            continue
        if CHAIN.search(nm):
            drop["chain"] = drop.get("chain", 0) + 1
            continue
        if BADNAME.search(nm) or nm in GENERIC:
            drop["name"] = drop.get("name", 0) + 1
            continue
        if len(re.sub(r"[^가-힣A-Za-z0-9]", "", nm)) < 2:
            drop["short"] = drop.get("short", 0) + 1
            continue
        if not re.search(r"\d", r.get("road") or ""):
            drop["road"] = drop.get("road", 0) + 1
            continue
        if r.get("channel") not in subs:
            drop["channel"] = drop.get("channel", 0) + 1
            continue
        if not re.fullmatch(r"[\w-]{11}", r.get("videoId") or ""):
            drop["video"] = drop.get("video", 0) + 1
            continue
        if r.get("region") not in PROVS:
            drop["region"] = drop.get("region", 0) + 1
            continue
        kept.append(r)
    print("filtered", len(kept), "of", len(cand), drop)

    exk = {(base(r[0]), r[1]) for r in rows}
    exn = {(norm(r[0]), r[1]) for r in rows}
    new = {}
    for r in kept:
        k = (base(r["store"]), r["region"])
        if k in exk or (norm(r["store"]), r["region"]) in exn:
            continue
        cur = new.get(k)
        if cur is None or (r.get("subs") or 0) > (cur.get("subs") or 0):
            new[k] = r
    new_rows = []
    for k, r in new.items():
        new_rows.append([r["store"].strip(), r["region"], r["road"].strip(), r["kind"],
                         r["menu"], r["videoId"], r["channel"], r.get("start")])
    new_rows.sort(key=lambda x: (PROVS.index(x[1]), x[0]))
    print("new listings", len(new_rows), "-> total", len(rows) + len(new_rows))

    allrows = rows + new_rows
    body = "".join("\n  " + json.dumps(r, ensure_ascii=False).replace('", "', '", "') + "," for r in allrows)
    body = body.rstrip(",")
    new_block = body + "\n"
    h2 = h[:m.start(1)] + new_block + h[m.end(1):]
    MAP.write_text(h2)
    print("written")
    json.dump(new_rows, open(DATA / "merged_new_rows.json", "w"), ensure_ascii=False, indent=0)


if __name__ == "__main__":
    main()
