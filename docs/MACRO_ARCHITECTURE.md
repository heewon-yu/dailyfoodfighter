# 경제지표지도(`/macro/`) 아키텍처

최종 갱신: 2026-11-27

공개 데이터만으로 경제지표를 한 화면에 보여주는 서비스입니다. 화면은 정적 HTML이고, 값은 Cloudflare Pages Function(`/api/macro`)이 접속 시점에 모아 내려줍니다. 외부 사이트가 막히면 저장소에 커밋된 정적 스냅샷으로 폴백합니다.

```
브라우저  ──GET /macro/──────────────▶ macro/index.html (정적)
         ──GET /api/macro────────────▶ functions/api/macro.js
                                          ├─ fetch /macro/data/snapshot.json  (느린 데이터·폴백)
                                          └─ collectMacro()  functions/_shared/macro.js
                                                ├ CNN Fear & Greed
                                                ├ 미 재무부 국채 수익률 CSV
                                                ├ FRED BAMLH0A0HYM2 (실패 시 인터넷 아카이브 미러)
                                                ├ 뉴욕 연은 EFFR API
                                                ├ StockAnalysis S&P500 시총 / 세계은행 GDP
                                                ├ 업비트 · Coinbase
                                                └ Yahoo Finance chart API (지수·환율·원자재)
         ──(API 실패 시) /macro/data/snapshot.json ──▶ 마지막 확보 값으로 렌더
```

## 1. 파일

| 경로 | 역할 |
| --- | --- |
| `macro/index.html` | 정적 대시보드. 카드 골격·설명·출처를 HTML에 두고 값만 JS로 채움(JS 꺼져도 라벨은 보임) |
| `macro/assets/macro.css` | 팔레트·그리드·반응형. 브랜드 `#0f766e`, 보조 `#0e7490`, 경고 `#b45309` |
| `macro/assets/macro.js` | `/api/macro` → 실패 시 스냅샷. 5분 자동 갱신, 새로고침 버튼 |
| `macro/data/snapshot.json` | `collectMacro()` 결과 + `calendar`(CPI·PPI 일정/컨센서스) + `snapshotBuiltAt` |
| `functions/api/macro.js` | `onRequestGet`: 스냅샷 로드 → 실시간 수집 → 병합 → JSON |
| `functions/_shared/macro.js` | 모든 외부 호출·파싱·계산. 스냅샷 생성 스크립트와 공유 |
| `scripts/macro-snapshot.mjs` | 스냅샷 생성기(나스닥 경제캘린더 스캔 포함) |

## 2. 데이터 소스

| 지표 | 소스 | 엔드포인트 | 갱신 주기 |
| --- | --- | --- | --- |
| CNN 공포·탐욕지수 | CNN | `https://production.dataviz.cnn.io/index/fearandgreed/graphdata` | 장중 수시 (CNN 갱신 시) |
| VIX | Yahoo Finance | `https://query1.finance.yahoo.com/v8/finance/chart/^VIX?range=1mo&interval=1d` | 실시간(지연) |
| 미국 10년·2년물 | 미 재무부 | `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/{YYYY}/all?type=daily_treasury_yield_curve&field_tdr_date_value={YYYY}&page&_format=csv` | 미국 영업일 1회 |
| 하이일드 스프레드 | FRED (ICE BofA) | `https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLH0A0HYM2` | 미국 영업일 1회 |
| ↳ 실패 시 | 인터넷 아카이브 미러 | `https://web.archive.org/web/2026id_/https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLH0A0HYM2` | 아카이브 시점(화면에 기준일 표기) |
| 미국 기준금리 | 뉴욕 연은 | `https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json` | 미국 영업일 1회 |
| 버핏지수 분자(S&P500 시총) | StockAnalysis | `https://stockanalysis.com/list/sp-500-stocks/` 의 `Total Market Cap` 값 | 페이지 갱신 시 |
| 버핏지수 분모(미국 GDP) | 세계은행 | `https://api.worldbank.org/v2/country/USA/indicator/NY.GDP.MKTP.CD?format=json&per_page=5&mrnev=1` | 연 1회(연간 GDP) |
| CPI·PPI 실제 YoY | 미국 노동통계국(BLS) | `POST https://api.bls.gov/publicAPI/v2/timeseries/data/` (`CUUR0000SA0`, `CUUR0000SA0L1E`, `WPUFD4`) | 월 1회 |
| CPI·PPI 예상/실제/다음 발표일 | 나스닥 경제캘린더 | `https://api.nasdaq.com/api/calendar/economicevents?date=YYYY-MM-DD` | 스냅샷 생성 시 스캔 |
| S&P500·나스닥·코스피·코스닥 | Yahoo Finance | `.../chart/^GSPC`, `^IXIC`, `^KS11`, `^KQ11` | 실시간(지연) |
| 원/달러 | Yahoo Finance | `.../chart/KRW=X` | 실시간(지연) |
| 달러 인덱스 | Yahoo Finance | `.../chart/DX-Y.NYB` | 실시간(지연) |
| WTI·금 | Yahoo Finance | `.../chart/CL=F`, `GC=F` | 실시간(지연) |
| BTC 원화 | 업비트 | `https://api.upbit.com/v1/ticker?markets=KRW-BTC` | 실시간 |
| BTC 달러 | Coinbase (실패 시 CoinGecko) | `https://api.coinbase.com/v2/prices/BTC-USD/spot` · `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd` | 실시간 |

