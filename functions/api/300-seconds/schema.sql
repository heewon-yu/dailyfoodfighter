-- 300초 추리게임 일일 순위 (KST 기준 하루 단위)
-- 바인딩: Pages production/preview `DB` -> D1 scalping-db. 자세한 내용은 README.md 참고.
-- 함수는 요청마다 IF NOT EXISTS로 이 스키마를 보장하므로, 수동 적용은 선택 사항이다.

CREATE TABLE IF NOT EXISTS mystery_rankings_v4 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kst_day TEXT NOT NULL,
  nickname TEXT NOT NULL,
  score INTEGER NOT NULL,
  solved INTEGER NOT NULL,
  hints INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'normal',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mystery_v4_day_nick
  ON mystery_rankings_v4(kst_day, nickname);

CREATE INDEX IF NOT EXISTS idx_mystery_v4_day_score
  ON mystery_rankings_v4(kst_day, score DESC, solved DESC);

-- 매 요청 purge가 KST 오늘이 아닌 행을 지운다.
-- DELETE FROM mystery_rankings_v4 WHERE kst_day <> strftime('%Y-%m-%d','now','+9 hours');
