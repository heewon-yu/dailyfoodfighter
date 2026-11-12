-- Cloudflare D1 Schema for 5분단타왕 (Scalping King)
-- D1 Console에서 아래 SQL을 실행하여 테이블을 생성합니다.

CREATE TABLE IF NOT EXISTS daily_rankings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kst_day TEXT NOT NULL,         -- 'YYYY-MM-DD' (한국시간)
  nickname TEXT NOT NULL,        -- '송도단타왕' (2~12자)
  rate REAL NOT NULL,            -- 수익률 (% 단위, 예: 14.80)
  profit INTEGER NOT NULL,       -- 수익금 (원 단위, 예: 14800000)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rankings_day_rate ON daily_rankings(kst_day, rate DESC);
CREATE INDEX IF NOT EXISTS idx_rankings_day_profit ON daily_rankings(kst_day, profit DESC);
CREATE INDEX IF NOT EXISTS idx_rankings_day_nick ON daily_rankings(kst_day, nickname);
