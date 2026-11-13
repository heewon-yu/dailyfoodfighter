-- Keep pre-v5 rows as legacy data. Official rankings query verified_scores only.
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, nickname TEXT NOT NULL,
  created_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS quotas (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  day TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0, bonus INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(player_id, day)
);
CREATE INDEX IF NOT EXISTS quota_retention ON quotas(day);
CREATE TABLE IF NOT EXISTS rounds (
  id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL, day TEXT NOT NULL, version TEXT NOT NULL, seed INTEGER NOT NULL,
  market_key TEXT NOT NULL, started_ms INTEGER NOT NULL, anchor_ms INTEGER NOT NULL,
  elapsed_ms INTEGER NOT NULL DEFAULT 0, paused INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','abandoned')),
  revision INTEGER NOT NULL DEFAULT 0, commands TEXT NOT NULL DEFAULT '[]',
  final_equity INTEGER, end_ms INTEGER, end_day TEXT,
  UNIQUE(player_id, request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS rounds_active ON rounds(player_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS rounds_owner ON rounds(player_id, started_ms DESC);
CREATE INDEX IF NOT EXISTS rounds_retention ON rounds(day);
CREATE TABLE IF NOT EXISTS verified_scores (
  round_id TEXT PRIMARY KEY REFERENCES rounds(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  day TEXT NOT NULL, rate REAL NOT NULL, profit INTEGER NOT NULL, finished_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS score_rate ON verified_scores(day, rate DESC, finished_ms, round_id);
CREATE INDEX IF NOT EXISTS score_profit ON verified_scores(day, profit DESC, finished_ms, round_id);
CREATE INDEX IF NOT EXISTS score_owner ON verified_scores(day, player_id);
CREATE TABLE IF NOT EXISTS ad_intents (
  nonce TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  round_id TEXT REFERENCES rounds(id) ON DELETE CASCADE, day TEXT NOT NULL,
  feature TEXT NOT NULL CHECK(feature IN ('extra','credit','emergency','stop')),
  created_ms INTEGER NOT NULL, verified_ms INTEGER, transaction_id TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS ad_intent_owner ON ad_intents(player_id, created_ms);
CREATE INDEX IF NOT EXISTS ad_intent_retention ON ad_intents(day);
CREATE TABLE IF NOT EXISTS ad_receipts (id TEXT PRIMARY KEY, received_ms INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ad_receipt_retention ON ad_receipts(received_ms);
CREATE TABLE IF NOT EXISTS security_events (day TEXT NOT NULL, reason TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(day, reason));
CREATE TABLE IF NOT EXISTS scalping_maintenance (id INTEGER PRIMARY KEY CHECK(id = 1), day TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS charge_round AFTER INSERT ON rounds BEGIN
  INSERT INTO quotas(player_id, day, used, bonus) VALUES (NEW.player_id, NEW.day, 0, 0) ON CONFLICT DO NOTHING;
  UPDATE quotas SET bonus = bonus - CASE WHEN used >= 5 THEN 1 ELSE 0 END, used = min(5, used + 1)
   WHERE player_id = NEW.player_id AND day = NEW.day AND (used < 5 OR bonus > 0);
  SELECT CASE WHEN changes() = 0 THEN RAISE(ABORT, 'quota_exhausted') END;
END;
CREATE TRIGGER IF NOT EXISTS persist_score AFTER UPDATE OF status ON rounds
  WHEN OLD.status = 'active' AND NEW.status = 'completed' BEGIN
  INSERT INTO verified_scores (round_id, player_id, day, rate, profit, finished_ms)
    VALUES (NEW.id, NEW.player_id, NEW.end_day, (NEW.final_equity - 100000000) / 1000000.0,
            NEW.final_equity - 100000000, NEW.end_ms);
END;
CREATE TRIGGER IF NOT EXISTS grant_extra AFTER UPDATE OF verified_ms ON ad_intents
  WHEN OLD.verified_ms IS NULL AND NEW.verified_ms IS NOT NULL AND NEW.feature = 'extra' BEGIN
  UPDATE quotas SET bonus = min(1, bonus + 1) WHERE player_id = NEW.player_id AND day = NEW.day AND used = 5;
END;
