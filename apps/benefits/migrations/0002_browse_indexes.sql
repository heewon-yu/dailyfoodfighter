CREATE INDEX IF NOT EXISTS programs_browse_created_idx
  ON programs(created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS programs_browse_category_created_idx
  ON programs(category, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS programs_national_title_idx
  ON programs(source, REPLACE(title, ' ', ''));

-- The enrichment worker only needs Gov24 records awaiting detail.
CREATE INDEX IF NOT EXISTS programs_pending_gov24_idx
  ON programs(source, updated_at DESC, source_id)
  WHERE source='GOV24' AND status NOT IN ('ARCHIVED','CLOSED')
    AND COALESCE(json_extract(eligibility_json,'$.details_enriched'),0)<>1;
