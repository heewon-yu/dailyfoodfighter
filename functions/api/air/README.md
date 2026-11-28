# /api/air/routes — 마일지도 D1 API

`air-db`(D1 바인딩 `AIR_DB`)의 보너스 좌석 달력을 읽고, **노선-월 단위로만** 부분 갱신하는 엔드포인트입니다.
스키마는 같은 폴더의 `schema.sql`(테이블 `air_award_dates`, `air_ingest_runs`).

## 읽기

```
GET /api/air/routes?origin=ICN&destination=ORD&month=2026-12&cabin=business
```

| 파라미터 | 설명 |
|---|---|
| `origin` / `destination` | IATA 3자리 (선택) |
| `month` | `YYYY-MM` (선택) |
| `cabin` | `business` \| `first` (선택) |
| `status` | `available` \| `unavailable` \| `unknown` (선택) |
| `from` / `to` | `YYYY-MM-DD` 출발일 범위 (선택) |
| `limit` | 기본 3000, 최대 20000 |

응답은 `{ ok:true, source:"d1", total, returned, limit, items:[…] }` 이고 `items`의 각 행은
`/air/` 달력 스냅샷(`air/data/preview/…`)의 item 과 같은 모양입니다
(`program, origin, destination, departure_date, month, cabin, status, seat_count, points,
first_combined, source_updated_at, collected_at, updated_at`).

## 쓰기 (수집기 전용)

```
POST /api/air/routes
Authorization: Bearer $AIR_INGEST_TOKEN
{ "origin":"ICN", "destination":"SIN", "month":"2027-05",
  "items":[ { "departure_date":"2027-05-01", "cabin":"business",
              "status":"available", "first_combined":false,
              "source_updated_at":"2026-11-28T01:30:00+09:00" } ] }
```

- `AIR_INGEST_TOKEN`(Pages 시크릿)이 설정돼 있지 않으면 **503**을 돌려주고 아무것도 쓰지 않습니다.
  토큰은 `Authorization: Bearer` 헤더로만 받습니다.
- `(program, origin, destination, month)` 범위의 행만 `ON CONFLICT DO UPDATE` 로 upsert 하고,
  같은 범위에서 이번 payload 에 없는 출발일 행만 정리합니다. **다른 노선·월 행과 그들의
  `collected_at` 은 그대로 둡니다.**
- `collected_at` 은 item 별 값 → body 의 `collected_at` → 현재 시각 순으로 채웁니다.
- 응답: `{ ok:true, scope:{…}, upserted, pruned, collected_at, updated_at }`

## 값 규칙

- `cabin`: `business`(프레스티지) / `first`(일등석)
- `status`: `business` 는 `prestigeAward` 가 true 면 `available`, 아니면 `unavailable`.
  `first` 는 `firstAward`/`firstAwardOrUpgrade` 가 true 면 `available`, 아니면 `unknown`.
- `first_combined`: 일등석+업그레이드 통합 표기(`firstAwardOrUpgrade`)일 때 1.

## 재조회 요청 큐 (`air_refresh_queue`)

웹에서 오래된 노선-월을 조회하면 그 노선-월만 집 PC 수집기가 다시 조회하도록 요청을 쌓는 큐입니다.
테이블·인덱스는 `schema.sql`(부분 유니크 인덱스 `idx_air_refresh_queue_active`)에 있습니다.

### 요청 (공개 — `/air/` 프론트가 호출)

```
POST /api/air/refresh-request
{ "origin":"ICN", "destination":"ORD", "month":"2026-12" }
```

응답 `status`:

| status | 뜻 |
|---|---|
| `queued` | 새 요청을 큐에 넣었다 |
| `fresh_enough` | 그 노선-월의 D1 `collected_at` 이 2시간 이내 — 넣지 않았다 |
| `deduped` | 같은 노선-월이 이미 pending/processing — 새로 넣지 않았다 |
| `failed_cooldown` | 30분 안에 실패한 요청이 있다 — `retry_after_seconds` 뒤에 다시 |
| `daily_limit_reached` | 24시간 전체 40건 상한 |
| `rate_limited` | 같은 요청자 10건 상한(요청자는 IP 해시 앞 12자만 저장) |

```
GET /api/air/refresh-request?origin=ICN&destination=ORD&month=2026-12
```

프론트 상태 배지용 공개 조회. `{ ok, status:"none|pending|processing|done|failed", item, fresh, queue }`.

### 워커 (집 PC 전용 — `Authorization: Bearer $AIR_INGEST_TOKEN`)

