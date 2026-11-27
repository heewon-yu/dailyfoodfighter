# 힐튼포숙지도 수집 가이드 — 403 없이 hilton.com에서 포인트·숙박권을 읽어 오는 실제 동선과 코드

`dailyfoodfighter.com/hotel/`(힐튼포숙지도)의 데이터가 어떻게 만들어졌는지, 그리고 나중에 D1 실시간 조회로 넘어갈 때 무엇을 어떤 규격으로 넣으면 되는지를 한 문서로 정리한 인계서다.

- 대상 호텔: **Waldorf Astoria · Conrad · LXR**(힐튼 하이엔드 3브랜드) 디렉터리 124건 = 영업 중 **119곳**
- 수집 방식: **비로그인 브라우저 사람 동선**. 서버·스크립트 직접 요청은 Akamai가 403으로 막는다(2절).
- 현재 배포 데이터: 디렉터리에서 판독한 **영업 중 119곳 전수** 스냅샷(2026-11-27 14:41·15:39 KST · 미관측 0) + 마스터 119곳
- 검증 기록: [`docs/hilton/measurement-2026-11-27.md`](hilton/measurement-2026-11-27.md) · 스크린샷 [`docs/hilton/screens/`](hilton/screens/)
- 코드: [`hotel/scripts/`](../hotel/scripts/) (빌드 2개 + 브라우저 판독 스니펫 3개)

---

## 0. 한눈에

| 항목 | 결론 |
|---|---|
| `curl`/직링크 | **403** — 본문 `Hilton Page Reference Code`, `/graphql/customer`는 `{"errors":[{"code":403,"message":"Forbidden"}]}` |
| 브라우저 최초 진입(홈·예약 딥링크 직행) | **403** `Something went wrong`(Reference No.) — 세션·쿠키 없이 `/book/`로 바로 들어가면 막힘 |
| 브랜드 디렉터리 `/en/locations/{brand}/` | **정상**. `Use Points` 체크만 하면 카드마다 `포인트 + Standard/Premium 라벨`이 그대로 나온다 |
| 호텔 상세 `/en/hotels/{7자리코드}/` → Check rooms & prices → Use Points & Money → More Rates | **정상**. 캡차 없이 15회 이상 연속 조회 가능 |
| 확보 규모 | 3개 디렉터리 **8페이지 로드 = 124건**(WA 3p · Conrad 3p · LXR 2p) → 영업 중 **119곳 전수**. 1차는 4페이지 80곳, 2차에서 잔여 4페이지 44장을 더 읽었다 |
| 주말숙박권 판정 | **More Rates(2단계) 안의 `Standard Room Reward` / `Premium Room Rewards` 텍스트**만이 정답. 1단계 객실 목록의 포인트 숫자로는 구분 불가 |
| robots.txt | `/book/`·`/find-hotels/`·`/search/` **Disallow(User-agent: \*)**, `/locations/`·`/en/hotels/`는 허용 |
| 현재 운영 결정 | **안전형** — 디렉터리(허용 경로) 요약 + 날짜 지정은 공식 링크/사람 조회. `/book/` **대량 자동 수집 금지** |

---

## 1. 왜 403인가 (Akamai)

hilton.com은 Akamai 봇 관리 뒤에 있다. 같은 URL이라도 **누가 어떤 상태로 요청했는지**로 갈린다.

| 접근 | 결과 (2026-11-27 실측) |
|---|---|
| `curl https://www.hilton.com/en/` | 403 — HTML 본문 `Hilton Page Reference Code` (Ref. `27.a772cd17.…`) |
| `curl /en/hotels/selcici-conrad-seoul/` · `/book/reservation/rooms/` · `/en/locations/…` | 모두 403 |
| `curl -X POST /graphql/customer` | 403 JSON `{"errors":[{"code":403,"message":"Forbidden","client-IP":"32.185.176.117"}]}` |
| `curl /graphql` · `/sitemap.xml` | 200이지만 본문 7바이트 `Success` 스텁(내용 없음) |
| `curl /robots.txt` | 200 정상 |
| 브라우저로 홈·예약 딥링크 **첫 진입** | 403 `Something went wrong`(Reference No.) |
| 브라우저로 **호텔 상세 → 예약 화면** 동선 | 정상, 15회 이상 연속 조회에도 차단·캡차 없음 |
| 쿠키 배너 | 최초 1회 `Reject All Cookies` → `Confirm My Choices` 처리 필요 |