Yahoo는 `query1`이 실패하면 `query2`로 재시도합니다. 모든 요청은 7~12초 타임아웃을 두고 `Promise.allSettled`로 병렬 실행하므로, 한 소스가 죽어도 나머지는 그대로 표시됩니다.

## 3. 계산식

**장단기 금리차 (10Y−2Y)**
```
spread = 10년물 par yield − 2년물 par yield   (미 재무부 일별 수익률 곡선, 같은 고시일)
```
0 미만이면 역전, 0.5%p 미만은 평탄으로 표기합니다.

**김치프리미엄**
```
fair_krw  = BTC/USD × USD/KRW
김치프리미엄(%) = (업비트 BTC/KRW ÷ fair_krw − 1) × 100
```
환율은 Yahoo `KRW=X`, BTC/USD는 Coinbase(실패 시 CoinGecko) 값을 씁니다. 국내·해외 거래소 가격 차이·환전 수수료는 반영하지 않은 단순 비교입니다.

**버핏지수**
```
버핏지수(%) = S&P500 시가총액 합계 ÷ 미국 명목 GDP × 100
```
- 분자: StockAnalysis의 S&P500 리스트 페이지 `Total Market Cap`(구성종목 시총 합계).
- 분모: 세계은행 미국 명목 GDP(최신 연간값, 화면에 연도 표기).
- 윌셔5000처럼 미국 상장 전체가 아닌 **S&P500 합계**라서, 널리 인용되는 전체시장 기준 버핏지수보다 낮게 나옵니다. 화면에도 이 계산 방식을 그대로 적습니다.

**CPI / PPI**
```
YoY(%) = (당월 지수 ÷ 전년 동월 지수 − 1) × 100        (BLS 지수, NSA)
전월비·근원전월비·근원 YoY = BLS 지수/발표치
서프라이즈 = 실제 − 컨센서스  →  +면 '예상 상회', 0이면 '예상 부합', −면 '예상 하회'
```
- BLS 2025년 10월 지수가 공백(당시 미발표)이어서, 그 달의 YoY는 나스닥 캘린더가 다음 발표일에 표시하는 직전 발표치를 씁니다.
- CPI의 전년동월비 컨센서스는 캘린더에 없는 경우가 많아, 비교 배지는 전월비(예상 대비)로 판정하고 전년동월비는 발표치만 표시합니다.
- PPI는 전년동월비 예상치가 있으면 그 값으로 판정합니다.

## 4. API 응답

