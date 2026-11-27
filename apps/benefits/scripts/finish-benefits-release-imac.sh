#!/usr/bin/env bash
# Safe iMac-assisted release of the benefits Worker and static Pages frontend.
# Must be run by the operator with their existing local Cloudflare/GitHub login.
# Never runs GitHub Actions, never triggers official data collection,
# and never restarts a collector that might be handling a scheduled batch.
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BLOG="${1:-$HOME/dailyfoodfighter}"
cd "$ROOT"

echo "[1/7] Fetch latest reviewed fix"
git pull --ff-only
if [[ ! -d "$BLOG/.git" ]]; then
  echo "ERROR: dailyfoodfighter local checkout not found at $BLOG" >&2
  exit 2
fi
git -C "$BLOG" pull --ff-only

echo "[2/7] Frontend tests and type checking"
npm test
npm run check

echo "[3/7] Isolated Python unit tests (MUST NOT call official APIs)"
# Test process is a disposable 'compose run' container with its own /tmp state.
# No changes to the live collector-state Docker volume and no bootstrap command.
docker compose run --rm --no-deps \
  -v "$ROOT:/repo:ro" -w /repo/collector \
  -e STATE_DIR=/tmp/benefits-tests \
  -e GOV24_DAILY_FULL_CATALOG=NO \
  -e GOV24_INCREMENTAL_ENABLED=NO \
  -e CONFIRM_GOV24_BULK_QUOTA=NO \
  collector python -m unittest discover -s tests -v

echo "[4/7] Worker checks and deployment"
(
  cd worker
  npm run check
  npm test
  npx wrangler deploy
)
echo "[5/7] Publish only benefits/ to the blog GitHub main"
# Built static assets are committed under benefits/ only. Cloudflare Pages
# deployment depends on the site's existing GitHub integration.
bash scripts/release-personalization-imac.sh "$BLOG"

echo "[6/7] Confirm public Worker health (read-only)"
if command -v curl >/dev/null; then
  curl --fail --silent --show-error --max-time 20 \
    "https://policy-benefit-api.leemovie89.workers.dev/api/health" || \
    echo "WARNING: Live Worker health could not be verified from this iMac."
else
  echo "WARNING: curl unavailable; check /api/health manually."
fi

echo
echo "[7/7] Deployment handoff"
echo "Worker deploy and blog source push steps completed without a shell error."
echo "Verify the new Cloudflare Pages deployment is successful at:"
echo "  https://dailyfoodfighter.com/benefits/"
echo "Do NOT start an additional manual Gov24 bootstrap."
echo "When no scheduled collection is running, apply the new collector code:"
echo "  cd ~/policy-benefit-matcher && docker compose restart collector"
echo "For a read-only D1 childcare coverage report:"
echo "  cd ~/policy-benefit-matcher && /bin/bash scripts/audit-benefits-d1-imac.sh"
