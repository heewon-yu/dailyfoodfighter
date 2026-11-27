#!/usr/bin/env bash
set -euo pipefail

# Build the benefits app and copy the static export into the blog's /benefits/.
# Run from anywhere inside the dailyfoodfighter repository.
#
#   bash apps/benefits/scripts/stage-blog-benefits.sh
#
# This script never touches the blog homepage, posts, games, Pages Functions,
# or the Jekyll-only landing pages benefits/business-funding · benefits/government-support.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"         # apps/benefits
BLOG="$(cd "$ROOT/../.." && pwd)"                                # repository root
cd "$ROOT"

if [[ ! -f package.json || ! -f svelte.config.js ]]; then
  echo "ERROR: not inside apps/benefits" >&2; exit 1
fi
if [[ ! -f "$BLOG/_config.yml" || ! -d "$BLOG/benefits" || ! -d "$BLOG/functions/benefits" ]]; then
  echo "ERROR: expected dailyfoodfighter repository root at $BLOG" >&2; exit 1
fi

# Never deploy OG metadata pointing at a missing image.
test -s "$ROOT/static/og-benefits-20261119.jpg" || {
  echo "ERROR: apps/benefits/static/og-benefits-20261119.jpg is missing." >&2
  exit 2
}

printf 'apps/benefits/ should not be committed with build output:\n'
git -C "$BLOG" status --porcelain -- apps/benefits/build apps/benefits/.svelte-kit apps/benefits/node_modules | head -5 || true

npm run build:blog

test -f build/index.html
test -f build/privacy/index.html
test -d build/app/immutable
test -s build/og-benefits-20261119.jpg
grep -q '정부지원금·청년·주거·출산육아·창업 정책자금 맞춤 검색' build/index.html || {
  echo "ERROR: keyword meta title missing from build/index.html" >&2; exit 1
}
grep -q 'application/ld+json' build/index.html
grep -q 'application/ld+json' build/privacy/index.html

# Replace only the generated parts of benefits/. Hashed assets are content-addressed,
# so the old app/ directory is dropped entirely instead of being merged.
rm -rf "$BLOG/benefits/app" "$BLOG/benefits/privacy"
cp -a build/app "$BLOG/benefits/app"
cp -a build/privacy "$BLOG/benefits/privacy"
cp build/index.html "$BLOG/benefits/index.html"
cp build/og-benefits-20261119.jpg "$BLOG/benefits/og-benefits-20261119.jpg"

# Jekyll-only landing pages must survive the sync.
test -f "$BLOG/benefits/business-funding/index.html"
test -f "$BLOG/benefits/government-support/index.html"

git -C "$BLOG" add -A -- benefits/
echo
echo "STAGED benefits/ files only. Review with:"
echo "  git -C '$BLOG' diff --cached --stat"
echo "Then commit and push; Cloudflare Pages builds and serves /benefits/."