```jsonc
GET /api/macro
{
  "ok": true,
  "generatedAt": "2026-11-27T06:12:02.832Z",
  "marketAsOf": "2026-11-27T06:11:43.000Z",
  "calendar": {
    "cpi": {"released":"2026-11-11","next":"2026-12-11","mom":0.4,"momCons":0.3,
            "coreMom":0.3,"coreMomCons":0.2,"yoy":3.7,"coreYoy":2.6},
    "ppi": {"released":"2026-11-13","next":"2026-12-16","mom":0.3,"momCons":0.4,
            "yoy":6.5,"yoyCons":6.6,"coreYoy":5.0,"coreYoyCons":5.0},
    "fomcNext": "2026-12-10"
  },
  "metrics": {
    "fear_greed": {"score":15.0,"rating":"extreme fear","prevClose":15.2,"prevWeek":15.9,"prevMonth":29.8,"asOf":"..."},
    "vix": {"price":26.8,"prev":28.29,"changePct":-5.27,"monthPct":55.8,"asOf":"..."},
    "yield10": {"value":4.85,"prev":4.91,"date":"2026-11-25"},
    "yield2": {"value":4.61,"prev":4.63,"date":"2026-11-25"},
    "spread": {"value":0.24,"prev":0.28,"date":"2026-11-25"},
    "hy_oas": {"value":3.72,"prev":3.63,"prevMonth":3.3,"date":"2026-11-24","via":"FRED (Internet Archive 스냅샷)"},
    "fed": {"low":3.75,"high":4.0,"effr":3.88,"date":"2026-11-24"},
    "buffett": {"ratioPct":213.1,"spCapUsd":6.558e13,"gdpUsd":3.07697e13,"gdpYear":"2025","asOf":"2026-11-27"},
    "sp500": {"price":7182.78,"prev":7201.09,"changePct":-0.25,"monthPct":-7.25,"asOf":"..."},
    "btc": {"krw":83859000,"usd":61802.6,"kimchiPct":1.3,"fairKrw":82783340,"fxUsed":1339.48,"asOf":"..."}
  },
  "sources": {"fearGreed":"ok","yields":"ok","hyOas":"ok","fed":"ok"},
  "degraded": false,
  "stale": []
}
```

- `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=300` — 엣지 5분 캐시.
- 수집이 통째로 실패해도 200으로 스냅샷을 내려주고 `degraded:true`, `liveError`를 붙입니다.
- 개별 소스 실패 시 해당 지표는 스냅샷 값으로 남고 `sources.<key>="fail"`, `stale`에 키가 들어갑니다.

## 5. 폴백 스냅샷 갱신 방법

```bash
# 저장소 루트, Node 18 이상
node scripts/macro-snapshot.mjs
```

- `collectMacro()`로 실시간 지표를 모으고, 나스닥 경제캘린더를 **앞뒤 50일** 훑어 CPI·PPI의 최근 발표치/예상치/다음 발표일과 다음 FOMC일을 만듭니다.
- 결과를 `macro/data/snapshot.json`에 덮어씁니다. 커밋해서 배포하면 API가 죽어도 화면에 마지막 값이 뜹니다.
- 나스닥 캘린더가 주말 날짜로 잡아 주는 발표는 직전 금요일로 보정하고 원본 날짜를 `releasedRaw`에 남깁니다.
- BLS·FRED처럼 월 1회만 바뀌는 값은 이 스크립트를 월 1회(발표 다음 날) 돌리면 충분합니다.

## 6. 운영 메모

- **FRED 접근 제한**: `fred.stlouisfed.org`가 데이터센터 IP를 막는 경우가 있어, 직접 호출 실패 시 인터넷 아카이브의 FRED CSV 스냅샷으로 대체합니다. 이때 값 기준일(예: 2026-11-24)과 `via` 필드가 화면에 함께 표시됩니다. 아카이브도 실패하면 값이 `null`이 되고 카드에 "확인 불가"가 뜹니다(가짜 값으로 채우지 않음).
- **Yahoo Finance**: 공식 API가 아니라 비공식 chart 엔드포인트입니다. 호출이 잦으면 429가 날 수 있어 지표당 1회, 5분 캐시로 제한했습니다. `meta.chartPreviousClose`는 조회 구간 시작 전 종가라 전일 종가로 쓰지 않고, 시계열의 뒤에서 두 번째 종가를 전일로 사용합니다.
- **시장 휴장**: 미국 휴장일에는 마지막 종가가 그대로 표시되고 기준 시각으로 구분합니다.
- **표기 원칙**: 모든 카드에 출처·기준 시각을 적고, 값이 없으면 "확인 불가"로 둡니다. 투자 권유 문구는 하단에 고정했습니다.
- **접근성/성능**: 값은 JS로 채우지만 라벨·설명은 HTML에 있어 JS가 없어도 읽힙니다. 외부 요청은 모두 서버(엣지)에서만 일어나 브라우저 CORS 문제가 없습니다.