```
GET  /api/air/refresh-queue            # pending 1건을 원자적으로 가져간다(processing, attempts+1)
GET  /api/air/refresh-queue?peek=1&limit=5   # 상태를 바꾸지 않고 대기 목록만 본다
POST /api/air/refresh-queue            # { "id":12, "status":"done"|"failed", "error_msg":"…", "note":"…" }
```

- 응답의 `fresh` 가 `true` 면 워커는 브라우저를 열지 않고 바로 `done` 을 보고해도 됩니다.
- 30분 넘게 `processing` 인 행은 다음 `GET` 에서 자동으로 `pending` 으로 돌아옵니다(`stale_recovered`).
- 토큰이 없으면 `401`, 틀리면 `403`, `AIR_INGEST_TOKEN` 미설정이면 `503`(fail‑closed).

워커 구현·실행법: `heewon-yu/milemap-collector` 의 `scripts/live_dom_collector/queue_worker.py`,
`docs/DAILY_INCREMENTAL_0905.md` 「웹 재조회 큐 워커」 절.

---

## D1 읽기 예산 (2026-11-28 — 무료 일일 500만 행 한도 대응)

### 문제

기존 `/air/` 는 접속할 때마다 ① 매니페스트(전체 GROUP BY ≈ 4만 행) ② 행 데이터(월별 전량)를
D1 에서 읽었다. `GET /api/air/routes?month=…` 는 `month` 단독 인덱스가 없어 **한 달을 읽을 때마다
테이블 전체를 두 번(SELECT + COUNT) 훑었기 때문에**, 페이지 한 번에 수십만 행이 나가
무료 한도(500만 행/일)가 하루 몇 번의 방문으로 소진됐다.

### 지금 구조 (정적 우선 + D1 변경분 오버레이)

```
/air/ 접속
  ├─ air/data/preview/index.json + snapshots/**   ← 정적 CDN, D1 0행 (기본 데이터)
  └─ GET /api/air/changes?since=<스냅숏 generated_at>
        └─ 스냅숏 이후 D1 에 새로 올라온 노선-월만 (보통 0~수십 건)
             └─ GET /api/air/routes?scopes=ICN-ORD-2026-12,…  ← 그 노선-월 행만(수십 행)
```

- 스냅숏은 수집 배치가 커밋될 때마다 갱신되므로, 평소 오버레이는 0건이다.
- 웹 재조회 큐가 D1 에만 다시 올린 노선-월만 오버레이로 덮인다(그 노선-월 행만 교체).
- 스냅숏이 `STATIC_MAX_AGE_HOURS`(48시간)보다 오래되면 지금처럼 D1 우선으로 되돌아간다.
- D1 이 죽어도(한도 초과 포함) 화면은 스냅숏으로 그대로 뜬다.
- 점검용: `?data=static`(정적만) / `?data=d1`(D1 만).

### 엣지 캐시 (`functions/_lib/air-cache.js`)

- `GET /api/air/manifest`, `/api/air/routes`(전체·scopes 모두), `/api/air/changes` 응답을
  `caches.default` 에 캐시한다(매니페스트 1시간 · 노선 조회 5분 · 변경분 2분).
- 캐시 키에는 **데이터 세대**가 들어간다. 세대 = `air_ingest_runs` 의 `MAX(id)` 로,
  업로드가 한 건이라도 성공하면 값이 바뀌어 모든 캐시가 자동 무효화된다(별도 purge 불필요).
  세대 확인은 1행 읽기다.
- 세대를 읽지 못하면(D1 장애) 캐시를 쓰지 않고 원래 조회를 그대로 수행한다 — 낡은 데이터를
  최신인 척 돌려주지 않는다.
- `?fresh=1` 또는 `_=난수`(수집기 `upload_d1.py --verify` 가 붙이는 캐시버스터)면 캐시를 건너뛴다.
  따라서 verify 는 항상 D1 실데이터를 본다.
- 응답 헤더 `X-Air-Cache: HIT|MISS|BYPASS|NOGEN|OFF` 로 캐시 동작을 확인할 수 있다.

### 계약(수집기) 호환

- `POST /api/air/routes` 요청·응답 형식, `GET /api/air/manifest` 의 `files[].month/total`,
  `GET /api/air/routes?origin&destination&month&limit=20000` 의 `total`·`items` 는 그대로다.
  집 PC 의 `upload_d1.py`·`queue_worker.py` 는 수정할 필요가 없다.

### 테스트

```
node tests/air-d1/test-api.mjs        # 엔드포인트·계약·캐시 무효화 (실제 SQLite)
node tests/air-d1/test-frontend.mjs   # app.js 데이터 계층(정적 우선·오버레이·폴백)
```

