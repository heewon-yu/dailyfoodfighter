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
