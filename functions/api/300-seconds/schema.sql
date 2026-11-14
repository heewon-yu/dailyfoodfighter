CREATE TABLE IF NOT EXISTS mystery_rankings (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 kst_day TEXT NOT NULL,
 nickname TEXT NOT NULL,
 score INTEGER NOT NULL,
 solved INTEGER NOT NULL,
 hints INTEGER NOT NULL DEFAULT 0,
 mode TEXT NOT NULL DEFAULT 'normal',
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mystery_day_score ON mystery_rankings(kst_day, score DESC, solved DESC);
CREATE INDEX IF NOT EXISTS idx_mystery_score ON mystery_rankings(score DESC, solved DESC);
CREATE INDEX IF NOT EXISTS idx_mystery_nick ON mystery_rankings(nickname);