**원인 정리**
1. Akamai 센서(쿠키·JS 챌린지·헤더 지문)를 통과한 브라우저 세션만 통과한다. `curl`은 서명이 없어 즉시 차단.
2. 쿠키가 없는 세션에서 `/book/…`으로 **직행**하면 "예약 흐름을 시작한 적 없는 손님"으로 보고 차단한다. 호텔 페이지에서 출발해 쿠키를 받은 뒤 이동하면 통과한다.
3. GraphQL(`/graphql/customer`, operation `getShopAvail`·`getRoomRates`) 직접 호출도 같은 이유로 403.

> 결론: **서버사이드 자동 수집은 이 구조에서 불가능**하다. 자동화하려면 실제 브라우저 세션(쿠키 + Akamai 센서)이 필요하고, 그건 사람 동선을 흉내 내는 것이므로 아래 4절의 수집 범위 제한(허용 경로만)과 함께 판단해야 한다.

---

## 2. 403 없이 가져오는 두 동선

### 2-1. 대량(요약) — 브랜드 디렉터리 + `Use Points`

디렉터리 URL(robots 허용 경로):

```
https://www.hilton.com/en/locations/waldorf-astoria/
https://www.hilton.com/en/locations/conrad-hotels/
https://www.hilton.com/en/locations/lxr-hotels/
```

절차(사람이 직접 하는 조작):

1. 위 URL을 연다. 최초 1회 쿠키 배너를 처리한다(`Reject All Cookies` → `Confirm My Choices`).
2. 상단 **`Use Points` 체크박스**를 켠다. → 카드마다 `From* 140,000 Points/night` + **`Standard Room Reward` 또는 `Premium Room Rewards`** 라벨이 붙는다.
3. 페이지당 **20곳**. 페이지 이동은 하단 페이지네이션. 브랜드별 규모: **Waldorf 45(3p) · Conrad 58(3p) · LXR 21(2p) = 124건 / 8페이지**.
4. DevTools 콘솔에 [`hotel/scripts/browser/locations_use_points.js`](../hotel/scripts/browser/locations_use_points.js)를 붙여 판독 결과를 JSON으로 복사한다.

실측 결과(2026-11-27):

- 1차 **4페이지(80장)로 80곳**, 2차 잔여 **4페이지(44장)** 판독 → 디렉터리 124건 전수 확인. 영업 중 **119곳 전부 관측**(미관측 0)
- 1차 80곳 집계는 **Standard 68 · Premium만 7 · Sold Out 2 · 포인트 없음(현금만) 1 · 개관예정 2**. 2차까지 합친 현재 집계는 **Standard 104 · Premium만 11 · Sold Out 3 · 포인트 없음 1**(개관예정·레지던스 제외)
- Premium만 있는 곳: Waldorf Shanghai on the Bund 298,000 / Ho'olei 606,000 / Conrad Shenzhen 127,000 / Conrad Altay Hemu 204,000 / Ka La'i Waikiki 222,000 / Beach Village at The Del 446,000 / Shore House at The Del 320,000
- Sold Out: Susona Bodrum, Sandblu Santorini / 현금만: Gajoen Tokyo / 개관예정: Conrad Bangkok Sukhumvit Queen's Park, Conrad Kuala Lumpur

**주의: 이 값은 "향후 30일 현재 재고 기준 최저"**다. 페이지에 `*Points are based on current availability over the next 30 days…`라고 명시돼 있고, **특정 날짜의 값이 아니다**. 그래서 앱 카드에도 `향후 30일 최저`라고 쓰고, 날짜별 실제 값은 `공식 날짜 조회`로 넘긴다.

### 2-2. 단건(날짜 지정) — 호텔 상세 → Check rooms & prices → More Rates

