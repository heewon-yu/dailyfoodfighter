#!/usr/bin/env bash
set -euo pipefail
# Take the 1200x630 JPEG downloaded from this conversation.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${1:-$HOME/Downloads/benefits-og-20261119.jpg}"
DEST="$ROOT/static/og-benefits-20261119.jpg"
if [[ ! -f "$SOURCE" ]]; then
  echo "Missing sharing image: $SOURCE" >&2
  echo "Save the generated JPEG as benefits-og-20261119.jpg in Downloads." >&2
  exit 2
fi
[[ -x /usr/bin/sips ]] || { echo "macOS sips command is missing" >&2; exit 2; }
SIZE="$(/usr/bin/sips -g pixelWidth -g pixelHeight "$SOURCE" 2>/dev/null)"
echo "$SIZE" | grep -q 'pixelWidth: 1200' || { echo "Share image width must be 1200px" >&2; exit 2; }
echo "$SIZE" | grep -q 'pixelHeight: 630' || { echo "Share image height must be 630px" >&2; exit 2; }
mkdir -p "$ROOT/static"
cp "$SOURCE" "$DEST"
echo "Share image installed: $DEST"
echo "Next: /bin/bash scripts/release-personalization-imac.sh"
