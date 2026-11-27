#!/usr/bin/env bash
# Safe iMac release without GitHub Actions. Never prints .env or secrets.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BLOG="${1:-$HOME/dailyfoodfighter}"
cd "$ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "STOP: collector checkout has local modifications. Commit/stash manually." >&2; exit 1
fi
git pull --ff-only
if [[ ! -d "$BLOG/.git" ]]; then
  echo "STOP: blog checkout missing at $BLOG" >&2; exit 1
fi
if [[ -n "$(git -C "$BLOG" status --porcelain)" ]]; then
  echo "STOP: blog checkout has modifications. Preserve them first." >&2; exit 1
fi
git -C "$BLOG" pull --ff-only

# User confirmed source quotas (10000/1000) and five KST slots. Preserve secrets.
bash scripts/configure-imac-collector.sh

echo "1/5 Offline regression checks"
npm test
npm run check
(
  cd worker
  npm install --no-audit --no-fund
  npm run check
)
docker compose run --rm --no-deps collector python -m unittest discover -s tests -v

echo "2/5 Guarded Cloudflare Worker deployment"
(
  cd worker
  npx wrangler deploy
)
# Immediately purge definitively closed/expired D1 rows after publishing the
# new authenticated delete endpoint. No API-usage quota is consumed here.
docker compose run --rm --no-deps collector python purge.py

echo "3/5 Generate and stage /benefits/ only"
bash scripts/stage-blog-benefits.sh "$BLOG"
echo "4/5 Verify staged scope and publish using existing Pages Git integration"
if git -C "$BLOG" diff --cached --name-only | grep -v '^benefits/' ; then
  echo "STOP: changes outside benefits detected" >&2; exit 1
fi
if ! git -C "$BLOG" diff --cached --quiet; then
  git -C "$BLOG" commit -m "feat(benefits): release approved-quota matching and browse filters"
  git -C "$BLOG" push origin main
fi

echo "5/5 Restart local scheduled collector (10,12,14,16,18 KST)"
# Repo .env may contain old explicitly-set limits. Never override silently.
if [[ -f .env ]]; then
  for name in COLLECTOR_SOURCE GOV24_APPROVED_DAILY_CALLS BIZINFO_APPROVED_DAILY_CALLS API_BUDGET_PERCENT GOV24_DAILY_FULL_CATALOG CONFIRM_GOV24_BULK_QUOTA; do
    if grep -qE "^[[:space:]]*${name}=" .env; then
      echo "NOTICE: .env explicitly sets ${name}; verify user-approved value privately."
    fi
  done
fi
docker compose up -d --force-recreate collector
echo "Release commands completed. Cloudflare Pages Git deployment is asynchronous:"
echo "Verify the deployed Pages commit and then run:"
echo '  for path in /benefits/ /benefits/privacy/ /benefits/api/programs /games/300-seconds/ /games/scalping-king/; do'
echo '    /usr/bin/curl -LsS -o /dev/null -w "$path HTTP %{http_code}\\n" "https://dailyfoodfighter.com$path"'
echo '  done'
echo "Do not treat HTTP 200 alone as matching/data correctness proof."