```
1) https://www.hilton.com/en/hotels/{7자리코드}/          ← 여기서 쿠키를 받는 것이 핵심
2) 체크인/체크아웃·인원 지정 → "Check rooms & prices"      ← /book/reservation/rooms/ 로 이동
3) "Use Points & Money" 체크                              ← 객실마다 "Pay with Points: N per night" 표시
4) 한 객실의 "More Rates"                                 ← /book/reservation/rates/ (Step 2 of 3 Select a Rate)
5) "Points & Money" 칸의 "Standard Room Reward / Premium Room Rewards" + "N Points per night" 판독
```

URL 패턴(코드만 알면 슬러그는 몰라도 된다 — `/en/hotels/{code}/`가 정식 슬러그로 302된다):

```
https://www.hilton.com/en/hotels/{code}/
https://www.hilton.com/en/book/reservation/rooms/?ctyhocn={CODE}&arrivalDate=YYYY-MM-DD&departureDate=YYYY-MM-DD&redeemPts=true&room1NumAdults=2&displayCurrency=KRW
```

실측(콘래드 서울 `SELCICI`, 2026-12-15~16, 성인 2):

| 항목 | 값 |
|---|---|
| 포인트 | 1 King Bed Deluxe **Standard Room Reward · 80,000** / Premium 객실 174,000·181,000·188,000 |
| 현금(세금 포함, KRW) | Flexible 638,000 / Honors 625,240 / Advance 577,071 / Honors AP **548,218** / Breakfast 715,000 / Honors 조식 702,240 / AP 조식 654,071 / Honors AP 조식 621,368 / Sweeten 669,900 |
| 1포인트 가치 | 638,000÷80,000 = **₩7.98** · Honors AP 기준 548,218÷80,000 = **₩6.85** |
| 화면 문구 | `Prices include all taxes and fees in South Korean Won.` · `Sign in to pay with Points`(비로그인) |

대조 케이스(같은 날짜, 다른 호텔): 콘래드 도쿄 `TYOCICI`는 **Premium Room Rewards 293,000만** 있고 Standard가 없다 → **숙박권 사용 불가**. 월도프 아스토리아 방콕 `BKKWAWA` 2026-12-19(토)~20(일)은 주말인데도 **Standard 85,000** → 사용 가능.

### 2-3. 동선을 지키는 규칙

- **쿠키 배너를 먼저** 처리한다. 배너가 떠 있으면 체크박스 클릭이 먹히지 않는 경우가 있다.
- 페이지 전환은 **1~3초 간격**으로. 초 단위로 몰아치지 않는다(정상 동선 기준 캡차는 한 번도 나오지 않았다).
- **같은 세션 유지**. 새 탭/새 프로필에서 `/book/`으로 직행하면 다시 403이다.
- 예약 화면(`/book/…`) 딥링크는 **세션에 "Your stay" 문맥이 없을 때만** 쿼리의 날짜를 그대로 쓴다. 호텔 페이지에서 이미 날짜를 잡은 세션이면 그 stay로 덮어쓴다(2026-11-27 관측) → 날짜를 바꾸려면 `Edit stay`를 쓰거나 새 세션에서 호텔 페이지부터.
- 현금가를 원화로 보려면 **`Select currency` → `KRW - South Korean Won`**. 그러면 환율표 없이 원화 금액이 그대로 나온다(2026-11-27 확인).

---

## 3. 판독 함정

