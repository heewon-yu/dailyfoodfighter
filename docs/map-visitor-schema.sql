-- All three map tabs share one counter. Count one visit per browser per KST day.
CREATE TABLE IF NOT EXISTS map_visit_sessions (
  day TEXT NOT NULL,
  visitor_key TEXT NOT NULL,
  PRIMARY KEY(day, visitor_key)
);
CREATE TABLE IF NOT EXISTS map_visit_counts (
  period TEXT PRIMARY KEY,
  visits INTEGER NOT NULL DEFAULT 0
);
-- The counter starts at deployment; historical traffic cannot be reconstructed.
