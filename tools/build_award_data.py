#!/usr/bin/env python3
"""마일지도(/air/) 공식 공제표·성수기·공항 사전 데이터를 만든다.

입력
  /workspace/milemap/docs/route-catalog-20261126.json   대한항공 직항 국제선 103개 도시 + 공식 공제표
  /workspace/milemap/docs/peak-season-2026-2027.json    2026~2027 성수기 기간
  air/data/airport-coordinates.json                     기존 공항 좌표(OurAirports)

출력
  air/data/award-chart.json   권역별 공식 공제표 + 노선별 공제 마일 + 공제 구간 미확인 노선
  air/data/peak-season.json   성수기 기간 원본(앱이 직접 읽는다)
  air/data/airports.json      자동완성용 공항 사전(한글·영문·도시·IATA 별칭 포함)
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = Path("/workspace/milemap/docs")
OUT = ROOT / "air" / "data"

KST = timezone(timedelta(hours=9))

REGION_ORDER = [
    "일본",
    "중국/동북아시아",
    "동남아시아/괌",
    "서남아시아",
    "유럽/중동",
    "북미",
    "대양주",
]

REGION_LABEL = {
    "일본": "일본",
    "중국/동북아시아": "중국·동북아시아",
    "동남아시아/괌": "동남아시아·괌",
    "서남아시아": "서남아시아",
    "유럽/중동": "유럽·중동",
    "북미": "북미",
    "대양주": "대양주",
}

# 한글 이름만으로는 찾기 어려운 별칭(도시·통칭). 이름에서 자동 추출한 별칭에 더한다.
EXTRA_ALIASES = {
    "ICN": ["인천", "서울", "인천공항", "seoul", "incheon"],
    "GMP": ["김포", "서울", "김포공항", "seoul", "gimpo"],
    "PUS": ["부산", "김해", "부산공항", "busan", "gimhae"],
    "CJU": ["제주", "제주도", "jeju"],
    "NRT": ["도쿄", "나리타", "동경", "tokyo", "narita"],
    "HND": ["도쿄", "하네다", "동경", "tokyo", "haneda"],
    "KIX": ["오사카", "간사이", "osaka", "kansai"],
    "CTS": ["삿포로", "치토세", "sapporo", "chitose"],
    "OKA": ["오키나와", "나하", "okinawa", "naha"],
    "FUK": ["후쿠오카", "fukuoka"],
    "NGO": ["나고야", "chubu", "nagoya"],
    "DPS": ["발리", "덴파사르", "bali", "denpasar"],
    "BKK": ["방콕", "수완나품", "bangkok", "suvarnabhumi"],
    "SIN": ["싱가포르", "창이", "singapore", "changi"],
    "GUM": ["괌", "guam"],
    "SPN": ["사이판", "saipan"],
    "HNL": ["호놀룰루", "하와이", "honolulu", "hawaii"],
    "JFK": ["뉴욕", "케이프케네디", "new york", "nyc"],
    "LAX": ["로스앤젤레스", "엘에이", "los angeles"],
    "SFO": ["샌프란시스코", "san francisco"],
    "SEA": ["시애틀", "seattle"],
    "ATL": ["애틀랜타", "atlanta"],
    "IAD": ["워싱턴", "washington"],
    "BOS": ["보스턴", "boston"],
    "ORD": ["시카고", "chicago"],
    "DFW": ["댈러스", "dallas"],
    "LAS": ["라스베이거스", "las vegas"],
    "YVR": ["밴쿠버", "vancouver"],
    "YYZ": ["토론토", "toronto"],
    "CDG": ["파리", "샤를드골", "paris"],
    "LHR": ["런던", "히스로", "london", "heathrow"],
    "FRA": ["프랑크푸르트", "frankfurt"],
    "AMS": ["암스테르담", "amsterdam"],
    "FCO": ["로마", "rome"],
    "MXP": ["밀라노", "milan"],
    "MAD": ["마드리드", "madrid"],
    "LIS": ["리스본", "lisbon"],
    "VIE": ["비엔나", "빈", "vienna"],
    "PRG": ["프라하", "prague"],
    "BUD": ["부다페스트", "budapest"],
    "IST": ["이스탄불", "istanbul"],
    "DXB": ["두바이", "dubai"],
    "DEL": ["델리", "delhi"],
    "KTM": ["카트만두", "katmandu", "kathmandu"],
    "SYD": ["시드니", "sydney"],
    "MEL": ["멜버른", "melbourne"],
    "BNE": ["브리즈번", "brisbane"],
    "AKL": ["오클랜드", "auckland"],
    "UBN": ["울란바타르", "몽골", "ulaanbaatar"],
    "PEK": ["베이징", "북경", "beijing"],
    "PVG": ["상하이", "푸동", "shanghai"],
    "SHA": ["상하이", "훙차오", "shanghai"],
    "HKG": ["홍콩", "hong kong"],
    "TPE": ["타이베이", "타이페이", "taipei"],
    "CAN": ["광저우", "guangzhou"],
    "SZX": ["선전", "shenzhen"],
    "TAO": ["칭다오", "qingdao"],
    "DLC": ["다롄", "dalian"],
    "SHE": ["선양", "shenyang"],
    "XIY": ["시안", "xian"],
    "CGO": ["정저우", "zhengzhou"],
    "WUH": ["우한", "wuhan"],
    "NKG": ["난징", "nanjing"],
    "HGH": ["항저우", "hangzhou"],
    "XMN": ["샤먼", "xiamen"],
    "KMG": ["쿤밍", "kunming"],
    "CSX": ["창사", "changsha"],
    "TSN": ["톈진", "tianjin"],
    "FOC": ["푸저우", "fuzhou"],
    "HFE": ["허페이", "hefei"],
    "MFM": ["마카오", "macau"],
    "DAD": ["다낭", "danang", "da nang"],
    "HAN": ["하노이", "hanoi"],
    "SGN": ["호찌민", "호치민", "ho chi minh"],
    "CXR": ["나트랑", "nha trang"],
    "PQC": ["푸꾸옥", "phu quoc"],
    "MNL": ["마닐라", "manila"],
    "CEB": ["세부", "cebu"],
    "CGK": ["자카르타", "jakarta"],
    "KUL": ["쿠알라룸푸르", "kuala lumpur"],
    "HKT": ["푸껫", "푸켓", "phuket"],
    "CNX": ["치앙마이", "chiang mai"],
    "RGN": ["양곤", "yangon"],
    "KTI": ["프놈펜", "phnom penh"],
}

KOREA = ["ICN", "GMP", "PUS", "CJU"]


def clean_city(raw: str) -> str:
    return re.split(r"[/,(]", raw)[0].strip()


def main() -> None:
    catalog = json.loads((SRC / "route-catalog-20261126.json").read_text(encoding="utf-8"))
    peak = json.loads((SRC / "peak-season-2026-2027.json").read_text(encoding="utf-8"))
    coords = json.loads((OUT / "airport-coordinates.json").read_text(encoding="utf-8"))

    now = datetime.now(KST).replace(microsecond=0)

    dest_names: dict[str, str] = {}
    dest_region: dict[str, str] = {}
    routes = []

    for route in catalog["routes"]:
        dest = route["destination"]
        dest_names[dest] = route["destination_name"]
        dest_region[dest] = route["award_region"]
        chart = route["award_offpeak_peak"]
        routes.append({
            "o": route["origin"],
            "d": dest,
            "region": route["award_region"],
            "official_region": route.get("official_region") or "",
            "miles": {k: chart.get(k) for k in ("E", "P", "F")},
        })

    routes.sort(key=lambda r: (
        r["o"],
        REGION_ORDER.index(r["region"]) if r["region"] in REGION_ORDER else 99,
        r["d"],
    ))

    regions: dict[str, dict] = {}
    for route in routes:
        region = route["region"]
        if region not in regions:
            regions[region] = {
                "key": region,
                "label": REGION_LABEL.get(region, region),
                "miles": route["miles"],
                "destinations": [],
            }
        regions[region]["destinations"].append(route["d"])

    ordered = [regions[k] for k in REGION_ORDER if k in regions]
    for key, value in regions.items():
        if key not in REGION_ORDER:
            ordered.append(value)

    pending = [
        {"code": r["d"], "name": dest_names[r["d"]], "region": r["region"]}
        for r in routes
        if not r["miles"].get("E")
    ]

    award = {
        "schema_version": 2,
        "generated_at": now.isoformat(),
        "source": catalog.get("source"),
        "chart_source": catalog.get("award_chart_source"),
        "chart_note": catalog.get("award_chart_note"),
        "scope": catalog.get("scope"),
        "cabins": ["E", "P", "F"],
        "korea_airports": KOREA,
        "counts": catalog.get("counts"),
        "regions": ordered,
        "routes": routes,
        "pending": pending,
    }

    (OUT / "award-chart.json").write_text(json.dumps(award, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "peak-season.json").write_text(json.dumps(peak, ensure_ascii=False, indent=1), encoding="utf-8")

    by_code = {}
    for airport in coords["airports"]:
        by_code[airport["code"]] = airport

    for code, name in dest_names.items():
        if code not in by_code:
            by_code[code] = {"code": code, "name": name, "region": "", "english_name": "", "municipality": ""}

    airports = []
    for code, airport in sorted(by_code.items()):
        name = dest_names.get(code) or airport.get("name") or code
        city = clean_city(name)
        english = airport.get("english_name") or ""
        municipality = airport.get("municipality") or ""

        aliases = set()
        for token in re.split(r"[/,()]", name):
            token = token.strip()
            if len(token) >= 2:
                aliases.add(token)
        aliases.add(city)
        if municipality:
            aliases.add(municipality)
        for extra in EXTRA_ALIASES.get(code, []):
            aliases.add(extra)
        aliases |= {a.lower() for a in aliases if a}
        aliases = {a for a in aliases if a}

        region = dest_region.get(code)
        if code in KOREA:
            region = "대한민국"
        if not region:
            region = airport.get("region") or ""

        airports.append({
            "code": code,
            "name": name,
            "city": city,
            "english": english,
            "municipality": municipality,
            "region": region,
            "country": airport.get("country") or "",
            "lat": airport.get("latitude"),
            "lon": airport.get("longitude"),
            "aliases": sorted(aliases),
            "chart": any(r["miles"].get("E") for r in routes if r["d"] == code),
        })

    (OUT / "airports.json").write_text(
        json.dumps({
            "schema_version": 2,
            "generated_at": now.isoformat(),
            "source": "OurAirports(좌표) + 대한항공 공식 운항 노선(도시명·공제 구간)",
            "total": len(airports),
            "airports": airports,
        }, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )

    print(f"routes={len(routes)} regions={len(ordered)} pending={len(pending)} airports={len(airports)}")


if __name__ == "__main__":
    main()
