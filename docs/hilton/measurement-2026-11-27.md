# hilton.com 실측 기록 (2026-11-27, 비로그인)

프로젝트: 힐튼포숙지도 `/hotel/` 1단계 — 실사이트 조회·판독 가능성 실측
측정 시각: 2026-11-27 14:20~14:40 KST · 원격 브라우저(Chrome/Windows, exit KR) · **Hilton Honors 로그인 없음**
사용자 확정 사항(스티어링): **월별(Flexible Dates) 달력 조회는 기능에서 제외** → 날짜 지정 조회 3종(포인트·현금·Standard/Premium)만 검증

---

## 1. 결론 요약

| 항목 | 결과 | 근거 |
|---|---|---|
| ① 포인트 숙박가 | **판독 가능** — 객실별 "N Points per night" + **"Standard Room Reward" / "Premium Room Rewards" 라벨 동시 노출** | 콘래드 서울·콘래드 도쿄·WA 방콕 실측 |
| ② 세금 포함 현금가 | **판독 가능** — "Prices include all taxes and fees in ○○" 명시 + 요금제별 금액(Flexible·Honors·Advance Purchase·조식포함 등) 전부 나열 | 위 3개 호텔 |
| ③ 주말숙박권(Free Night Reward) 사용 가능 판정 | **가능** — 같은 날짜·같은 호텔에서 **Standard Room Reward가 열려 있으면 사용 가능, Premium만 있으면 불가**. 라벨이 화면 텍스트로 그대로 나오므로 판정 규칙을 그대로 적용할 수 있음 | 콘래드 서울(Standard 80,000) vs 콘래드 도쿄(Premium만 293,000) 대조 |
| 봇 차단 | **Akamai**. 서버·스크립트 직접 요청은 403. 브라우저는 "호텔 상세 → 예약 화면" 정상 동선으로 들어가면 통과 | 아래 4절 |
| robots.txt | `/book/`, `/find-hotels/`, `/search/` **Disallow(User-agent: \*)** — 요금 조회 경로가 여기 해당 | 아래 5절 |

---

## 2. 실측 표본 3곳 (동일 조건: 1박·1룸·성인 2)

### (1) 콘래드 서울 `SELCICI` — 2026-12-15(화)~16(수)
- URL: `https://www.hilton.com/en/book/reservation/rooms/?ctyhocn=SELCICI&arrivalDate=2026-12-15&departureDate=2026-12-16&redeemPts=true&room1NumAdults=2&displayCurrency=KRW`
- **포인트**
  - 1 King Bed Deluxe Room → **Standard Room Reward · 80,000 포인트/박**
  - 1 King Bed Premium Room City View → **Premium Room Rewards · 174,000 포인트/박**
  - (객실 목록의 다른 프리미엄 객실 181,000 / 188,000, 스위트 404,000·1,917,000 등)
- **현금(세금·수수료 포함, KRW)**: Flexible 638,000 / Honors 625,240 / Advance Purchase 577,071 / Honors AP 548,218 / Breakfast Included 715,000 …
- **포인트 가치(참고 계산)**: 638,000÷80,000 = **₩7.98/pt**, Honors AP 기준 548,218÷80,000 = ₩6.85/pt
- 스크린샷: `screens/hilton-selcici-standard-reward-rates-2026-11-27-142744.png`, `screens/hilton-selcici-premium-reward-rates-2026-11-27-142831.png`

### (2) 콘래드 도쿄 `TYOCICI` — 2026-12-15(화)~16(수)
- **포인트**: 최저 객실 Twin Room Bay View → **Premium Room Rewards · 293,000 포인트/박** (Standard Room Reward **없음**)
- **현금(세금 포함, JPY)**: Flexible 153,465 / Honors 138,159 / Breakfast Included …
- **의미**: 이 날짜에는 Standard가 없으므로 **주말숙박권 사용 불가**로 판정되는 케이스. 객실 목록의 "Pay with Points: 293,000"만 보고는 Standard/Premium을 알 수 없고, **More Rates로 들어가 라벨을 읽어야** 함(중요한 판독 함정).
- 스크린샷: `screens/hilton-tyocici-premium-only-2026-11-27-142912.png`

