# hotel/scripts — 힐튼포숙지도 데이터 생성·판독 도구

힐튼포숙지도(`/hotel/`)의 데이터는 **비로그인 브라우저로 hilton.com 공개 화면을 사람 동선으로 읽어** 만든다.
`curl`·스크립트 직접 요청은 Akamai가 403으로 막는다. 자세한 배경·판독 함정·D1 연동은
[`docs/HILTON_HOTEL_COLLECTOR_GUIDE.md`](../../docs/HILTON_HOTEL_COLLECTOR_GUIDE.md) 참고.

## 구성

```
scripts/
  build_luxury.py               마스터 124건(영업 중 119) 생성 — 브랜드 디렉터리 실측 목록(RAW 테이블)
  build_hotel_data.py           관측 119곳 + 마스터 → hotel/data/hotels.json (앱 데이터)
  data/
    hotels_luxury.json          마스터(코드·이름·브랜드·도시·국가·권역·상태)
    observed_sample.json        디렉터리 관측 영업 중 119곳 전수(포인트·Standard/Premium·현금·통화)
    hotels_points_summary.json  관측 요약(감사용, build_hotel_data.py가 함께 갱신)
  browser/
    locations_use_points.js     /en/locations/{brand}/ 카드 20장 판독 (포인트/라벨/현금)
    rooms_page.js               /book/reservation/rooms/ 객실별 포인트·Quick Book·More Rates
    rates_page.js               /book/reservation/rates/ Standard/Premium 라벨·현금·원/P
```

## 빌드

```bash
python3 hotel/scripts/build_luxury.py      # → scripts/data/hotels_luxury.json
python3 hotel/scripts/build_hotel_data.py  # → hotel/data/hotels.json
```

`build_hotel_data.py`는 이름을 정규화(`&`/`and`·브랜드 접미사·콤마 제거)해 마스터와 관측 레코드를 잇고,
`rewardType → status`, 통화 → 원화(`FX` 표), `valuePerPoint = cashKrw / points`, 도시 집계,
제외/주의 플래그를 계산한다. 현재 `hotel/data/hotels.json`은 이 두 스크립트의 출력과 동일하다.

## 브라우저 스니펫 실행법

스니펫은 **읽기 전용**이다. 클릭·입력은 사람이 직접 한다(체크박스·통화 선택).

1. 크롬(또는 원격 브라우저)에서 hilton.com을 연다. 쿠키 배너는 `Reject All Cookies` → `Confirm My Choices`.
2. **디렉터리(요약)**: `/en/locations/lxr-hotels/` 등 → `Use Points` 체크 → DevTools 콘솔에
   `locations_use_points.js` 붙여넣기 → `copy(JSON.stringify(window.HILTON_LOCATION_ROWS, null, 1))`
   - 현금가도 필요하면 `Use Points`를 해제하고 같은 스니펫을 한 번 더 실행한다(카드 가격 자리가 배타적).
   - `Select currency`를 `KRW - South Korean Won`으로 두면 현금가가 원화로 나온다.
3. **날짜별 단건**: `/en/hotels/{코드}/` → Check rooms & prices → `Use Points & Money` 체크
   → `rooms_page.js` (객실별 포인트) → 한 객실 `More Rates` → `rates_page.js` (Standard/Premium 라벨)

판정: `Standard Room Reward`가 있으면 숙박권 사용 가능, `Premium Room Rewards`만 있으면 불가,
라벨이 없으면 그 날짜 포인트 재고 없음.

## 하지 않는 것

- `/book/` 경로의 대량 자동 수집 (robots.txt `Disallow`, 403). 사람이 한 건씩 확인하는 조회만.
- 힐튼 계정 로그인 (전부 비로그인 공개 화면 기준).
