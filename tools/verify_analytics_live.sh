#!/bin/bash
# 실서버 전수 검증: 네이버 애널리틱스 + GA4 블록이 각 1회, 도메인 가드 포함
URLS=(
"/"
"/en/"
"/blog/"
"/posts/lemon-nutrition-benefits/"
"/en/posts/lemon-nutrition-benefits/"
"/about/"
"/privacy/"
"/contact/"
"/editorial-policy/"
"/nutrition-calculator/"
"/air/"
"/air/calendar/"
"/air/first/"
"/air/guide/"
"/air/journey/"
"/air/map/"
"/air/mileage/"
"/air/new/"
"/air/route/"
"/air/status/"
"/hotel/"
"/hotel/points-stay/"
"/hotel/weekend-reward/"
"/macro/"
"/macro/fear-greed/"
"/macro/rates-inflation/"
"/card/"
"/map/"
"/map/restaurants/"
"/map/stays/"
"/map/overseas/"
"/cal/"
"/cal/basic/"
"/cal/age/"
"/games/"
"/games/300-seconds/"
"/games/hormuz/"
"/games/rhythm-classic/"
"/games/scalping-king/"
"/games/scalping-king/privacy/"
"/benefits/"
"/benefits/privacy/"
"/benefits/business-funding/"
"/category/ingredients/"
"/tags/"
)
printf "%-36s %3s %3s %3s %3s %s\n" "URL" "WCS" "GJ" "CFG" "GRD" "verdict"
fail=0
for u in "${URLS[@]}"; do
  body=$(curl -s -m 25 -w "\n__CODE__%{http_code}" "https://dailyfoodfighter.com${u}?v=$RANDOM")
  code=$(printf '%s' "$body" | tail -1 | sed 's/__CODE__//')
  wa=$(printf '%s' "$body" | grep -c 'wcs_add\["wa"\] = "1fdda5e32ec26f0"')
  ws=$(printf '%s' "$body" | grep -c 'wcs.pstatic.net/wcslog.js')
  gj=$(printf '%s' "$body" | grep -c 'googletagmanager.com/gtag/js?id=G-KBV8HQ5J6Z')
  gc=$(printf '%s' "$body" | grep -c "gtag('config', 'G-KBV8HQ5J6Z')")
  gd=$(printf '%s' "$body" | grep -c "host !== 'dailyfoodfighter.com' && host !== 'www.dailyfoodfighter.com'")
  if [ "$wa" = "1" ] && [ "$ws" = "1" ] && [ "$gj" = "1" ] && [ "$gc" = "1" ] && [ "$gd" = "1" ] && [ "$code" = "200" ]; then
    v="OK"
  else
    v="FAIL"; fail=$((fail+1))
  fi
  printf "%-36s %3s %3s %3s %3s %5s %s\n" "$u" "$ws" "$gj" "$gc" "$gd" "$code" "$v"
done
echo "FAILS=$fail / ${#URLS[@]}"
