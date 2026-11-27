#!/usr/bin/env bash
# Import official public program evidence into a separate D1 staging table.
# Public programs, user profiles, live search and source/API quotas are untouched.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
MODE="${1:---dry-run}"
if [[ "$MODE" != "--dry-run" && "$MODE" != "--apply-remote" ]]; then
  echo "Usage: bash scripts/stage-official-to-d1-imac.sh [--dry-run|--apply-remote]" >&2
  exit 2
fi

mkdir -p audit-artifacts
echo "== Exporting saved original official snapshots from persistent Docker state; no API calls =="
docker compose run --rm --no-deps \
  -v "$PWD/audit-artifacts:/export" collector \
  python -c 'import shutil; shutil.copytree("/state/read-only-catalog", "/export/read-only-catalog", dirs_exist_ok=True)'

echo "== Validating and merging original snapshots (no D1 writes) =="
python3 scripts/build-manual-full-data.py --baseline /nonexistent
python3 scripts/build-d1-staging-sql.py
echo "== SQL staging plan =="
python3 -c 'import json; p="audit-artifacts/d1-staging/manifest.json"; d=json.load(open(p)); print("Public program rows untouched:",d["public_programs_unchanged"]); print("Sources:",d["sources"]); print("Records:",d["records"],"SQL chunks:",d["sql_chunks"])'

if [[ "$MODE" == "--dry-run" ]]; then
  echo "DRY RUN COMPLETE. No remote D1 writes. Run with --apply-remote after review."
  exit 0
fi

command -v npx >/dev/null || { echo "npx required" >&2; exit 2; }
echo "== Writing official evidence into remote D1 staging table only =="
cd "$ROOT/worker"
npx wrangler d1 execute policy-benefit-db --remote \
  --file="../migrations/0003_official_source_snapshots.sql"
for sql in "$ROOT"/audit-artifacts/d1-staging/stage-*.sql; do
  echo "Staging $(basename "$sql")"
  npx wrangler d1 execute policy-benefit-db --remote --file="$sql"
done
echo "== Remote D1 staging verification =="
npx wrangler d1 execute policy-benefit-db --remote --command \
  "SELECT source,COUNT(*) AS total, SUM(detail_complete) AS detail_count, SUM(conditions_complete) AS conditions_count, SUM(CASE WHEN detail_complete=1 AND conditions_complete=1 THEN 1 ELSE 0 END) AS both_count FROM official_source_snapshots GROUP BY source ORDER BY source;"
echo "== Public programs unchanged; no Worker deployment or publish performed =="
