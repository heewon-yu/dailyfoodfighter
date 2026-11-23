-- Execute once on the D1 database bound as MAP_VISITS_DB.
CREATE TABLE IF NOT EXISTS map_visit_sessions (
  day TEXT NOT NULL,
  view TEXT NOT NULL CHECK (view IN ('food', 'stay', 'abroad')),
  visitor_key TEXT NOT NULL,
  PRIMARY KEY(day, view, visitor_key)
);
CREATE TABLE IF NOT EXISTS map_visit_counts (
  view TEXT NOT NULL CHECK (view IN ('food', 'stay', 'abroad')),
  period TEXT NOT NULL,
  visits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(view, period)
);
-- The count includes one visit per browser per map per KST date.
-- Visits before deployment are not backfilled.