| # | 함정 | 정확한 처리 |
|---|---|---|
| 1 | **1단계 객실 목록의 포인트에는 라벨이 없다** — Deluxe 80,000과 Premium 객실 174,000이 똑같이 `Pay with Points: N per night`로만 보인다 | 객실별로 **More Rates → 2단계**로 들어가 `Standard Room Reward` / `Premium Room Rewards` 텍스트를 읽는다 |
| 2 | 디렉터리 카드는 **포인트 모드와 현금 모드가 배타적** — `Use Points`를 켜면 가격 자리가 포인트로 바뀌고 현금이 사라진다 | 같은 페이지에서 **토글 2회**(현금 1회 판독 → Use Points 켜고 포인트 1회 판독). 재로드 불필요 |
| 3 | 포인트 재고가 없는 호텔은 포인트 모드에서도 **현금가가 남는다**(Gajoen Tokyo `¥96,991`) | `Points/night`가 없는데 금액이 있으면 **"포인트 없음(현금만)"**, `Sold Out` 문구가 있으면 **재고 없음**으로 구분 |
| 4 | Sold Out은 카드 안 **별도 문단** | `Sold Out` 존재 + 포인트 없음 → `SOLD_OUT` |
| 5 | 세금 포함 여부 | 요금 화면의 `Prices include all taxes and fees in {통화}.` 문구를 **taxIncluded 플래그**로 저장. 이 문구가 없는 화면은 세금 포함으로 단정하지 않는다 |
| 6 | "From*" 최저가는 **가장 싼 요금제**(예: Honors AP)이고, `Flexible`은 더 비싸다 | 계산기에서는 사용자가 실제로 낼 요금제를 넣는다. 앱 카드의 `최저 현금가`는 최저 요금제 기준임을 표시 |
| 7 | 디렉터리 값은 **향후 30일 최저**, 날짜 지정 값이 아니다 | 문구를 그대로 노출하고 날짜 조회로 유도(`observedBasis` 필드) |
| 8 | **호텔 코드** — 디렉터리 카드의 링크 href는 슬러그(`/en/hotels/itmolol-roku-kyoto/`)이고, 코드는 카드 컨테이너에 있다 | `li[data-testid="hotel-card-ITMOLOL"]` → `data-testid`에서 7자리 코드. 요금 화면(`/rates/`)은 `ctyhocn` 쿼리를 잃으므로 코드는 1단계 URL/마스터에서 가져와 붙인다 |
| 9 | 이름 표기 차이 — `&`/`and`, 콤마, 브랜드 접미사 | `build_hotel_data.py`의 `norm()`으로 정규화 후 `(브랜드, 이름)` 매칭, 실패 시 prefix 매칭 |
| 10 | 비로그인 상태 | 포인트·현금·라벨은 다 보이지만 예약은 `Sign in to pay with Points` → 화면에 `signInRequired`로 남긴다 |
| 11 | 제외 유형 | HGV(휴가지 소유)·올인클루시브(Conrad Tulum, WA Riviera Maya)는 Standard가 있어도 숙박권 사용 불가 → 마스터에 `excluded`/`caution` 플래그 |

---

## 4. 실제 작동 코드

### 4-1. 디렉터리 판독 — `hotel/scripts/browser/locations_use_points.js`

핵심은 두 가지다: 카드 컨테이너의 `data-testid`에서 코드를, 카드 텍스트 줄에서 포인트·라벨을 읽는다.

```js
const CARD = 'li[data-testid^="hotel-card-"]';

const rows = [...document.querySelectorAll(CARD)].map((li) => {
  const code = li.getAttribute('data-testid').replace('hotel-card-', '').toUpperCase();
  const link = li.querySelector('a[href*="/en/hotels/"]');
  const lines = li.innerText.split('\n').map((s) => s.trim()).filter(Boolean);

  const pIdx = lines.findIndex((l) => /^Points\/night$/i.test(l));
  const points = pIdx > 0 ? Number(lines[pIdx - 1].replace(/[^\d]/g, '')) : null;
  const reward = lines.find((l) => /^(Standard Room Reward|Premium Room Rewards)$/i.test(l)) || null;

  const fIdx = lines.findIndex((l) => /^From\*$/i.test(l));
  const cashText = fIdx >= 0 ? lines[fIdx + 1] : null;

  return {
    code,
    name: link.innerText.split('\n')[0].trim(),
    points,
    reward,
    standard: reward === 'Standard Room Reward',
    premiumOnly: reward === 'Premium Room Rewards',
    cashAmount: points === null && cashText ? Number(cashText.replace(/[^\d]/g, '')) : null,
    soldOut: lines.includes('Sold Out')
  };
});
```

