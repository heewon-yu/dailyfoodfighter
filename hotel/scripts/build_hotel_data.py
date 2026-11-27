#!/usr/bin/env python3
"""hotel/scripts → dailyfoodfighter/hotel/data/hotels.json 빌드.

입력: scripts/data/hotels_luxury.json (124건 마스터 · 영업 중 119곳)
      scripts/data/observed_sample.json (디렉터리에서 판독한 영업 중 119곳 전수)
출력: scripts/data/hotels_points_summary.json (관측 요약 · 감사용)
      hotel/data/hotels.json (앱이 실제로 읽는 데이터)

실행: python3 hotel/scripts/build_hotel_data.py
"""
import argparse, json, re, unicodedata, collections, datetime, pathlib

ROOT = pathlib.Path(__file__).resolve().parent          # hotel/scripts
OUT_APP = ROOT.parent / "data" / "hotels.json"           # hotel/data/hotels.json
DATA = ROOT / "data"

# 2026-11-27 exchangerate-api.com (KRW 기준) → 1단위당 원
FX = {
    "KRW": 1.0, "USD": 1344.09, "JPY": 8.44, "EUR": 1474.93, "CNY": 201.33,
    "THB": 39.48, "HKD": 171.53, "MOP": 166.53, "SGD": 1041.67, "AED": 365.90,
    "QAR": 369.14, "KWD": 4329.00, "OMR": 3496.50, "MYR": 326.58, "PHP": 21.06,
    "IDR": 0.0732, "INR": 14.52, "AUD": 891.26, "GBP": 1760.56, "TWD": 40.78,
    "MVR": 87.02, "SAR": 358.42, "ZAR": 76.61, "BRL": 233.26,
}
FX_DATE = "2026-11-27"
FX_SOURCE = "exchangerate-api.com (open.er-api.com, 2026-11-27 00:02 UTC 기준)"

CITY_KO = {
    "Seoul": "서울", "Osaka": "오사카", "Tokyo": "도쿄", "Kyoto": "교토", "Nagoya": "나고야",
    "Bangkok": "방콕", "Singapore": "싱가포르", "Bali": "발리", "Kuala Lumpur": "쿠알라룸푸르",
    "Hong Kong": "홍콩", "Macau": "마카오", "Shanghai": "상하이", "Beijing": "베이징",
    "Shenzhen": "선전", "Guangzhou": "광저우", "Hangzhou": "항저우", "Hangzhou (Tonglu)": "항저우(퉁루)",
    "Chengdu": "청두", "Chongqing": "충칭", "Xiamen": "샤먼", "Sanya": "싼야", "Tianjin": "톈진",
    "Dalian": "다롄", "Shenyang": "선양", "Urumqi": "우루무치", "Jiuzhaigou": "주자이거우",
    "Altay (Hemu)": "아러타이(허무)", "Koh Samui": "코사무이", "Pasay City (Metro Manila)": "마닐라",
    "Ithaafushi Island": "말레(이타푸시)", "Rangali Island": "랑갈리섬", "Dubai": "두바이",
    "Abu Dhabi": "아부다비", "Doha": "도하", "Al Rayyan Area, Doha": "도하(알라이얀)",
    "Ras Al Khaimah": "라스알카이마", "Kuwait City": "쿠웨이트시티", "Muscat": "무스카트",
    "Manama": "마나마", "Riyadh": "리야드", "Jeddah": "제다", "Makkah": "메카", "Cairo": "카이로",
    "Istanbul": "이스탄불", "Bodrum": "보드룸", "Athens": "아테네", "Santorini": "산토리니",
    "Rome": "로마", "Domus de Maria (Sardinia)": "사르데냐", "Paris": "파리", "Versailles": "베르사유",
    "London": "런던", "Amsterdam": "암스테르담", "Berlin": "베를린", "Hamburg": "함부르크",
    "Helsinki": "헬싱키", "Dublin": "더블린", "Almancil (Algarve)": "알가르브", "Minsk": "민스크",
    "Jerusalem": "예루살렘", "Rabat-Salé": "라바트", "Harhoura (Rabat)": "라바트(하르후라)",
    "Mahé": "마헤", "Platte Island": "플라트섬", "Bora Bora": "보라보라", "Guanacaste": "과나카스테",
    "Panama City": "파나마시티", "Cabo San Lucas": "카보산루카스", "Punta de Mita": "푼타데미타", "Cancún (Riviera Maya)": "칸쿤(리비에라 마야)",
    "Tulum": "툴룸", "West Indies (Anguilla)": "앵귈라", "Gold Coast": "골드코스트",
    "Honolulu, Hawaii": "호놀룰루", "Wailea, Hawaii": "와일레아", "Las Vegas, Nevada": "라스베이거스",
    "Los Angeles, California": "로스앤젤레스", "Beverly Hills, California": "비벌리힐스",
    "Santa Monica, California": "산타모니카", "Coronado, California": "코로나도",
    "Dana Point, California": "데이나포인트", "New York, New York": "뉴욕", "Washington, DC": "워싱턴DC",
    "Chicago, Illinois": "시카고", "Atlanta, Georgia": "애틀랜타", "Orlando, Florida": "올랜도",
    "Fort Lauderdale, Florida": "포트로더데일", "Nashville, Tennessee": "내슈빌",
    "New Orleans, Louisiana": "뉴올리언스", "Park City, Utah": "파크시티", "Phoenix, Arizona": "피닉스",
    "Indianapolis, Indiana": "인디애나폴리스", "Bengaluru": "벵갈루루", "Pune": "푸네",
}

