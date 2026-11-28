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