검증: 2026-11-27 15:2x KST, LXR 1페이지 20장 전부 코드·포인트·라벨 판독. 현금 모드(Use Points 해제) Waldorf 1페이지 20장에서 `OSAWAWA ¥80,627` 등 판독값이 기존 관측 샘플과 일치.

### 4-2. 객실 목록(1단계) — `hotel/scripts/browser/rooms_page.js`

```js
const pts = li.innerText.match(/Pay with Points:\s*([\d,]+)\s*per night/i);   // 라벨 없음
const quick = [...li.querySelectorAll('button')].find((b) => /^Quick Book/i.test(b.innerText.trim()));
const more  = [...li.querySelectorAll('button')].find((b) => /More Rates/i.test(b.innerText));
```

- `Quick Book`은 **기준 요금제**(예: `Flexible Rate ₩638,000`), `More Rates From`은 **최저가**(`₩548,218`)다.
- `Quick Book` 버튼은 `aria-label`이 아니라 자식 텍스트로 이름이 붙는다 → `aria-label` 선택자로는 잡히지 않는다(실측).

### 4-3. 요금 상세(2단계) — `hotel/scripts/browser/rates_page.js`

```js
// "Standard Room Reward" 다음 1~4줄 안에 "80,000 Points per night"
const rewards = [];
lines.forEach((line, i) => {
  if (/^(Standard Room Reward|Premium Room Rewards)$/.test(line)) {
    const ptsLine = lines.slice(i, i + 4).find((x) => /^[\d,]+ Points per night$/.test(x));
    rewards.push({ label: line, points: ptsLine ? Number(ptsLine.replace(/[^\d]/g, '')) : null });
  }
});

const standardAvailable = rewards.some((r) => r.label === 'Standard Room Reward');
const premiumOnly       = !standardAvailable && rewards.some((r) => r.label === 'Premium Room Rewards');
```

판정 규칙

| rewards | 의미 | 주말숙박권 |
|---|---|---|
| `Standard Room Reward` 있음 | Standard 재고 열림 | **사용 가능** |
| `Premium Room Rewards`만 | Premium만 열림 | 사용 불가 |
| 비어 있음 | 이 날짜 포인트 재고 없음 | 사용 불가 |

검증: 콘래드 서울 2026-12-15~16 · 1 King Bed Deluxe → `Standard Room Reward 80,000`, 현금 9개 요금제(최저 ₩548,218), `Prices include all taxes and fees in South Korean Won.`, `Sign in to pay with Points` → **₩6.85/P** 계산 일치.

### 4-4. 빌드 스크립트

```bash
# 1) 마스터(124건) 생성 — 브랜드 디렉터리 실측 목록을 RAW 테이블로 고정
python3 hotel/scripts/build_luxury.py
#   → hotel/scripts/data/hotels_luxury.json

# 2) 관측 119곳 + 마스터 → 앱 데이터
python3 hotel/scripts/build_hotel_data.py
#   → hotel/data/hotels.json  (앱이 읽는 파일)
#   → hotel/scripts/data/hotels_points_summary.json (감사용 요약)
```

`build_hotel_data.py`가 하는 일:

1. **이름 정규화 매칭** — `norm()`이 소문자·`&/and`·브랜드 접미사·콤마를 지운 뒤 `(브랜드, 이름)`으로 마스터와 관측 레코드를 잇는다. 실패하면 prefix 매칭 1건만 허용(2건 이상이면 assert로 중단).
2. **rewardType → status** — `STANDARD/PREMIUM → AVAILABLE`, `SOLD_OUT → SOLD_OUT`, `NO_POINTS/COMING_SOON → NOT_QUERIED`.
3. **원화 환산** — 관측 통화가 KRW가 아니면 `FX` 표(2026-11-27 exchangerate-api)로 곱한다. *(대안: 브라우저에서 통화를 KRW로 바꿔 읽으면 환율표 없이 원화값을 얻는다 — 2-3절)*
4. **1포인트 가치** — `valuePerPoint = cashKrw / points` (반올림 2자리).
5. **도시 집계** — 영업 중 호텔만 묶어 `cities[]`(도시별 총계·Standard 수·관측 수) 생성.
6. **제외/주의 플래그** — `CUNCICI`·`CUNWAWA`(올인클루시브) `excluded`, `OGGHOWA`(HGV 레지던스) `caution`.