### (3) 월도프 아스토리아 방콕 `BKKWAWA` — 2026-12-19(토)~20(일) · 주말
- **포인트**: King Deluxe Room → **Standard Room Reward · 85,000 포인트/박**
- **현금(세금 포함, THB)**: Flexible 17,067 / Honors 15,703 / Advance Purchase 15,191 / Honors AP 14,432 / Breakfast Included 19,421 …
- **의미**: 주말 날짜에도 Standard가 열려 **숙박권 사용 가능**으로 판정.
- 스크린샷: `screens/hilton-bkkwawa-standard-weekend-2026-11-27-143250.png`

### 부가 확인 — 예약 불가 상태
- 월도프 아스토리아 리비에라 마야 `CUNWAWA` 2026-12-15: **"Sorry, we don't have any rooms available for those dates."** (2027-01 개관 예정 호텔)

---

## 3. 대량 조회에 유리한 경로 발견 (핵심)

`/en/locations/{brand}/` 목록 페이지에서 **"Use Points" 체크** → 호텔 카드마다
`From* NNN,000 Points/night` + **`Standard Room Reward` 또는 `Premium Room Rewards`** 라벨이 **한 페이지 20곳씩** 표시됨.

- 실측 예(LXR 1페이지, 2026-11-27):
  - ROKU KYOTO 140,000 Standard / Umana Bali 95,000 Standard / The Den Bengaluru 46,000 Standard / The Mangroves Abu Dhabi 70,000 Standard / Katara Hills Doha 150,000 Standard / The Plaza Doha 46,000 Standard / Maysan Doha 140,000 Standard / Imperial Hotel Gold Coast 44,000 Standard / Mango House Seychelles 120,000 Standard / Sax Paris 120,000 Standard / Oceana Santa Monica 105,000 Standard / Cameo Beverly Hills 90,000 Standard / Crockfords Las Vegas 110,000 Standard / Arizona Biltmore 90,000 Standard / Zemi Beach House 130,000 Standard
  - **Premium만**: Ka La'i Waikiki 222,000 / Beach Village at The Del 446,000 / Shore House at The Del 320,000
  - Sold Out: Susona Bodrum, Sandblu Santorini / 포인트 표기 없음(현금만): Gajoen Tokyo
- 주의: 이 숫자는 **"향후 30일 기준 최저"** (페이지에 명시: "*Points are based on current availability over the next 30 days…"). 특정 날짜 값이 아니다.
- 날짜 지정 일괄 조회는 이 화면에서 **"Where to?" 목적지 입력이 필수**라서, 목적지 단위 검색이 되어야 날짜별 값이 나온다(이번 실측에서는 날짜 선택 후 Update가 목적지 미입력으로 비활성 → 도시·국가 단위 검색 방식은 미검증).
- 브랜드별 목록 규모: Waldorf 3페이지(45곳) / Conrad 3페이지(58곳) / LXR 2페이지(21곳) → **8회 로드로 전 지점(124건) 포인트·라벨 스캔 가능**.

---

## 4. 봇 차단·레이트리밋 실측 (Akamai)

| 접근 | 결과 |
|---|---|
| `curl` http(s) `https://www.hilton.com/en/` | **403**, 본문은 "Hilton Page Reference Code"(Reference No. `27.a772cd17.…`) — Akamai 차단 페이지 |
| `curl` `/en/hotels/selcici-conrad-seoul/`, `/book/reservation/rooms/`, `/en/locations/...` | 모두 **403** |
| `curl` `POST /graphql/customer?operationName=…` | **403 JSON** `{"errors":[{"code":403,"message":"Forbidden","client-IP":"32.185.176.117"}]}` |
| `GET /graphql`, `/sitemap.xml` | 200이지만 본문 7바이트 "Success" 스텁(무의미) |
| `/robots.txt` | 200 정상 |
| 브라우저 **최초 진입**(홈 `/en/`, `/ko/`, `/book/...` 딥링크) | **403 "Something went wrong"**(Reference No.) — 세션·쿠키 없이 바로 예약 경로로 들어가면 막힘 |
| 브라우저 **정상 동선**: 호텔 상세(`/en/hotels/{code}/`) → "Check rooms & prices" → `/book/reservation/rooms/` → "Use Points & Money" → "More Rates" | **정상 동작**. 이후 15회 이상 연속 조회에도 차단·캡차 없음 |
| 쿠키 배너 | 최초 1회 "Reject All Cookies" / "Confirm My Choices" 처리 필요 |

