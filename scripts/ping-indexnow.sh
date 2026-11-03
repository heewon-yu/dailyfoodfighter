#!/usr/bin/env bash
set -e

HOST="dailyfoodfighter.com"
KEY="c7438e83b8a14ec1a1961efce1d2f782"
KEY_LOCATION="https://dailyfoodfighter.com/c7438e83b8a14ec1a1961efce1d2f782.txt"

# If URLs passed as arguments, use them; otherwise, build from arguments or defaults
URL_LIST=()
if [ "$#" -gt 0 ]; then
  for url in "$@"; do
    URL_LIST+=("\"$url\"")
  done
else
  # Default URLs to ping
  URL_LIST+=("\"https://dailyfoodfighter.com/\"")
  URL_LIST+=("\"https://dailyfoodfighter.com/en/\"")
  URL_LIST+=("\"https://dailyfoodfighter.com/posts/tomato-nutrition-benefits/\"")
  URL_LIST+=("\"https://dailyfoodfighter.com/en/posts/tomato-nutrition-benefits/\"")
fi

URLS_JSON=$(IFS=,; echo "${URL_LIST[*]}")

PAYLOAD=$(cat <<EOF
{
  "host": "$HOST",
  "key": "$KEY",
  "keyLocation": "$KEY_LOCATION",
  "urlList": [
    $URLS_JSON
  ]
}
EOF
)

echo "=== [IndexNow Ping Request Payload] ==="
echo "$PAYLOAD"
echo "======================================"

# 1. IndexNow Universal API (Bing, Yandex, etc.)
echo -n "Pinging api.indexnow.org... "
STATUS_INDEXNOW=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json; charset=utf-8" -d "$PAYLOAD" "https://api.indexnow.org/indexnow" || true)
echo "HTTP $STATUS_INDEXNOW"

# 2. Bing IndexNow Direct API
echo -n "Pinging www.bing.com/indexnow... "
STATUS_BING=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json; charset=utf-8" -d "$PAYLOAD" "https://www.bing.com/indexnow" || true)
echo "HTTP $STATUS_BING"

# 3. Naver Search Advisor IndexNow API
echo -n "Pinging searchadvisor.naver.com/indexnow... "
STATUS_NAVER=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json; charset=utf-8" -d "$PAYLOAD" "https://searchadvisor.naver.com/indexnow" || true)
echo "HTTP $STATUS_NAVER"

echo "=== IndexNow Ping Completed ==="