### 4-5. 가치 계산식

```
1포인트 가치(원/P) = (세금 포함 현금가 − 포인트 결제 추가비용) / 필요 포인트
```

`staypoint-v3`의 calculator와 동일한 식이며, 앱(`hotel-app.js`)의 등급은 다음과 같다.

| 원/P | 판정 |
|---|---|
| ≥ 7.0 | 대박 — 포인트 결제가 확실히 유리 |
| 5.0 ~ 7.0 | 양호 — 포인트 결제 추천 |
| 3.5 ~ 5.0 | 보통 — 취향 차이 |
| < 3.5 | 현금 결제가 유리 |

숙박권(Free Night Reward)을 쓰면 **Standard Room Reward 1박의 현금가 전액**이 절약된다. 리조트피·도시세처럼 숙박권에 포함되지 않는 비용은 별도.

> 용어: 힐튼 글로벌 규정은 2022년부터 **요일 제한이 없다**. 우리 앱의 "주말숙박권(금·토·일)"은 **국내 제휴카드 발급 숙박권 기준**이므로, UI에도 그렇게 명시한다(`hotel/index.html` 2탭 안내문).

---

## 5. 데이터 구조

### 5-1. 마스터 `hotel/scripts/data/hotels_luxury.json` — 124건 / 영업 중 119곳

```json
{
  "code": "selcici", "name": "Conrad Seoul", "brand": "co",
  "brandLabel": "Conrad Hotels & Resorts", "brandShort": "Conrad",
  "city": "Seoul", "country": "South Korea", "countryCode": "KR",
  "region": "한국", "url": "https://www.hilton.com/en/hotels/selcici/",
  "status": "open", "statusLabel": "영업 중"
}
```

- 브랜드: `wa` 45 / `co` 58 / `lx` 21 (영업 중 43 / 55 / 21)
- 상태: `open` 119 · `coming_soon` 4 · `residence_only` 1
- 권역 8구분: 한국 · 일본 · 중국·동남아 · 남아시아·몰디브 · 중동·아프리카 · 유럽 · 미주 · 오세아니아·카리브

### 5-2. 관측 `hotel/scripts/data/observed_sample.json` — 영업 중 119곳 전수

```json
{ "name": "Waldorf Astoria Osaka", "brand": "wa", "points": 120000,
  "rewardType": "STANDARD", "cashAmount": 80627, "cashCurrency": "JPY",
  "cashBasis": "디렉터리 최저 현금가(향후 30일, Honors 할인 등 최저 요금)" }
```

집계: STANDARD 104 · PREMIUM 11 · SOLD_OUT 3 · COMING_SOON 2(개관예정 호텔) · NO_POINTS 1 — 영업 중 119곳 전수, 미관측 0

### 5-3. 앱 데이터 `hotel/data/hotels.json` — 119 + 119 + 94 도시

`meta`(카운트·환율·관측 기준·API 설정) + `hotels[]`(119건, 전부 `points`/`cashKrw`/`valuePerPoint` 채움) + `cities[]`(94개).

---

## 6. D1 실시간 연동

지금은 `mode: "static"`(스냅샷)이고, D1을 붙이면 **`hotel/assets/hotel-api.js`의 한 줄**로 실시간으로 바뀐다.

### 6-1. 구성

| 파일 | 역할 |
|---|---|
| `functions/api/hotel/schema.sql` | D1 테이블 정의 (`HOTEL_DB` 바인딩) |
| `functions/api/hotel/rates.js` | `GET /api/hotel/rates` — 도시·호텔·날짜로 조회, 24시간 지나면 `STALE` 강등 |
| `hotel/assets/hotel-api.js` | `HOTEL_API_CONFIG.mode` = `"static"` / `"live"` 전환점 + 응답 정규화 |
| `hotel/assets/hotel-app.js` | 화면 로직 (조회·주말 판정·가치 계산기) |

### 6-2. 전환 절차

