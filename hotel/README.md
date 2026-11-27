# 힐튼포숙지도 (/hotel/)

힐튼 하이엔드(월도프 아스토리아 · 콘래드 · LXR) 포인트 숙박 조회 + 주말숙박권(Standard Room Reward, 금·토·일) 조회 웹앱.

👉 **수집 동선·403 회피·판독 코드·D1 연동 전체는 [docs/HILTON_HOTEL_COLLECTOR_GUIDE.md](../docs/HILTON_HOTEL_COLLECTOR_GUIDE.md)**
(실측 원본: [docs/hilton/measurement-2026-11-27.md](../docs/hilton/measurement-2026-11-27.md))

## 구성

```
hotel/
  index.html                 # 4개 탭: 포인트 숙박 조회 / 주말숙박권 조회 / 호텔 디렉터리 / 가이드
  og-hotel-illustrated.jpg   # OG 이미지 (1200×630)
  assets/hotel-app.css       # 퍼플 디자인 시스템 (#6d28d9 / #7c3aed / #f5f3ff)
  assets/hotel-api.js        # 데이터 접근 계층 (static ↔ live 전환점)
  assets/hotel-app.js        # 화면 로직 (조회·주말 판정·가치 계산기)
  data/hotels.json           # 119곳 영업 중 마스터 + 전수 관측 스냅샷 + 도시 목록 + 환율
  scripts/                   # 파이썬 원샷 수집기 + 마스터·앱 데이터 생성 + 브라우저 판독 스니펫 (아래)
functions/api/hotel/
  rates.js                   # GET /api/hotel/rates — D1 조회 Pages Function
  schema.sql                 # D1 테이블 (HOTEL_DB 바인딩)
```

## 데이터

- `data/hotels.json` 은 `scripts/build_hotel_data.py` 가
  `scripts/data/hotels_luxury.json`(124건 마스터 · 영업 중 119곳)과
  `scripts/data/observed_sample.json`(2026-11-27 디렉터리 관측 영업 중 119곳 전수 · 미관측 0)으로 만든다.
- 포인트·현금가는 힐튼 브랜드별 Locations 디렉터리의 **"향후 30일 최저"** 값이며 특정 날짜 요금이 아니다.
  앱은 이 점을 결과 화면에 명시하고, 날짜별 실제 값은 `공식 날짜 조회`(hilton.com `/book/`) 버튼으로 넘긴다.
- 힐튼 robots.txt 는 `/search/`·`/book/`·`/find-hotels/` 를 Disallow 한다. 디렉터리는 날짜 파라미터를 무시하고(항상 30일 최저)
  날짜를 고르면 `/en/search/` 로 넘어가므로, **날짜별(12월~2027년 2월) 요금은 수집하지 않는다.**
- 대신 디렉터리 탭의 `날짜 지정`(체크인·체크아웃·성인 + 12월/1월/2월 둘째 주말 원터치)으로 카드의
  `공식 날짜 조회`(`/book/…?ctyhocn=…&arrivalDate=…`)·`같은 도시 날짜 목록`(`/en/search/{brand}/?query=…&arrivalDate=…`)을
  사용자가 직접 연다. 화면에는 관측 창을 `향후 30일(2026.11.27~2026.12.27)`처럼 날짜로 표시한다.
  실측 근거: `docs/HILTON_HOTEL_COLLECTOR_GUIDE.md` 10절.

## 데이터 갱신 (파이썬만으로 — 권장)

`curl`·직링크·번들 Chromium·headless는 Akamai가 403으로 막는다. **실제 Chrome 세션**으로만 읽는다.
그 브라우저 조작까지 파이썬이 한다.

```bash
open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="$HOME/.hilton-chrome"
python3 hotel/scripts/collect_locations.py --attach http://127.0.0.1:9222 \
  --out hotel/scripts/data/observed_locations.json --merge-existing hotel/scripts/data/observed_sample.json
python3 hotel/scripts/build_hotel_data.py --observed hotel/scripts/data/observed_locations.json
```

`collect_locations.py` 가 하는 일: `/en/locations/{brand}/` 8페이지(Waldorf 3 + Conrad 3 + LXR 2)를
순회하며 `Select currency=KRW` → `Use Points` 토글 → 카드별 `포인트 · Standard/Premium 라벨 · Sold Out · 현금가`를 읽는다.
**403/429·차단 문구·카드 0장이면 그 자리에서 중단**하고 받은 페이지까지 저장한다(exit 3). 캡차는 우회하지 않는다.

사람이 콘솔에서 읽는 구버전 동선은 `scripts/README.md` 의 '브라우저 스니펫 실행법' 에 남아 있다
(`scripts/browser/locations_use_points.js`). 마스터는 `python3 scripts/build_luxury.py` 로 재생성한다.

자세한 판독 함정(1단계 포인트에는 Standard/Premium 라벨이 없음, 포인트 없는 호텔은 현금가가 남음 등)과
단건 날짜 조회 동선은 가이드 2~4절 참고.

## D1 실시간 조회로 전환 (**연결은 완료 · 지금은 `static` 유지**)

> 2026-11-27 기준: D1 `hotel-db`(UUID `fed061e3-2ce9-455b-bcb6-b6c754db183c`)가 생성돼
> Pages **Production·Preview** 양쪽에 `HOTEL_DB` 로 바인딩됐고, 스키마·시드 적재와 `/api/hotel/rates` HTTP 200 까지 확인했다.
> 프론트는 `mode: "static"` 그대로다(사용자 결정: 연결만 해두고 지금은 스냅샷 사용). 아래 3~4단계가 전환 시점의 일이다.

1. D1 생성 후 바인딩 이름 `HOTEL_DB` 로 Pages 프로젝트에 연결한다. *(완료)*
2. `wrangler d1 execute HOTEL_DB --file=functions/api/hotel/schema.sql --remote` *(완료)*
3. 수집된 레코드를 `hotel_rate_observations` 에 upsert 한다 (PK: 호텔·체크인·체크아웃·인원·객실수·reward_type).
   같은 날짜의 Standard/Premium은 **두 행**으로 저장한다.
4. `assets/hotel-api.js` 의 `HOTEL_API_CONFIG.mode` 를 `"live"` 로 바꾼다. 끝.

`/api/hotel/rates` 응답 스키마와 프론트 정규화 규칙은 `assets/hotel-api.js` 상단 주석에 있다.
바인딩이 없을 때 API는 `503 {"ok":false,"error":"database_unavailable"}` 을 돌려주고,
프론트는 static 스냅샷으로 그대로 동작한다(무중단). `observed_at`이 24시간을 넘은 레코드는 `STALE`로 강등된다.

## 판정 규칙

- `standardRewardAvailable` = `Standard Room Reward` 라벨이 있는 경우 → 주말숙박권 사용 가능.
  디렉터리 카드에도 라벨이 나오지만, 날짜별 정확한 판정은 **More Rates(2단계 Select a Rate)** 화면의 라벨로 한다.
- `premiumOnly` = `Premium Room Rewards` 만 있는 경우 → 숙박권 사용 불가.
- `excluded` = 올인클루시브 등 숙박권 제외 유형(현재 Conrad Tulum Riviera Maya `CUNCICI` · Waldorf Astoria Riviera Maya `CUNWAWA`). HGV 레지던스(`OGGHOWA`)는 주의 표시.
- 주말숙박권은 **금·토·일 체크인**만 조회한다(국내 제휴카드 기준. 힐튼 글로벌 규정은 2022년부터 요일 제한 없음).
  금·토·일이 아니면 조회를 막고 가장 가까운 주말을 안내한다.
