CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('FUND','WELFARE')),
  title TEXT NOT NULL,
  agency TEXT,
  summary TEXT,
  support_amount TEXT,
  amount_type TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(amount_type IN ('LOAN','GRANT','CASH','SERVICE','UNKNOWN')),
  target_types TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(target_types)),
  region_sido TEXT,
  region_sigungu TEXT,
  min_age INTEGER,
  max_age INTEGER,
  max_business_years INTEGER,
  income_limit_percent INTEGER,
  start_date TEXT,
  end_date TEXT,
  application_type TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(application_type IN ('DATED','ROLLING','UNKNOWN')),
  apply_url TEXT NOT NULL,
  eligibility_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(eligibility_json)),
  needs_review INTEGER NOT NULL DEFAULT 1 CHECK(needs_review IN (0,1)),
  content_hash TEXT,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  last_verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source, source_id)
);
CREATE INDEX IF NOT EXISTS programs_filter_idx ON programs(category, region_sido, end_date);
CREATE INDEX IF NOT EXISTS programs_updated_idx ON programs(updated_at);
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  status TEXT NOT NULL,
  imported INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);
-- User profiles are intentionally not stored server-side in the initial privacy-first MVP.
