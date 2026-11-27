#!/usr/bin/env bash
# Frontend-only precision matching release (region, child age, income).
# Does NOT deploy Worker, touch production D1, or restart the iMac collector.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BLOG="${1:-$HOME/dailyfoodfighter}"
cd "$ROOT"
git pull --ff-only
git -C "$BLOG" pull --ff-only
npm test
npm run check
bash scripts/stage-blog-benefits.sh "$BLOG"
git -C "$BLOG" diff --cached --stat
if ! git -C "$BLOG" diff --cached --quiet; then
  git -C "$BLOG" commit -m "feat(benefits): precise region filters and conservative eligibility review"
  git -C "$BLOG" push origin main
fi
echo "Frontend source pushed. Verify the Cloudflare Pages production deployment, then the three region browse modes."
echo "This is a static frontend update; it does NOT redeploy the already-working Worker,"
echo "and does NOT activate API quota changes, D1 deletion or Docker collection."
