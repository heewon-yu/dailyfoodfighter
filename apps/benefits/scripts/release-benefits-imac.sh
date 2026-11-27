#!/usr/bin/env bash
# Publish the Policy Benefit Matcher without GitHub Actions.
# Run on the owner's iMac only; requires authenticated Wrangler, Docker and npm.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BLOG="${1:-$HOME/dailyfoodfighter}"
cd "$ROOT"
echo "[1/8] Update source and blog (fast-forward only)"
git pull --ff-only
git -C "$BLOG" pull --ff-only
echo "[2/8] Run Python collector regression tests (NO external API requests)"
docker compose run --rm --no-deps collector python -m unittest discover -s tests -v
echo "[3/8] Run web personalization tests and type checks"
npm test
npm run check
echo "[4/8] Check Cloudflare Worker types before any production deployment"
(cd worker && npm install --no-audit --no-fund && npm run check)
echo "[5/8] Stage ONLY benefits static pages in existing blog"
bash scripts/stage-blog-benefits.sh "$BLOG"
git -C "$BLOG" diff --cached --stat
if ! git -C "$BLOG" diff --cached --quiet; then
    git -C "$BLOG" commit -m "feat: publish updated policy benefits matching and filters"
    git -C "$BLOG" push origin main
fi
echo "[6/8] Deploy Worker with D1 scheduled expiry purge"
(cd worker && npx wrangler deploy)
echo "[7/8] Remove definitively closed/expired D1 rows now (not archive)"
TODAY="$(TZ=Asia/Seoul date +%Y-%m-%d)"
(cd worker && npx wrangler d1 execute policy-benefit-db --remote --command "DELETE FROM programs WHERE status IN ('ARCHIVED','CLOSED') OR (end_date IS NOT NULL AND end_date < '$TODAY');")
echo "[8/8] Validate safe configuration before enabling 5 daily Docker slots"
if docker compose run --rm --no-deps collector python -c  'from scheduler import ready; import sys; print("official source and D1 configured:", ready()); sys.exit(0 if ready() else 2)'; then
    docker compose up -d --force-recreate collector
    docker compose ps
else
    echo "STOP: Existing local .env is missing official keys, ingest URL or token. Container NOT started."
    exit 2
fi
echo "DONE: blog source pushed, Worker deployed, expired D1 rows deleted, collector running."
echo "Check HTTPS pages and /benefits/api/programs responses before declaring production verified."
