#!/usr/bin/env python3
"""대한항공 보너스 핫픽(마일리지 할인) 데이터 생성기

출처: 대한항공 공식 "보너스 항공권 > 보너스 핫픽"
      https://www.koreanair.com/contents/skypass/use-miles/award-ticket/hotpick
      (2026-11-26 17:44~17:50 KST 브라우저로 7개 지역 탭 전수 확인)

원칙
  - 아래 RAW 표는 공식 페이지에서 확인한 값만 옮겨 적는다. 추측·보간 금지.
  - 할인 마일리지는 지역 묶음별로 하나이고, 등급은 표에 나온 예약 등급(X=일반석, O=프레스티지석)만 존재한다.
  - 일등석(F)·프레스티지 스위트 등 그 밖의 등급은 어느 탭에도 표가 없다(할인 없음).
  - 부산(PUS) 출발·도착 노선은 사이트 정책(7종 개편: PUS 제외)에 따라 routes에서 빼고 excluded_pus에 기록한다.
  - 실공제 마일리지 = air/data/award-chart.json 의 해당 노선·등급 공제 마일 − 지역 할인액(편도).
    공제표에 값이 없는 노선(예: 울란바타르)은 null 로 두고 note 로 남긴다.

사용: python3 tools/build_bonus_hotpick.py
출력: air/data/bonus-hotpick.json
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "air" / "data" / "bonus-hotpick.json"
CHART = ROOT / "air" / "data" / "award-chart.json"

SOURCE_URL = "https://www.koreanair.com/contents/skypass/use-miles/award-ticket/hotpick"
VERIFIED_AT = "2026-11-26T17:50:00+09:00"

PURCHASE_LABEL = "2026년 10월 25일 ~ 2027년 3월 27일"
DEPARTURE_LABEL = "10월 25일 ~ 3월 27일 (12/23~1/4, 2/4~3/2 제외)"

# 공식 페이지 공통 안내: 출발 기간에서 제외되는 날짜(월-일)
EXCLUDED_MD = [
    {"start": "12-23", "end": "01-04", "label": "12/23~1/4"},
    {"start": "02-04", "end": "03-02", "label": "2/4~3/2"},
]

ALL = "전편"

# 예약 등급 → 공제표 등급 문자 (공제표는 E/P/F 세 등급만 쓴다)
CLASS_LETTER = {"X": "E", "O": "P"}

# (구간 한글표기, 출발, 도착, 대상 항공편, 출발기간(월-일~월-일))
RAW = [
    {
        "key": "japan",
        "label": "한국 ↔ 일본",
        "discount": {"oneway": 2500, "round": 5000},
        "cabins": [
            {
                "cabin": "economy", "booking_class": "X",
                "routes": [
                    ("인천 ↔ 후쿠오카", "ICN", "FUK", "KE781, KE788", "10-25~12-24"),
                    ("인천 ↔ 오사카", "ICN", "KIX", "KE737, KE738", "10-25~01-31"),
                    ("인천 ↔ 구마모토", "ICN", "KMJ", "KE2155, KE2156", "10-25~03-27"),
                    ("인천 ↔ 아오모리", "ICN", "AOJ", "KE2193, KE2194", "10-25~03-27"),
                    ("인천 ↔ 오카야마", "ICN", "OKJ", "KE2185, KE2186", "10-25~03-27"),
                    ("인천 ↔ 가고시마", "ICN", "KOJ", "KE2179, KE2180, KE2182", "10-25~03-27"),
                    ("인천 ↔ 니가타", "ICN", "KIJ", "KE2197, KE2198", "10-25~03-27"),
                    ("인천 ↔ 나고야", "ICN", "NGO", "KE749, KE750", "10-25~03-27"),
                    ("인천 ↔ 고마쓰", "ICN", "KMQ", "KE2189, KE2190", "10-25~03-27"),
                    ("인천 ↔ 오이타", "ICN", "OIT", "KE2177, KE2178", "10-25~03-27"),
                    ("인천 ↔ 고베", "ICN", "UKB", "KE2171, KE2172, KE2173, KE2174", "10-25~03-27"),
                    ("인천 ↔ 도쿄/하네다", "ICN", "HND", "KE751, KE752", "10-25~03-27"),
                    ("인천 ↔ 도쿄/나리타", "ICN", "NRT", "KE705, KE706", "11-01~01-31"),
                    ("인천 ↔ 히로시마", "ICN", "HIJ", "KE2183, KE2184", "12-23~01-31"),
                    ("제주 ↔ 도쿄/나리타", "CJU", "NRT", "KE2125, KE2126", "10-25~03-27"),
                ],
            },
            {
                "cabin": "business", "booking_class": "O",
                "routes": [
                    ("인천 ↔ 구마모토", "ICN", "KMJ", "KE2155, KE2156", "10-25~03-27"),
                    ("인천 ↔ 아오모리", "ICN", "AOJ", "KE2193, KE2194", "10-25~03-27"),
                    ("인천 ↔ 오카야마", "ICN", "OKJ", "KE2185, KE2186", "10-25~03-27"),
                    ("인천 ↔ 가고시마", "ICN", "KOJ", "KE2179, KE2180, KE2182", "10-25~03-27"),
                    ("인천 ↔ 니가타", "ICN", "KIJ", "KE2197, KE2198", "10-25~03-27"),
                    ("인천 ↔ 나고야", "ICN", "NGO", "KE749, KE750", "10-25~03-27"),
                    ("인천 ↔ 오이타", "ICN", "OIT", "KE2177, KE2178", "10-25~03-27"),
                    ("인천 ↔ 도쿄/하네다", "ICN", "HND", "KE751, KE752", "10-25~03-27"),
                    ("인천 ↔ 도쿄/나리타", "ICN", "NRT", "KE705, KE706", "11-01~01-31"),
                ],
            },
        ],
    },
    {
        "key": "china",
        "label": "한국 ↔ 중국/동북아",
        "discount": {"oneway": 2500, "round": 5000},
        "cabins": [
            {
                "cabin": "economy", "booking_class": "X",
                "routes": [
                    ("인천 ↔ 광저우", "ICN", "CAN", ALL, "10-25~03-27"),
                    ("인천 ↔ 정저우", "ICN", "CGO", ALL, "10-25~03-27"),
                    ("인천 ↔ 창사", "ICN", "CSX", ALL, "10-25~03-27"),
                    ("인천 ↔ 다롄", "ICN", "DLC", ALL, "10-25~03-27"),
                    ("인천 ↔ 장자제", "ICN", "DYG", ALL, "10-25~03-27"),
                    ("인천 ↔ 허페이", "ICN", "HFE", ALL, "10-25~03-27"),
                    ("인천 ↔ 쿤밍", "ICN", "KMG", ALL, "10-25~03-27"),
                    ("인천 ↔ 선양", "ICN", "SHE", ALL, "10-25~03-27"),
                    ("인천 ↔ 톈진", "ICN", "TSN", ALL, "10-25~03-27"),
                    ("인천 ↔ 우한", "ICN", "WUH", ALL, "10-25~03-27"),
                    ("인천 ↔ 시안/센양", "ICN", "XIY", ALL, "10-25~03-27"),
                    ("인천 ↔ 샤먼", "ICN", "XMN", ALL, "10-25~03-27"),
                    ("인천 ↔ 옌지", "ICN", "YNJ", ALL, "10-25~03-27"),
                    ("인천 ↔ 홍콩", "ICN", "HKG", ALL, "10-25~03-27"),
                    ("인천 ↔ 칭다오", "ICN", "TAO", ALL, "10-25~03-27"),
                    ("인천 ↔ 베이징/서우두", "ICN", "PEK", ALL, "10-25~03-27"),
                    ("인천 ↔ 타이중", "ICN", "RMQ", ALL, "10-25~03-27"),
                    ("인천 ↔ 울란바타르", "ICN", "UBN", ALL, "10-25~03-27"),
                    ("김포 ↔ 베이징/서우두", "GMP", "PEK", ALL, "10-25~03-27"),
                    ("김포 ↔ 상하이/홍차오", "GMP", "SHA", ALL, "10-25~03-27"),
                    ("부산 ↔ 칭다오", "PUS", "TAO", ALL, "10-25~03-27"),
                    ("부산 ↔ 타이베이/타오위엔", "PUS", "TPE", ALL, "10-25~03-27"),
                    ("제주 ↔ 베이징/서우두", "CJU", "PEK", ALL, "10-25~03-27"),
                ],
            },
            {
                "cabin": "business", "booking_class": "O",
                "routes": [
                    ("인천 ↔ 광저우", "ICN", "CAN", ALL, "10-25~03-27"),
                    ("인천 ↔ 정저우", "ICN", "CGO", ALL, "10-25~03-27"),
                    ("인천 ↔ 창사", "ICN", "CSX", ALL, "10-25~03-27"),
                    ("인천 ↔ 다롄", "ICN", "DLC", ALL, "10-25~03-27"),
                    ("인천 ↔ 장자제", "ICN", "DYG", ALL, "10-25~03-27"),
                    ("인천 ↔ 허페이", "ICN", "HFE", ALL, "10-25~03-27"),
                    ("인천 ↔ 쿤밍", "ICN", "KMG", ALL, "10-25~03-27"),
                    ("인천 ↔ 선양", "ICN", "SHE", ALL, "10-25~03-27"),
                    ("인천 ↔ 톈진", "ICN", "TSN", ALL, "10-25~03-27"),
                    ("인천 ↔ 우한", "ICN", "WUH", ALL, "10-25~03-27"),
                    ("인천 ↔ 시안/센양", "ICN", "XIY", ALL, "10-25~03-27"),
                    ("인천 ↔ 샤먼", "ICN", "XMN", ALL, "10-25~03-27"),
                    ("인천 ↔ 옌지", "ICN", "YNJ", ALL, "10-25~03-27"),
                    ("인천 ↔ 상하이/푸동", "ICN", "PVG", ALL, "10-25~03-27"),
                    ("김포 ↔ 베이징/서우두", "GMP", "PEK", ALL, "10-25~03-27"),
                    ("김포 ↔ 상하이/홍차오", "GMP", "SHA", ALL, "10-25~03-27"),
                    ("부산 ↔ 칭다오", "PUS", "TAO", ALL, "10-25~03-27"),
                    ("부산 ↔ 타이베이/타오위엔", "PUS", "TPE", ALL, "10-25~03-27"),
                    ("제주 ↔ 베이징/서우두", "CJU", "PEK", ALL, "10-25~03-27"),
                ],
            },
        ],
    },
    {
        "key": "southeast-asia",
        "label": "한국 ↔ 동/서남아",
        "discount": {"oneway": 3500, "round": 7000},
        "cabins": [
            {
                "cabin": "economy", "booking_class": "X",
                "routes": [
                    ("인천 ↔ 푸껫", "ICN", "HKT", ALL, "10-25~11-30"),
                    ("인천 ↔ 치앙마이", "ICN", "CNX", ALL, "10-25~11-30"),
                    ("인천 ↔ 호찌민", "ICN", "SGN", ALL, "10-25~11-30"),
                    ("인천 ↔ 카트만두", "ICN", "KTM", ALL, "10-25~12-31"),
                    ("인천 ↔ 다낭", "ICN", "DAD", "KE459, KE460", "10-25~12-31"),
                    ("인천 ↔ 나트랑", "ICN", "CXR", ALL, "10-25~12-31"),
                    ("인천 ↔ 마닐라", "ICN", "MNL", ALL, "10-25~01-31"),
                    ("인천 ↔ 델리", "ICN", "DEL", ALL, "10-25~03-27"),
                    ("인천 ↔ 괌", "ICN", "GUM", ALL, "10-25~03-27"),
                    ("인천 ↔ 덴파사르/발리", "ICN", "DPS", "KE433, KE434", "10-25~03-27"),
                    ("부산 ↔ 다낭", "PUS", "DAD", ALL, "10-25~11-30"),
                ],
            },
            {
                "cabin": "business", "booking_class": "O",
                "routes": [
                    ("인천 ↔ 호찌민", "ICN", "SGN", ALL, "10-25~11-30"),
                    ("인천 ↔ 세부", "ICN", "CEB", ALL, "10-25~12-16"),
                    ("인천 ↔ 카트만두", "ICN", "KTM", ALL, "10-25~12-31"),
                    ("인천 ↔ 다낭", "ICN", "DAD", "KE459, KE460", "10-25~12-31"),
                    ("인천 ↔ 나트랑", "ICN", "CXR", ALL, "10-25~12-31"),
                    ("인천 ↔ 마닐라", "ICN", "MNL", ALL, "10-25~01-31"),
                    ("인천 ↔ 하노이", "ICN", "HAN", ALL, "10-25~01-31"),
                    ("인천 ↔ 괌", "ICN", "GUM", ALL, "10-25~03-27"),
                    ("부산 ↔ 다낭", "PUS", "DAD", ALL, "10-25~11-30"),
                ],
            },
        ],
    },
    {
        "key": "north-america",
        "label": "한국 ↔ 북미",
        "discount": {"oneway": 5000, "round": 10000},
        "cabins": [
            {
                "cabin": "economy", "booking_class": "X",
                "routes": [
                    ("인천 ↔ 샌프란시스코", "ICN", "SFO", "KE023, KE024", "10-25~12-27"),
                    ("인천 ↔ 호놀룰루", "ICN", "HNL", "KE051, KE052", "10-26~03-27"),
                ],
            },
        ],
    },
    {
        "key": "europe",
        "label": "한국 ↔ 유럽/중동",
        "discount": {"oneway": 5000, "round": 10000},
        "cabins": [
            {
                "cabin": "economy", "booking_class": "X",
                "routes": [
                    ("인천 ↔ 밀라노/말펜사", "ICN", "MXP", "KE927, KE928", "10-25~03-27"),
                    ("인천 ↔ 이스탄불", "ICN", "IST", "KE955, KE956", "10-25~03-27"),
                    ("인천 ↔ 암스테르담", "ICN", "AMS", "KE925, KE926", "10-25~03-27"),
                    ("인천 ↔ 리스본", "ICN", "LIS", "KE921, KE922", "12-01~03-27"),
                ],
            },
        ],
    },
    {
        "key": "oceania",
        "label": "한국 ↔ 대양주",
        "discount": {"oneway": 5000, "round": 10000},
        "cabins": [
            {
                "cabin": "economy", "booking_class": "X",
                "routes": [
                    ("인천 ↔ 시드니", "ICN", "SYD", "KE401, KE402", "10-25~12-10"),
                ],
            },
        ],
    },
]

# 국내선 탭: 할인 1,000/2,000마일, 요일·시간 조건 표 (참고 보관, 국제선 서비스 범위 밖)
DOMESTIC = {
    "key": "domestic",
    "label": "한국 국내선",
    "discount": {"oneway": 1000, "round": 2000},
    "booking_class": "X",
    "conditions": [
        ("김포/청주-제주", "월/화/수/일", "15:00 이후"),
        ("제주-김포/청주", "화/수/목/금", "11:59 이전, 20:00 이후"),
        ("부산-제주", "월/화/수", "07:59 이전, 15:00 이후"),
        ("제주-부산", "화/수/목", "11:59 이전, 20:00 이후"),
        ("광주/대구-제주", "월/화/수/토/일", "13:00 이후"),
        ("제주-광주/대구", "화/수/목/금/토", "11:59 이전"),
        ("여수/진주/울산-제주", "월/화/수/목/토/일", "13:00 이후"),
        ("제주-여수/진주/울산", "월/화/수/목/금/토", "14:59 이전"),
        ("김포-부산", "월/화/수/토", "18:00 이후"),
        ("김포-부산", "일", "07:59 이전"),
        ("부산-김포", "화/수/목/일", "08:59 이전"),
        ("부산-김포", "월/화/수/목", "20:00 이후"),
        ("김포-울산", "화/수/목/금/토/일", "13시 이전"),
        ("김포-울산", "월/화/수/목/토", "13시 이후"),
        ("울산-김포", "월/화/수/목/금/일", "13시 이전"),
        ("울산-김포", "월/화/수", "13시 이후"),
    ],
}

MONTH_KO = {i: f"{i}월" for i in range(1, 13)}

NOTES = [
    "마일지도는 프레스티지석·일등석 전용입니다. 아래 할인은 프레스티지석(예약 등급 O) 노선만 해당합니다.",
    "대한항공 보너스 핫픽은 홈페이지·모바일 앱에서 보너스 항공권을 신규 구매할 때만 적용됩니다(예약 변경 시 적용되지 않음).",
    "공식 안내상 전체 출발 기간은 10월 25일 ~ 3월 27일이며, 12/23~1/4 과 2/4~3/2 는 제외 기간으로 표기되어 있습니다. 노선별 출발 기간은 이보다 짧을 수 있습니다.",
    "수요가 집중되는 항공편은 예약이 일찍 마감될 수 있습니다.",
    "할인 대상 노선·구매·출발 기간은 수시로 바뀌며, 예매 시점에 따라 할인 적용 여부가 달라질 수 있습니다. 실제 적용 여부는 대한항공 예매 화면의 초록색 할인 표시로 확인해야 합니다.",
    "예약 변경으로 할인 조건을 충족하지 못하면 마일리지가 추가 공제되고 재발행 수수료가 부과됩니다.",
    "대한항공 공식 핫픽 표에 일등석 할인은 없습니다.",
    "북미·유럽/중동·대양주는 프레스티지 핫픽 대상 노선이 없습니다.",
    "부산/김해(PUS) 출발·도착 노선은 마일지도 정책상 표시하지 않습니다(공식 표에는 부산↔칭다오·타이베이·다낭이 있음).",
]


def md_to_iso_range(rng):
    """'10-25~12-24' → (start ISO, end ISO, 표기). 연도는 구매 기간(2026-10~2027-03) 기준으로 정한다."""
    start_md, end_md = rng.split("~")
    sm, sd = (int(x) for x in start_md.split("-"))
    em, ed = (int(x) for x in end_md.split("-"))
    start_year = 2026 if sm >= 10 else 2027
    end_year = start_year if em >= sm else start_year + 1
    start = f"{start_year:04d}-{sm:02d}-{sd:02d}"
    end = f"{end_year:04d}-{em:02d}-{ed:02d}"
    label = f"{sm}/{sd}~{em}/{ed}"
    return start, end, label


def load_chart():
    data = json.loads(CHART.read_text(encoding="utf-8"))
    routes = {}
    for route in data.get("routes", []):
        routes[(route["o"], route["d"])] = route
    return routes


def main():
    chart = load_chart()
    regions = []
    index = []
    excluded_pus = []
    no_chart = []

    for region in RAW:
        region_out = {
            "key": region["key"],
            "label": region["label"],
            "discount": region["discount"],
            "cabins": [],
        }
        for cabin in region["cabins"]:
            # 마일지도는 프레스티지(P)·일등석(F) 전용이다. 일반석(X) 표는 수집만 보관하고 내보내지 않는다.
            if cabin["cabin"] != "business":
                continue
            cabin_out = {
                "cabin": cabin["cabin"],
                "booking_class": cabin["booking_class"],
                "routes": [],
            }
            for label, origin, destination, flights, rng in cabin["routes"]:
                start, end, range_label = md_to_iso_range(rng)
                flight_list = [] if flights == ALL else [f.strip() for f in flights.split(",")]
                entry = {
                    "label": label,
                    "origin": origin,
                    "destination": destination,
                    "flights": flight_list,
                    "all_flights": flights == ALL,
                    "period": {"start": start, "end": end, "label": range_label},
                }

                base = None
                record = chart.get((origin, destination)) or chart.get((destination, origin))
                if record:
                    values = (record.get("miles") or {}).get(CLASS_LETTER.get(cabin["booking_class"], cabin["booking_class"]))
                    if isinstance(values, list) and all(isinstance(v, int) for v in values):
                        base = {"offpeak": values[0], "peak": values[1]}

                entry["base_miles"] = base

                if base:
                    entry["discounted_miles"] = {
                        "offpeak": base["offpeak"] - region["discount"]["oneway"],
                        "peak": base["peak"] - region["discount"]["oneway"],
                    }
                else:
                    entry["discounted_miles"] = None
                    no_chart.append(f"{label} {cabin['booking_class']}")

                if origin == "PUS" or destination == "PUS":
                    excluded_pus.append(f"{label} ({cabin['cabin']})")
                    # 정책상 사이트 노선 목록에서 빠지므로 표시용 목록에는 넣지 않는다.
                    continue

                cabin_out["routes"].append(entry)

                # 양방향 조회용 인덱스
                index.append({
                    "o": origin,
                    "d": destination,
                    "cabin": cabin["cabin"],
                    "region": region["key"],
                    "discount_oneway": region["discount"]["oneway"],
                    "discount_round": region["discount"]["round"],
                    "flights": flight_list,
                    "period_start": start,
                    "period_end": end,
                })
                index.append({
                    "o": destination,
                    "d": origin,
                    "cabin": cabin["cabin"],
                    "region": region["key"],
                    "discount_oneway": region["discount"]["oneway"],
                    "discount_round": region["discount"]["round"],
                    "flights": flight_list,
                    "period_start": start,
                    "period_end": end,
                })

            region_out["cabins"].append(cabin_out)

        if not region_out["cabins"] or not region_out["cabins"][0]["routes"]:
            region_out["cabins"] = []
            region_out["note"] = "이 지역은 프레스티지 핫픽 대상 노선이 없습니다(대한항공 공식 표 기준)."
        regions.append(region_out)

    payload = {
        "schema_version": 1,
        "program": "KE_SKYPASS",
        "promotion": "보너스 핫픽",
        "source": {
            "url": SOURCE_URL,
            "label": "대한항공 보너스 항공권 > 보너스 핫픽",
            "verified_at": VERIFIED_AT,
            "method": "공식 페이지 7개 지역 탭(일본·중국/동북아·동/서남아·북미·유럽/중동·대양주·국내선) 전수 확인",
        },
        "purchase_period": {"start": "2026-10-25", "end": "2027-03-27", "label": PURCHASE_LABEL},
        "departure_window": {
            "start": "2026-10-25",
            "end": "2027-03-27",
            "label": DEPARTURE_LABEL,
            "excluded": EXCLUDED_MD,
        },
        "cabins": [
            {"key": "business", "letter": "P", "booking_class": "O", "name": "프레스티지석"},
            {"key": "first", "letter": "F", "booking_class": "", "name": "일등석"},
        ],
        "scope": "프레스티지석(P)·일등석(F) 전용 — 일반석(E·X) 수집·표시 제외",
        "first_note": "대한항공 공식 핫픽 표에는 일등석 할인이 없습니다.",
        "regions": regions,
        "domestic": {
            "key": DOMESTIC["key"],
            "label": DOMESTIC["label"],
            "discount": DOMESTIC["discount"],
            "booking_class": DOMESTIC["booking_class"],
            "conditions": [
                {"route": r, "weekdays": w, "time": t} for r, w, t in DOMESTIC["conditions"]
            ],
        },
        "index": index,
        "counts": {
            "route_cabin_entries": len(index) // 2,
            "directions": len(index),
            "region_total": len(regions),
        },
        "excluded_pus": excluded_pus,
        "notes": NOTES,
        "no_chart": no_chart,
    }

    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
    print(f"route/cabin entries: {len(index)//2} · directions: {len(index)} · PUS excluded: {len(excluded_pus)}")
    if no_chart:
        print("no chart value:", ", ".join(no_chart))


if __name__ == "__main__":
    main()