**안전한 진입 순서(실측 결론)**
1. `https://www.hilton.com/en/hotels/{7자리코드}/` 로 진입(쿠키 확보) → 2. 페이지 내 "Check rooms & prices"로 예약 화면 이동(또는 쿠키 확보 후 `.../book/reservation/rooms/?ctyhocn=…&arrivalDate=…&departureDate=…&redeemPts=true&room1NumAdults=2` 직접 이동) → 3. "Use Points & Money" 체크 → 4. 객실별 "More Rates"에서 라벨 판독
- 요청 간격은 초 단위로 몰아치지 않고 위 동선대로 1~3초 간격이면 안정적. 캡차는 한 번도 나오지 않음(정상 동선 기준).
- **서버사이드 자동 수집은 이 환경에서 불가**(403). 자동화하려면 실제 브라우저 세션(쿠키·Akamai 센서)이 필요하다.

---

## 5. robots.txt / 약관 리스크 (설계 판단 필요)

`https://www.hilton.com/robots.txt` (2026-11-27 확인):

```
User-agent: *
Disallow: /search/
Disallow: /book/
Disallow: /find-hotels/
Disallow: /guest/
Disallow: /auth/
Disallow: /confirmation/
Disallow: /personalized/
...
```

- 요금·포인트가 나오는 화면(`/book/...`)이 **명시적 수집 금지 경로**다. `/locations/...`(브랜드 디렉터리·Use Points 목록)는 Disallow 목록에 없음.
- 즉 ① 브랜드 디렉터리 기반 목록/요약(포인트·Standard/Premium 라벨)은 robots상 허용 경로이고, ② 날짜별 상세 요금(`/book/`)은 금지 경로다.
- Hilton 사이트 이용약관(Site Usage Agreement)도 자동 수집을 제한하는 조항을 두는 것이 통상적이므로, **서비스 형태(대량 자동 수집 vs 수동 관측/제휴)** 는 사용자·주 에이전트 판단 필요.
- 참고: 기존 `staypoint-v3` 코드는 힐튼 실시간 수집을 **`AUTHORIZED_SOURCE_REQUIRED`로 비활성**(`DisabledHiltonProvider`)하고 수동 관측(`MANUAL`)만 허용하도록 설계돼 있다. 이번 실측은 그 판단의 근거(403 차단 + robots Disallow)를 확인해 준다.

---

## 6. 주말숙박권(Free Night Reward) 판정 규칙 — 확인된 사실

- 힐튼 규정상 Free Night Reward는 **Standard Room Reward에만** 사용 가능, **Premium Room Reward에는 사용 불가**.
- 과거 "주말 전용" 제한은 2022년에 폐지되어 **요일 제한 없이** 사용 가능(모든 요일). 사용자가 말하는 "주말숙박권"과 실제 규정이 다르므로 UI 문구에 주의.
- 힐튼은 호텔별로 "표준 객실" 정의가 달라 **호텔마다 Standard로 잡히는 객실이 다르다**(같은 호텔에서도 객실 등급별로 라벨이 갈림 — 콘래드 서울 실측에서 확인).
- **제외 호텔 약 60곳**(Hilton Grand Vacations, 올인클루시브·일부 distinctive properties 등)은 Standard가 있어도 사용 불가 → 우리 라인업에서는 올인클루시브(WA 리비에라 마야, 콘래드 툴룸) 등 별도 제외 플래그 필요.

---

## 7. 판독 구현 메모 (다음 단계 설계용)

- 포인트·현금·라벨은 모두 **서버 렌더 HTML의 접근성 텍스트**로 읽힌다(별도 API 파싱 불필요).
  - 객실 목록: `Pay with Points: {{n}} per night` (라벨 없음)
  - 요금 상세: `Standard Room Reward` / `Premium Room Rewards` + `{{n}} Points per night`
  - 현금: `Prices include all taxes and fees in {{currency}}` 문구 + 요금제명/금액 쌍
