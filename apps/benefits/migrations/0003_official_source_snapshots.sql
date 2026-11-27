-- Staging only: original public-source API evidence. Does not alter public programs.
-- Idempotent by (source, source_id), retaining previously acquired detail fields.
CREATE TABLE IF NOT EXISTS official_source_snapshots (
  source TEXT NOT NULL CHECK(source IN ('GOV24','BIZINFO')),
  source_id TEXT NOT NULL,
  listing_json TEXT NOT NULL CHECK(json_valid(listing_json)),
  detail_json TEXT CHECK(detail_json IS NULL OR json_valid(detail_json)),
  conditions_json TEXT CHECK(conditions_json IS NULL OR json_valid(conditions_json)),
  listing_sha256 TEXT NOT NULL,
  detail_sha256 TEXT,
  conditions_sha256 TEXT,
  detail_complete INTEGER NOT NULL DEFAULT 0 CHECK(detail_complete IN (0,1)),
  conditions_complete INTEGER NOT NULL DEFAULT 0 CHECK(conditions_complete IN (0,1)),
  condition_review TEXT NOT NULL DEFAULT 'PENDING'
    CHECK(condition_review IN ('PENDING','REVIEWED')),
  captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(source, source_id)
);
CREATE INDEX IF NOT EXISTS official_source_snapshots_review_idx
 ON official_source_snapshots(source,condition_review,detail_complete,conditions_complete);
