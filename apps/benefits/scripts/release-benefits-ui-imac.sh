#!/usr/bin/env bash
# Publish the benefits matching + browse UI without starting/changing the collector.
# Usage: bash scripts/release-benefits-ui-imac.sh "$HOME/dailyfoodfighter"
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BLOG="${1:-$HOME/dailyfoodfighter}"
cd "$ROOT"
[[ -z "$(git status --porcelain)" ]] || { echo "STOP: policy repo has uncommitted changes"; exit 1; }
git pull --ff-only
[[ -d "$BLOG/.git" ]] || { echo "STOP: blog checkout not found";exit 1; }
[[ -z "$(git -C "$BLOG" status --porcelain)" ]] || { echo "STOP: blog has uncommitted changes";exit 1; }
git -C "$BLOG" pull --ff-only

echo "[1/4] Match, territory and frontend regression tests"
npm test
npm run check
(
  cd worker
  npm run check
)

echo "[2/4] Deploy API Worker needed for subtopic filters"
(
  cd worker
  npx wrangler deploy
)

echo "[3/4] Stage ONLY the /benefits static files"
bash scripts/stage-blog-benefits.sh "$BLOG"
unwanted="$(git -C "$BLOG" diff --cached --name-only | grep -v '^benefits/' || true)"
[[ -z "$unwanted" ]] || { echo "STOP: non-benefits changes staged: $unwanted" >&2; exit 1; }
if ! git -C "$BLOG" diff --cached --quiet; then
  git -C "$BLOG" commit -m "feat(benefits): deploy comprehensive personal matching and granular browse UI"
  git -C "$BLOG" push origin main
fi

echo "[4/4] Check public endpoints (Pages auto-deploy may still be pending)"
for p in /benefits/ /benefits/privacy/ /benefits/api/programs /games/300-seconds/ /games/scalping-king/; do
  /usr/bin/curl -LsS -o /dev/null -w "$p %{http_code}\n" "https://dailyfoodfighter.com$p"
done
echo "UI release pushed. Confirm Cloudflare Pages production points at the new commit."
echo "Collector was NOT started and no external Gov24/Bizinfo API requests were made."