```bash
# 1) D1 생성 후 Pages 프로젝트에 바인딩 이름 HOTEL_DB 로 연결
wrangler d1 create hotel-db
#   wrangler.toml / Pages 설정:  [[d1_databases]] binding = "HOTEL_DB"  database_name = "hotel-db"

# 2) 스키마 적용
wrangler d1 execute HOTEL_DB --file=functions/api/hotel/schema.sql --remote

# 3) 수집 레코드 upsert (PK: 호텔·체크인·체크아웃·인원·객실수·reward_type)
#    → 같은 날짜의 Standard/Premium을 두 행으로 저장한다
wrangler d1 execute HOTEL_DB --remote --command "INSERT INTO ... ON CONFLICT(...) DO UPDATE SET ..."

# 4) 프론트 전환: hotel/assets/hotel-api.js →  mode: "live"
# 5) 배포 후  GET /api/hotel/rates?city=Seoul&checkIn=2026-12-18&checkOut=2026-12-19&adults=2
```

### 6-3. 테이블 계약 (`schema.sql`)

```sql
CREATE TABLE IF NOT EXISTS hotel_rate_observations (
  hotel_code TEXT NOT NULL,      -- 7자리 대문자 (SELCICI)
  city       TEXT NOT NULL,      -- hotels.json 의 city 키 (Seoul)
  check_in   TEXT NOT NULL, check_out TEXT NOT NULL,
  adults     INTEGER NOT NULL DEFAULT 2, rooms INTEGER NOT NULL DEFAULT 1,
  currency   TEXT, cash REAL, extra REAL NOT NULL DEFAULT 0, points INTEGER,
  reward_type TEXT,              -- STANDARD | PREMIUM
  room_code  TEXT,
  status     TEXT NOT NULL,      -- AVAILABLE | SOLD_OUT | NOT_QUERIED | FAILED
  tax_included INTEGER NOT NULL DEFAULT 0,        -- 0 | 1
  conditions_matched INTEGER NOT NULL DEFAULT 0,  -- 0 | 1
  source     TEXT NOT NULL,      -- MANUAL | AUTHORIZED_API …
  observed_at TEXT NOT NULL,     -- ISO8601 (UTC)
  PRIMARY KEY (hotel_code, check_in, check_out, adults, rooms, reward_type)
);
```

설계 원칙(staypoint-v3 validator 계약 계승):
- 저장은 `AVAILABLE / SOLD_OUT / NOT_QUERIED / FAILED` 4가지. **`AVAILABLE`만 `points`·`cash`·`reward_type`을 채운다.**
- `observed_at`이 24시간을 넘으면 **API가 읽을 때 `STALE`로 강등**(`STALE_HOURS = 24`).
- `tax_included`·`conditions_matched`가 1이 아니면 레코드를 신뢰하지 않는다(세금 미포함/조건 불일치).

### 6-4. API (`rates.js`)

```
GET /api/hotel/rates?city=Seoul&checkIn=2026-12-18&checkOut=2026-12-19&adults=2
GET /api/hotel/rates?hotelCode=SELCICI&checkIn=...&checkOut=...&weekendOnly=1
```

- `weekendOnly=1`이면 **체크인이 금·토·일(KST)** 이 아니면 `400 weekend_only_fri_sat_sun`.
- 응답: `{ ok:true, source:"d1", observedAt, records:[{ hotelCode, city, checkIn, checkOut, adults, rooms, status, currency, cash, extra, points, rewardType, roomCode, taxIncluded, conditionsMatched, source, observedAt }] }`
- 바인딩이 없으면 `503 {ok:false,error:"database_unavailable"}` → 프론트는 static 스냅샷으로 계속 동작(무중단).

### 6-5. 수집 → D1 파이프라인 (앞으로)

```
[사람 브라우저 세션]
  /en/locations/{brand}/ (Use Points)          → locations_use_points.js  → 요약(80~124곳)
  /en/hotels/{code}/ → rooms → More Rates      → rooms_page.js / rates_page.js → 날짜별 정확 레코드
        │
        ▼
  hotels_luxury.json / observed_sample.json  (또는 바로 JSONL)
        │  build_hotel_data.py  (정규화·환율·가치 계산)
        ▼
  hotel/data/hotels.json   (정적 스냅샷 · 지금 서비스)
        │  (선택) 수집 레코드를 그대로 upsert
        ▼
  D1 hotel_rate_observations  →  /api/hotel/rates  →  프론트 mode:"live"
```

