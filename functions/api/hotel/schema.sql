-- 힐튼포숙지도 — Cloudflare D1 스키마 (D1 바인딩 이름: HOTEL_DB)
-- 적용: wrangler d1 execute HOTEL_DB --file=functions/api/hotel/schema.sql --remote
--
-- 설계 원칙 (staypoint-v3 validator 계약 계승)
--  · status 는 AVAILABLE / SOLD_OUT / NOT_QUERIED / FAILED 만 저장하고,
--    조회 시 관측 후 24시간이 지나면 API가 STALE 로 강등한다.
--  · AVAILABLE 레코드만 points·cash·reward_type이 채워진다.
--  · provenance(source, observed_at)와 조건 플래그(tax_included, conditions_matched)를 강제한다.
--  · PK는 (hotel_code, check_in, check_out, adults, rooms, reward_type) — 같은 날짜의 Standard/Premium을 함께 저장.

CREATE TABLE IF NOT EXISTS hotel_rate_observations (
  hotel_code        TEXT    NOT NULL,             -- 7자리 힐튼 코드 대문자 (예: SELCICI)
  city              TEXT    NOT NULL,             -- hotels.json 의 city 키 (예: Seoul)
  check_in          TEXT    NOT NULL,             -- YYYY-MM-DD
  check_out         TEXT    NOT NULL,             -- YYYY-MM-DD
  adults            INTEGER NOT NULL DEFAULT 2,
  rooms             INTEGER NOT NULL DEFAULT 1,
  currency          TEXT,                         -- ISO 통화 (KRW, JPY, USD …)
  cash              REAL,                         -- 세금 포함 현금가
  extra             REAL    NOT NULL DEFAULT 0,   -- 포인트 결제 시 추가 비용
  points            INTEGER,                      -- 1박 필요 포인트
  reward_type       TEXT,                         -- STANDARD | PREMIUM
  room_code         TEXT,
  status            TEXT    NOT NULL,             -- AVAILABLE | SOLD_OUT | NOT_QUERIED | FAILED
  tax_included      INTEGER NOT NULL DEFAULT 0,   -- 0 | 1
  conditions_matched INTEGER NOT NULL DEFAULT 0,  -- 0 | 1
  source            TEXT    NOT NULL,             -- MANUAL | AUTHORIZED_API …
  observed_at       TEXT    NOT NULL,             -- ISO8601 (UTC)
  PRIMARY KEY (hotel_code, check_in, check_out, adults, rooms, reward_type)
);

CREATE INDEX IF NOT EXISTS idx_hotel_rates_city  ON hotel_rate_observations (city, check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_hotel_rates_hotel ON hotel_rate_observations (hotel_code, check_in);

-- 선택: 호텔 마스터를 D1에도 두고 싶을 때 (현재는 /hotel/data/hotels.json 사용)
CREATE TABLE IF NOT EXISTS hotel_master (
  hotel_code   TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  brand        TEXT NOT NULL,   -- wa | co | lx
  city         TEXT NOT NULL,
  city_ko      TEXT,
  country      TEXT,
  region       TEXT,
  url          TEXT,
  excluded     INTEGER NOT NULL DEFAULT 0,
  exclusion_note TEXT
);