COUNTRY_KO = {
    "South Korea": "한국", "Japan": "일본", "China": "중국", "Thailand": "태국", "Singapore": "싱가포르",
    "Indonesia": "인도네시아", "Malaysia": "말레이시아", "Hong Kong SAR": "홍콩", "Macao SAR": "마카오",
    "Maldives": "몰디브", "Philippines": "필리핀", "U.A.E": "아랍에미리트", "Qatar": "카타르",
    "Kuwait": "쿠웨이트", "Oman": "오만", "Bahrain": "바레인", "Saudi Arabia": "사우디아라비아",
    "Egypt": "이집트", "Türkiye": "튀르키예", "Greece": "그리스", "Italy": "이탈리아",
    "France": "프랑스", "United Kingdom": "영국", "Netherlands": "네덜란드", "Germany": "독일",
    "Finland": "핀란드", "Ireland": "아일랜드", "Portugal": "포르투갈", "Belarus": "벨라루스",
    "Israel": "이스라엘", "Morocco": "모로코", "Seychelles": "세이셸", "French Polynesia": "프랑스령 폴리네시아",
    "Costa Rica": "코스타리카", "Panama": "파나마", "Mexico": "멕시코", "Anguilla": "앵귈라",
    "Australia": "호주", "USA": "미국", "India": "인도",
}

BRAND = {"wa": ("Waldorf Astoria", "월도프 아스토리아"), "co": ("Conrad", "콘래드"), "lx": ("LXR", "LXR")}

REGION_ORDER = ["한국", "일본", "중국·동남아", "남아시아·몰디브", "중동·아프리카", "유럽", "미주", "오세아니아·카리브"]

EXCLUDED = {
    "CUNCICI": "올인클루시브 리조트 — 힐튼 숙박권(Free Night Reward) 사용 제외 대상에 해당하는 유형입니다.",
    "CUNWAWA": "올인클루시브 리조트 — 힐튼 숙박권(Free Night Reward) 사용 제외 대상에 해당하는 유형입니다.",
}
CAUTION = {"OGGHOWA": "HGV(휴가지 소유)가 운영하는 레지던스형 숙소 — 숙박권 사용 가능 여부를 공식 예약 화면에서 확인하세요."}


DEFAULT_OBS = "2026-11-27T14:41:00+09:00"
DEFAULT_OBS_LABEL = "2026-11-27 14:41 KST"


