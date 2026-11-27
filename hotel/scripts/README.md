# hotel/scripts — 힐튼포숙지도 데이터 생성·수집 도구

힐튼포숙지도(`/hotel/`)의 데이터는 **비로그인 브라우저로 hilton.com 공개 화면을 읽어** 만든다.
`curl`·직링크·번들 Chromium·headless는 Akamai가 403(`Hilton Page Reference Code`)으로 막는다.
자세한 배경·판독 함정·D1 연동은 [`docs/HILTON_HOTEL_COLLECTOR_GUIDE.md`](../../docs/HILTON_HOTEL_COLLECTOR_GUIDE.md) 참고.

## 구성

```
scripts/
  collect_locations.py          ★ 파이썬 원샷 수집기 — /en/locations/ 8페이지 자동 순회
                                  (Select currency=KRW · Use Points 토글 · 403/캡차 즉시 중단)
  test_collect_locations.py     가짜 디렉터리 HTML로 수집 동작 검증(실제 Chromium 필요)
  build_luxury.py               마스터 124건(영업 중 119) 생성 — 브랜드 디렉터리 실측 목록(RAW 테이블)
  build_hotel_data.py           관측 JSON + 마스터 → hotel/data/hotels.json (앱 데이터)
  data/
    hotels_luxury.json          마스터(코드·이름·브랜드·도시·국가·권역·상태)
    observed_sample.json        디렉터리 관측 영업 중 119곳 전수(포인트·Standard/Premium·현금·통화)
    observed_locations.json     collect_locations.py 출력(생성물, 필요할 때 커밋)
    hotels_points_summary.json  관측 요약(감사용, build_hotel_data.py가 함께 갱신)
  browser/
    locations_use_points.js     /en/locations/{brand}/ 카드 20장 판독 (사람이 콘솔에서 실행하는 버전)
    rooms_page.js               /book/reservation/rooms/ 객실별 포인트·Quick Book·More Rates
    rates_page.js               /book/reservation/rates/ Standard/Premium 라벨·현금·원/P
```

## 파이썬만으로 끝까지 (권장 · 2026-11-27 추가)

```bash
# 0) 실제 Chrome을 CDP로 띄운다 (headed · 이 세션의 쿠키·Akamai 센서를 그대로 쓴다)
open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="$HOME/.hilton-chrome"

# 1) 오프라인 자기검증 (브라우저·네트워크 불필요)
python3 hotel/scripts/collect_locations.py --self-test

# 2) 8페이지 수집 (Waldorf 3 + Conrad 3 + LXR 2) — 페이지당 1회 로드 · 2~3초 간격
python3 hotel/scripts/collect_locations.py --attach http://127.0.0.1:9222 \
  --out hotel/scripts/data/observed_locations.json \
  --merge-existing hotel/scripts/data/observed_sample.json

# 3) 앱 데이터 빌드 (파이썬만)
python3 hotel/scripts/build_hotel_data.py --observed hotel/scripts/data/observed_locations.json

# 4) 확인 — 영업 중 119 · Standard 104 · 미관측 0
python3 -c "import json;d=json.load(open('hotel/data/hotels.json'));print(d['meta']['counts'],len(d['hotels']),len(d['cities']))"
```

- `--launch` 를 주면 스크립트가 직접 실제 Chrome(`channel="chrome"`, headed)을 띄우고 쿠키 배너를 자동 처리한다.
- `--brands waldorf-astoria conrad-hotels lxr-hotels` / `--max-pages 3` / `--sleep 3` 로 범위·간격을 조절한다.
- 결과 JSON은 `observed_sample.json` 과 같은 레코드 모양이라 `--merge-existing` 으로 **이번에 못 읽은 호텔을 유지**한다.

### 중단 규칙 (여기서 멈추는 것이 정답)

| 감지 | 행동 |
|---|---|
| 문서 응답 401/403/429 | 즉시 중단 · 받은 페이지까지 저장 · exit 3 |
| `Something went wrong` · `Reference No.` · `Access Denied` · `Pardon Our Interruption` · 캡차 문구 | 즉시 중단(`BLOCKED_PAGE`) |
| 카드 0장 | 그 페이지에서 중단(`PAGE_EMPTY`) |

중단 뒤 재시도 금지 → 45~60분 뒤 새 세션으로 1페이지만 시험. **캡차는 우회하지 않고 사람에게 넘긴다.**

### 수집기가 지키는 판독 규칙

1. 카드 코드는 `li[data-testid="hotel-card-XXXXXXX"]` 에서 읽는다(슬러그가 바뀌어도 안정적).
2. 포인트 모드의 `From* 140,000 / Points/night` 는 **현금가가 아니다** — 뒤에 `Points/night` 가 오는 `From*` 는 건너뛴다.
3. `Standard Room Reward` / `Premium Room Rewards` 텍스트만 등급 근거다. 라벨이 없으면 그 카드는 **저장하지 않는다**(추정 금지).
4. `Sold Out` → `SOLD_OUT`, 포인트 없이 금액만 → `NO_POINTS`.
5. 통화는 화면의 `Prices include all taxes and fees in …` 문구를 우선하고, 없으면 금액 기호로 판별한다.

`--self-test` 가 위 규칙을 오프라인으로 검증하고, `test_collect_locations.py` 가
**현금 판독 → Use Points 토글 → 포인트 판독 → 다음 페이지 → 병합 → 파싱**을 실제 Chromium으로 확인한다.

## 빌드

```bash
python3 hotel/scripts/build_luxury.py      # → scripts/data/hotels_luxury.json
python3 hotel/scripts/build_hotel_data.py  # → hotel/data/hotels.json
python3 hotel/scripts/build_hotel_data.py --observed scripts/data/observed_locations.json  # 새 관측으로 빌드
```

`build_hotel_data.py`는 이름을 정규화(`&`/`and`·브랜드 접미사·콤마 제거)해 마스터와 관측 레코드를 잇고,
`rewardType → status`, 통화 → 원화(`FX` 표), `valuePerPoint = cashKrw / points`, 도시 집계,
제외/주의 플래그를 계산한다. 현재 `hotel/data/hotels.json`은 이 두 스크립트의 출력과 동일하다
(단, `meta.generatedAt` 은 빌드 시각으로 갱신된다).

## 브라우저 스니펫 실행법 (사람이 콘솔에서 할 때)

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
- 캡차·Akamai 챌린지 우회(프록시 회전·헤드리스 위장 등). 막히면 멈추고 사람에게 넘긴다.