**`/book/` 대량 자동 수집은 하지 않는다** (7절). 사람이 조회한 결과를 레코드로 남기는 방식이 현재 결정과 맞는다.

---

## 7. robots.txt · 약관, 그리고 현재 결정

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

- **허용**: `/en/locations/…`(브랜드 디렉터리·Use Points 목록), `/en/hotels/{code}/`(호텔 상세)
- **금지**: `/book/…`(객실·요금·라벨이 나오는 화면), `/find-hotels/`, `/search/`

따라서 서비스는 **안전형**으로 운영한다.

| 범위 | 결정 |
|---|---|
| 디렉터리 요약(포인트·Standard/Premium 라벨) | **수록** — robots 허용 경로, 비로그인 공개 화면 |
| 날짜별 상세 요금(`/book/`) | **대량 자동 수집 금지**. 사용자가 버튼을 눌렀을 때 공식 페이지만 열어 주고, 화면에서 읽은 값은 사람이 확인·입력 |
| 자동화가 필요해질 때 | 힐튼 제휴/공식 API 등 **허가된 소스** 확보가 먼저(`AUTHORIZED_SOURCE_REQUIRED`) |

참고: 폐지한 `staypoint-v3`도 같은 이유로 실시간 힐튼 수집을 `DisabledHiltonProvider`로 막아 두었다. 이번 실측은 그 판단의 근거(403 + robots Disallow)를 그대로 확인해 준다.

---

## 8. 재현 체크리스트

- [ ] 새 브라우저 세션에서 `https://www.hilton.com/en/locations/lxr-hotels/` → 쿠키 배너 처리
- [ ] `Use Points` 체크 → 카드 20장에 `Points/night` + 라벨이 뜨는지
- [ ] `locations_use_points.js` 실행 → 20행 JSON (`code` 7자리 채워짐)
- [ ] 현금 모드로 토글 → 같은 스크립트 → `cashAmount` 채워짐
- [ ] `Select currency` = KRW → 현금가가 `₩`로 바뀌는지
- [ ] `https://www.hilton.com/en/hotels/selcici-conrad-seoul/` → `Check rooms & prices` → `Use Points & Money`
- [ ] `rooms_page.js` → 객실별 `Pay with Points`·Quick Book·More Rates
- [ ] 한 객실 `More Rates` → `rates_page.js` → `Standard Room Reward` 라벨 + `cashMin` + `valuePerPoint`
- [ ] `python3 hotel/scripts/build_luxury.py` · `build_hotel_data.py` → `hotel/data/hotels.json` 재생성(현재 배포본과 동일)

---

## 9. 파일 색인

```
docs/HILTON_HOTEL_COLLECTOR_GUIDE.md      ← 이 문서
docs/hilton/measurement-2026-11-27.md     ← 실측 원본 기록(수치·URL·차단 양상)
docs/hilton/screens/*.png                 ← 증거 스크린샷 5장
hotel/README.md                           ← 서비스 개요·D1 전환 요약
hotel/scripts/README.md                   ← 스크립트·스니펫 실행법
hotel/scripts/build_luxury.py             ← 마스터 124건 생성
hotel/scripts/build_hotel_data.py         ← 관측+마스터 → hotel/data/hotels.json
hotel/scripts/browser/locations_use_points.js
hotel/scripts/browser/rooms_page.js
hotel/scripts/browser/rates_page.js
hotel/scripts/data/hotels_luxury.json
hotel/scripts/data/observed_sample.json
hotel/scripts/data/hotels_points_summary.json
hotel/data/hotels.json                    ← 앱이 실제로 읽는 데이터
functions/api/hotel/schema.sql            ← D1 스키마
functions/api/hotel/rates.js              ← GET /api/hotel/rates
hotel/assets/hotel-api.js                 ← mode: static | live
```