def norm(s):
    s = unicodedata.normalize("NFKD", s).lower()
    s = re.sub(r"[,\.']", "", s)
    s = re.sub(r"\b(lxr hotels (&|and) resorts|lxr hotels (&|and) resort|lxr|waldorf astoria|conrad|a waldorf astoria resort)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


def main():
    ap = argparse.ArgumentParser(description="관측 JSON + 마스터 → hotel/data/hotels.json")
    ap.add_argument("--observed", default=str(DATA / "observed_sample.json"),
                    help="관측 레코드 JSON(collect_locations.py --out 결과). 기본: data/observed_sample.json")
    args = ap.parse_args()

    master = json.load(open(DATA / "hotels_luxury.json"))
    obs = json.load(open(args.observed))

    by_name = {}
    for h in master["hotels"]:
        by_name[(h["brand"], norm(h["name"]))] = h
    by_code = {h["code"].upper(): h for h in master["hotels"]}

    observed = {}
    for r in obs["records"]:
        n = norm(r["name"])
        h = by_code.get((r.get("code") or "").upper()) or by_name.get((r["brand"], n))
        if not h:
            cands = [v for (b, k), v in by_name.items() if b == r["brand"] and (k.startswith(n) or n.startswith(k))]
            assert len(cands) == 1, r["name"]
            h = cands[0]
        observed[h["code"]] = r

    hotels = []
    for h in master["hotels"]:
        code = h["code"].upper()
        o = observed.get(h["code"])
        if o:
            rt = o["rewardType"]
            points = o.get("points")
            status = {"STANDARD": "AVAILABLE", "PREMIUM": "AVAILABLE", "SOLD_OUT": "SOLD_OUT",
                      "NO_POINTS": "NOT_QUERIED", "COMING_SOON": "NOT_QUERIED"}[rt]
            cash_amount = o.get("cashAmount")
            cash_cur = o.get("cashCurrency")
            cash_krw = int(round(cash_amount * FX[cash_cur])) if cash_amount and cash_cur in FX else None
            vpp = round(cash_krw / points, 2) if cash_krw and points else None
        else:
            rt = "UNOBSERVED"
            points = None
            status = "NOT_QUERIED"
            cash_amount = cash_cur = cash_krw = vpp = None

        rec = {
            "code": code,
            "codeLower": h["code"],
            "name": h["name"],
            "brand": h["brand"],
            "brandLabel": BRAND[h["brand"]][0],
            "brandKo": BRAND[h["brand"]][1],
            "city": h["city"],
            "cityKo": CITY_KO.get(h["city"], h["city"]),
            "country": h["country"],
            "countryKo": COUNTRY_KO.get(h["country"], h["country"]),
            "region": h["region"],
            "status": h["status"],
            "statusLabel": h["statusLabel"],
            "url": h["url"],
            "points": points,
            "rewardType": rt,
            "standardAvailable": rt == "STANDARD",
            "premiumOnly": rt == "PREMIUM",
            "soldOut": rt == "SOLD_OUT",
            "note": {"NO_POINTS": "포인트 표기 없음(현금만)", "COMING_SOON": "개관 예정",
                     "SOLD_OUT": "향후 30일 포인트 재고 없음"}.get(rt, o.get("note", "") if o else ""),
            "cashAmount": cash_amount,
            "cashCurrency": cash_cur,
            "cashKrw": cash_krw,
            "valuePerPoint": vpp,
            "observedAt": (o.get("observedAt") or DEFAULT_OBS) if o else None,
            "observedAtLabel": (o.get("observedAtLabel") or DEFAULT_OBS_LABEL) if o else None,
            "excluded": code in EXCLUDED,
            "exclusionNote": EXCLUDED.get(code) or CAUTION.get(code, ""),
        }
        hotels.append(rec)

    counts = collections.Counter()
    for r in hotels:
        if r["status"] != "open":
            continue
        counts["open"] += 1
        if r["rewardType"] == "STANDARD":
            counts["standard"] += 1
        elif r["rewardType"] == "PREMIUM":
            counts["premium"] += 1
        elif r["rewardType"] == "UNOBSERVED":
            counts["unobserved"] += 1
        else:
            counts["other"] += 1

    cities = {}
    for r in hotels:
        if r["status"] != "open":
            continue
        key = r["city"]
        c = cities.setdefault(key, {"city": key, "cityKo": r["cityKo"], "country": r["country"],
                                    "countryKo": r["countryKo"], "region": r["region"], "count": 0,
                                    "standard": 0, "observed": 0})
        c["count"] += 1
        if r["standardAvailable"]:
            c["standard"] += 1
        if r["rewardType"] in ("STANDARD", "PREMIUM", "SOLD_OUT", "NO_POINTS"):
            c["observed"] += 1

    city_list = sorted(cities.values(), key=lambda c: (-c["count"], c["cityKo"]))

    obs_meta = obs.get("meta") or {}
    observed_date = str(obs_meta.get("observedAt") or DEFAULT_OBS)[:10]
    meta = {
        "title": "힐튼포숙지도",
        "generatedAt": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "observedAt": obs_meta.get("observedAtLabel") or DEFAULT_OBS_LABEL,
        "observedBasis": "hilton.com 브랜드별 Locations 디렉터리 · Use Points 체크 · 향후 30일 현재 재고 최저 포인트",
        "observedScope": obs_meta.get("observedScope") or "영업 중 119곳 전수(1차 80곳 + 2차 잔여 4페이지 40곳 + 재확인 1곳)",
        "notice": "표시 포인트·현금가는 관측 시점의 디렉터리 '향후 30일 최저' 값이며, 선택한 날짜의 실시간 요금이 아닙니다.",
        "masterCount": sum(1 for r in hotels if r["status"] == "open"),
        "directoryCount": len(hotels),
        "counts": dict(counts),
        "fx": {"base": "KRW", "date": FX_DATE, "source": FX_SOURCE,
               "rates": {k: v for k, v in FX.items() if k != "KRW"}},
        "regions": REGION_ORDER,
        "sources": obs_meta.get("sources") or ["https://www.hilton.com/en/locations/ (브랜드 디렉터리 8페이지)"],
        "api": {
            "mode": "static",
            "ratesEndpoint": "/api/hotel/rates",
            "d1Binding": "HOTEL_DB",
            "schema": "functions/api/hotel/schema.sql",
        },
    }

    out = {"meta": meta, "hotels": hotels, "cities": city_list}
    OUT_APP.parent.mkdir(parents=True, exist_ok=True)
    json.dump(out, open(OUT_APP, "w"), ensure_ascii=False, separators=(",", ":"))
    print("wrote", OUT_APP, len(hotels), "hotels", dict(counts), "cities", len(city_list))

    # 프로젝트 기록용 요약 (관측 호텔만)
    summary = {
        "meta": {
            "project": "힐튼포숙지도 (/hotel/) 포인트 요약 — 영업 중 119곳 전수 관측",
            "generatedAt": meta["generatedAt"],
            "observedAt": meta["observedAt"],
            "sampleNote": f"영업 중 119곳 전수 관측 스냅샷({observed_date}). 매일 새 정적 스냅샷으로 교체한다.",
            "method": "브랜드별 /en/locations/ 디렉터리에서 Use Points 체크 후 카드의 Points/night + Standard Room Reward / Premium Room Rewards 라벨, From* 현금가 판독",
            "valueMeaning": "향후 30일 현재 재고 기준 최저 포인트·최저 현금가(특정 날짜 값 아님)",
            "fx": meta["fx"],
            "sources": meta["sources"],
            "counts": {"masterOpen": meta["masterCount"], "observed": sum(1 for r in hotels if r["observedAt"]),
                       "standard": counts["standard"], "premiumOnly": counts["premium"],
                       "soldOut": sum(1 for r in hotels if r["soldOut"]),
                       "unobserved": counts["unobserved"]},
            "limits": ["hilton.com robots.txt 가 /book/ 를 Disallow — 날짜별 요금 대량 수집은 하지 않음",
                       "값은 변동 가능(관측 시각 기준 스냅샷)"],
        },
        "hotels": [r for r in hotels if r["observedAt"]],
        "unobservedOpenCodes": [r["codeLower"] for r in hotels if r["status"] == "open" and not r["observedAt"]],
    }
    json.dump(summary, open(DATA / "hotels_points_summary.json", "w"), ensure_ascii=False, indent=1)
    print("wrote summary", len(summary["hotels"]))


if __name__ == "__main__":
    main()
