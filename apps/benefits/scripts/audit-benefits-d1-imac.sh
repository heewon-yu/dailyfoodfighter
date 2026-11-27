#!/usr/bin/env bash
# READ-ONLY inspection of the live Cloudflare D1. Never exports profiles or secrets.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/worker"
command -v npx >/dev/null || { echo "npx unavailable" >&2; exit 2; }
echo "== Active/unknown support records by source =="
npx wrangler d1 execute policy-benefit-db --remote --command "
  SELECT source,COUNT(*) AS active_rows,
    SUM(CASE WHEN application_type='UNKNOWN' THEN 1 ELSE 0 END) AS undated_rows,
    SUM(CASE WHEN source='GOV24'
                AND json_extract(eligibility_json,'$.details_enriched')=1
             THEN 1 ELSE 0 END) AS gov24_detail_rows
  FROM programs
  GROUP BY source ORDER BY source;
"
echo "== Candidates for national childcare benefits (candidate counts, not eligibility proof) =="
npx wrangler d1 execute policy-benefit-db --remote --command "
  WITH targets(label,word) AS (
    VALUES ('부모급여','부모급여'),
           ('영유아보육료','영유아보육료'),
           ('어린이집 보육료','보육료'),
           ('가정양육수당','가정양육수당'),
           ('유아학비','유아학비'),
           ('아이돌봄서비스','아이돌봄')
  )
  SELECT targets.label,COUNT(programs.id) AS candidate_rows,
    SUM(CASE WHEN programs.application_type='UNKNOWN' THEN 1 ELSE 0 END) AS undated,
    GROUP_CONCAT(DISTINCT programs.source) AS sources
  FROM targets LEFT JOIN programs
    ON (programs.title LIKE '%' || targets.word || '%'
        OR programs.summary LIKE '%' || targets.word || '%')
   AND programs.status NOT IN ('ARCHIVED','CLOSED')
  GROUP BY targets.label ORDER BY targets.label;
"
echo "== Childcare candidate titles, up to 40 records =="
npx wrangler d1 execute policy-benefit-db --remote --command "
  SELECT source,source_id,title,application_type,start_date,end_date,
    json_extract(eligibility_json,'$.details_enriched') AS details_enriched
  FROM programs
  WHERE status NOT IN ('ARCHIVED','CLOSED')
    AND (title LIKE '%부모급여%' OR title LIKE '%보육료%'
         OR title LIKE '%양육수당%' OR title LIKE '%유아학비%' OR title LIKE '%아이돌봄%')
  ORDER BY source,title LIMIT 40;
"
echo "Read-only D1 coverage audit complete."
