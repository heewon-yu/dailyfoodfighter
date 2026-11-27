#!/usr/bin/env bash
# Configure ONLY nonsecret, user-confirmed operational settings in local .env.
# Existing API keys and ingest tokens are never printed or overwritten.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[[ -f .env ]] || { echo "STOP: local .env missing. Create it with approved API keys and D1 ingest token first." >&2; exit 1; }

# Fail closed on missing private credentials, without echoing their contents.
for key in GOV24_API_KEY BIZINFO_API_KEY INGEST_URL INGEST_TOKEN; do
  if ! grep -qE "^[[:space:]]*${key}=.+$" .env; then
    echo "STOP: credential ${key} is unset in local .env (value was not displayed)." >&2
    exit 1
  fi
done

# File is kept at 0600 and edited atomically. Avoid gnu sed on macOS.
chmod 600 .env
tmp="$(mktemp "$ROOT/.collector-env.XXXXXX")"
trap 'rm -f "$tmp"' EXIT
chmod 600 "$tmp"
cp .env "$tmp"
set_value() {
  local key="$1" value="$2" next
  next="$(mktemp "$ROOT/.collector-env.XXXXXX")"
  chmod 600 "$next"
  awk -v key="$key" -v value="$value" '
    BEGIN { found=0 }
    $0 ~ "^[[:space:]]*" key "=" { if(!found){ print key "=" value;found=1 };next }
    { print }
    END { if(!found) print key "=" value }
  ' "$tmp" > "$next"
  mv -f "$next" "$tmp"
}
set_value "COLLECTOR_SOURCE" "all"
set_value "GOV24_APPROVED_DAILY_CALLS" "10000"
set_value "BIZINFO_APPROVED_DAILY_CALLS" "1000"
set_value "API_BUDGET_PERCENT" "90"
set_value "GOV24_MAX_PAGES" "5"
set_value "GOV24_PER_PAGE" "100"
set_value "GOV24_DETAIL_LIMIT" "20"
set_value "GOV24_BACKFILL_ENABLED" "YES"
set_value "GOV24_DAILY_FULL_CATALOG" "YES"
set_value "CONFIRM_GOV24_BULK_QUOTA" "YES"
set_value "BIZINFO_MAX_PAGES" "50"
mv -f "$tmp" .env
trap - EXIT
chmod 600 .env
echo "Collector ready for user-confirmed 10000 / 1000 daily quotas at 90% budget."
echo "All private values remain in the local .env, never printed or committed."