- 사이트는 Next.js + Apollo(`/graphql/customer`, operation `getShopAvail`·`getRoomRates`)로 동작하며 `__NEXT_DATA__`에 라벨 문자열(`rewardTypes.standard/premium`)이 들어 있다.
- 판정 로직 제안: `standardRewardAvailable = exists(room where rewardLabel=="Standard Room Reward")` → true면 숙박권 사용 가능, Premium만 있으면 불가, 아무 포인트도 없으면 "포인트 재고 없음".

---

## 8. 재검증 추가 기록 (2026-11-27 15:15~15:35 KST, 같은 날 두 번째 세션)

문서화용으로 같은 동선을 다시 돌려 확인한 내용. 위 1~7절을 뒤집는 내용은 없고, 아래가 새로 확인된 사실이다.

### 8-1. 디렉터리 판독의 안정적인 키

- 카드 컨테이너가 `<li data-testid="hotel-card-ITMOLOL">` — **7자리 코드가 data-testid 에 그대로** 들어 있다.
  링크 href 는 슬러그(`https://www.hilton.com/en/hotels/itmolol-roku-kyoto/`)뿐이라, 코드는 testid 에서 읽는 것이 맞다.
- `li[data-testid^="hotel-card-"]` 20장 판독 결과가 기존 관측과 일치
  (ROKU KYOTO 140,000 Standard / Umana Bali 95,000 / Ka La'i 222,000 Premium / Beach Village 446,000 Premium /
  Shore House 320,000 Premium / Susona·Sandblu Sold Out / Gajoen 포인트 없음).

### 8-2. 포인트 모드와 현금 모드는 배타적

- `Use Points` 를 켜면 카드의 가격 자리가 포인트로 바뀌고 **현금 표기가 사라진다.** 둘을 한 번에 읽을 수 없다.
  → 같은 페이지에서 토글 2회(현금 1회 → 포인트 1회)로 읽는다. 재로드 불필요.
- 예외: 포인트 재고가 없는 호텔은 포인트 모드에서도 현금가가 남는다(Gajoen Tokyo `¥96,991`).
  따라서 "포인트 표기 없음"과 "현금만 있는 호텔"을 구분해야 한다.

### 8-3. 통화를 KRW로 바꾸면 원화로 바로 읽힌다

- 디렉터리 상단 `Select currency` → `KRW - South Korean Won` 선택 시 카드 현금가가 `₩` 로 표시된다.
  환율표로 곱하지 않고 원화값을 얻을 수 있다(현금 기준: LXR 카드들이 ¥ → ₩ 로 전환됨).
- 요금 화면에서도 통화 선택이 그대로 유지되고 `Prices include all taxes and fees in South Korean Won.` 로 표시된다.

### 8-4. 단건 동선 재확인 (콘래드 서울 `SELCICI`)

- `/en/hotels/selcici-conrad-seoul/` 200 → `Check rooms & prices` → 새 탭 `/book/reservation/rooms/?…` 정상 로드.
- **딥링크 날짜 반영 조건**: 세션에 "Your stay" 문맥이 없는 탭에서는 쿼리 날짜가 그대로 적용됐고
  (2026-12-15~16·성인 2), 호텔 페이지에서 이미 날짜를 잡은 세션의 탭에서는 그 stay(11-27~28·성인 1)로 덮어썼다.
- `/rates/` 화면 URL은 `ctyhocn` 쿼리를 잃는다 → 호텔 코드는 1단계 URL·마스터에서 가져와 붙인다.
- 2026-12-15~16·성인 2 재현값: 16 rooms / `Pay with Points: 80,000`(Deluxe) · Premium 객실 174,000·181,000·188,000 /
  Rates 화면 `Standard Room Reward 80,000 Points per night`, `Sign in to pay with Points`,
  Flexible ₩638,000 · Honors ₩625,240 · Advance ₩577,071 · **Honors AP ₩548,218** · 조식 포함 4종 ₩715,000~₩621,368 · Sweeten ₩669,900
  → 문서의 1포인트 가치 ₩7.98(638,000/80,000), ₩6.85(548,218/80,000) **재현 확인**.

### 8-5. 판독 스니펫

이번 재검증에 쓴 읽기 전용 스니펫 3개를 저장소에 넣었다.
`hotel/scripts/browser/locations_use_points.js` · `rooms_page.js` · `rates_page.js`
(2026-11-27 15:2x~15:3x 각각 실페이지에서 실행해 20장·16객실·요금 9건 판독 확인).
