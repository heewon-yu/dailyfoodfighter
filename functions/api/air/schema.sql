-- 마일지도 (MILEMAP · /air/) — Cloudflare D1 스키마 (D1 바인딩 이름: AIR_DB)
-- 적용: wrangler d1 execute air-db --file=functions/api/air/schema.sql --remote
--       (또는 Dash > D1 > air-db > Console 에 붙여넣기)
--
-- 설계 원칙
--  · 한 행 = 프로그램+노선+출발일+등급 의 보너스 좌석 상태 (달력의 하루 × 등급).
--    /air/ 달력 데이터(air/data/preview/snapshots/.../*.json)의 item 과 1:1로 대응한다.
--  · program  : 'KE_SKYPASS' (대한항공 스카이패스)
--  · cabin    : 'business' | 'first'   (프레스티지 / 일등석 — 일반석은 수집 범위 밖)
--  · status   : 'available' | 'unavailable' | 'unknown'
--               business: prestigeAward=true → available, false → unavailable
--               first   : firstAward=true → available, 조회 불가/미운항 → unknown
--  · collected_at(이 행을 수집한 시각)과 source_updated_at(대한항공이 달력을 고지한 시각)을
--    행마다 따로 보관한다. 그래서 노선-월 한 개만 부분 갱신(upsert)해도 다른 행의 시각이
--    변하지 않는다.
--  · month 는 departure_date 앞 7자리(YYYY-MM)를 그대로 저장해 (origin, destination, month)
--    인덱스 한 번으로 한 노선-월을 전부 읽게 한다.

CREATE TABLE IF NOT EXISTS air_award_dates (
  program            TEXT    NOT NULL DEFAULT 'KE_SKYPASS',
  origin             TEXT    NOT NULL,            -- IATA 3자리 (ICN, GMP …)
  destination        TEXT    NOT NULL,            -- IATA 3자리 (ORD, SIN …)
  departure_date     TEXT    NOT NULL,            -- YYYY-MM-DD (출발일)
  month              TEXT    NOT NULL,            -- YYYY-MM
  cabin              TEXT    NOT NULL,            -- business | first
  status             TEXT    NOT NULL,            -- available | unavailable | unknown
  seat_count         INTEGER,                     -- 공개 지표에 좌석수가 없으면 NULL
  points             INTEGER,                     -- 필요 마일리지(있을 때만)
  first_combined     INTEGER NOT NULL DEFAULT 0,  -- 0 | 1 — 일등석+업그레이드 통합 표기 여부
  operating_status   TEXT,                        -- OPERATED | NOT_OPERATED …
  availability_type  TEXT,                        -- PUBLIC_INDICATOR …
  source             TEXT,                        -- KOREAN_AIR_PUBLIC_AWARD_CALENDAR …
  source_updated_at  TEXT,                        -- ISO8601 (+09:00)
  collected_at       TEXT    NOT NULL,            -- ISO8601 (+09:00) — 이 행의 수집 시각
  updated_at         TEXT    NOT NULL,            -- ISO8601 — D1에 마지막으로 쓴 시각
  PRIMARY KEY (program, origin, destination, departure_date, cabin)
);

-- 한 노선-월 달력 조회
CREATE INDEX IF NOT EXISTS idx_air_award_route_month
  ON air_award_dates (origin, destination, month);

-- 등급·상태 기준 잔여 좌석 스캔 (핫픽/일등석 목록)
CREATE INDEX IF NOT EXISTS idx_air_award_cabin_status
  ON air_award_dates (cabin, status, departure_date);

-- 갱신 이력 (노선-월 단위 부분 갱신 로그 — 어느 노선이 언제 갱신됐는지)
CREATE TABLE IF NOT EXISTS air_ingest_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  program      TEXT    NOT NULL DEFAULT 'KE_SKYPASS',
  origin       TEXT    NOT NULL,
  destination  TEXT    NOT NULL,
  month        TEXT    NOT NULL,
  upserted     INTEGER NOT NULL DEFAULT 0,
  pruned       INTEGER NOT NULL DEFAULT 0,
  collected_at TEXT    NOT NULL,
  received_at  TEXT    NOT NULL,
  actor        TEXT
);

CREATE INDEX IF NOT EXISTS idx_air_ingest_runs_scope
  ON air_ingest_runs (origin, destination, month, received_at);
