#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# 힐튼포숙지도 1차 라인업 (Waldorf Astoria / Conrad / LXR) 생성
# 소스: hilton.com 브랜드별 Locations 디렉터리 (비로그인, 2026-11-27 KST 조회)
# 실행: python3 hotel/scripts/build_luxury.py  →  hotel/scripts/data/hotels_luxury.json
import json, collections, pathlib

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / "data" / "hotels_luxury.json"

# code | name | brand | city | country | cc | region | status
RAW = """
osawawa|Waldorf Astoria Osaka|wa|Osaka|Japan|JP|일본|open
shawawa|Waldorf Astoria Shanghai on the Bund|wa|Shanghai|China|CN|중국·동남아|open
shaqtwa|Waldorf Astoria Shanghai Qiantan|wa|Shanghai|China|CN|중국·동남아|open
bjswawa|Waldorf Astoria Beijing|wa|Beijing|China|CN|중국·동남아|open
xmnwawa|Waldorf Astoria Xiamen|wa|Xiamen|China|CN|중국·동남아|open
ctuwawa|Waldorf Astoria Chengdu|wa|Chengdu|China|CN|중국·동남아|open
bkkwawa|Waldorf Astoria Bangkok|wa|Bangkok|Thailand|TH|중국·동남아|open
kulwawa|Waldorf Astoria Kuala Lumpur|wa|Kuala Lumpur|Malaysia|MY|중국·동남아|open
mleonwa|Waldorf Astoria Maldives Ithaafushi|wa|Ithaafushi Island|Maldives|MV|남아시아·몰디브|open
mctahwa|Al Husn Hotel Muscat|wa|Muscat|Oman|OM|중동·아프리카|open
rktwawa|Waldorf Astoria Ras Al Khaimah|wa|Ras Al Khaimah|U.A.E|AE|중동·아프리카|open
dxbwawa|Waldorf Astoria Dubai International Financial Centre|wa|Dubai|U.A.E|AE|중동·아프리카|open
dxbpdwa|Waldorf Astoria Dubai Palm Jumeirah|wa|Dubai|U.A.E|AE|중동·아프리카|open
helwcwa|Waldorf Astoria Helsinki|wa|Helsinki|Finland|FI|유럽|open
dohqtwa|Waldorf Astoria Doha Lusail|wa|Doha|Qatar|QA|중동·아프리카|open
dohnzwa|Waldorf Astoria Doha West Bay|wa|Doha|Qatar|QA|중동·아프리카|open
kwiwawa|Waldorf Astoria Kuwait|wa|Kuwait City|Kuwait|KW|중동·아프리카|open
msqwawa|Waldorf Astoria Minsk|wa|Minsk|Belarus|BY|유럽|open
jhmgwwa|Grand Wailea, A Waldorf Astoria Resort|wa|Wailea, Hawaii|USA|US|미주|open
ogghowa|Ho'olei at Grand Wailea|wa|Wailea, Hawaii|USA|US|미주|open
jrswawa|Waldorf Astoria Jerusalem|wa|Jerusalem|Israel|IL|중동·아프리카|open
berwawa|Waldorf Astoria Berlin|wa|Berlin|Germany|DE|유럽|open
jedwawa|Waldorf Astoria Jeddah - Qasr Al Sharq|wa|Jeddah|Saudi Arabia|SA|중동·아프리카|open
caiwewa|Waldorf Astoria Cairo Heliopolis|wa|Cairo|Egypt|EG|중동·아프리카|open
amswawa|Waldorf Astoria Amsterdam|wa|Amsterdam|Netherlands|NL|유럽|open
sezpiwa|Waldorf Astoria Seychelles Platte Island|wa|Platte Island|Seychelles|SC|중동·아프리카|open
lonenwa|Waldorf Astoria London - Admiralty Arch|wa|London|United Kingdom|GB|유럽|coming_soon
romhiwa|Rome Cavalieri, A Waldorf Astoria Hotel|wa|Rome|Italy|IT|유럽|open
cdgtpwa|Waldorf Astoria Versailles - Trianon Palace|wa|Versailles|France|FR|유럽|open
slcdmwa|Waldorf Astoria Park City|wa|Park City, Utah|USA|US|미주|open
laxwawa|Waldorf Astoria Beverly Hills|wa|Beverly Hills, California|USA|US|미주|open
laswdwa|Waldorf Astoria Las Vegas|wa|Las Vegas, Nevada|USA|US|미주|open
snamowa|Waldorf Astoria Monarch Beach|wa|Dana Point, California|USA|US|미주|open
chiwawa|Waldorf Astoria Chicago|wa|Chicago, Illinois|USA|US|미주|open
rbartwa|Waldorf Astoria Rabat Salé|wa|Rabat-Salé|Morocco|MA|중동·아프리카|open
sjdwawa|Waldorf Astoria Los Cabos Pedregal|wa|Cabo San Lucas|Mexico|MX|미주|open
nycwawa|Waldorf Astoria New York|wa|New York, New York|USA|US|미주|open
dcawawa|Waldorf Astoria Washington DC|wa|Washington, DC|USA|US|미주|open
atlwawa|Waldorf Astoria Atlanta Buckhead|wa|Atlanta, Georgia|USA|US|미주|open
msyrhwa|The Roosevelt New Orleans, A Waldorf Astoria Hotel|wa|New Orleans, Louisiana|USA|US|미주|open
orlbcwa|Waldorf Astoria Orlando - An Official Walt Disney World Hotel|wa|Orlando, Florida|USA|US|미주|open
cunwawa|Waldorf Astoria Riviera Maya, an All-Inclusive Experience|wa|Cancún (Riviera Maya)|Mexico|MX|미주|open
lirguwa|Waldorf Astoria Costa Rica Punta Cacique|wa|Guanacaste|Costa Rica|CR|미주|open
lirrswa|Waldorf Astoria Residences Costa Rica Punta Cacique|wa|Guanacaste|Costa Rica|CR|미주|residence_only
ptytpwa|Waldorf Astoria Panama|wa|Panama City|Panama|PA|미주|open
selcici|Conrad Seoul|co|Seoul|South Korea|KR|한국|open
dlczdci|Conrad Dalian|co|Dalian|China|CN|중국·동남아|open
sheyaci|Conrad Shenyang|co|Shenyang|China|CN|중국·동남아|open
osacici|Conrad Osaka|co|Osaka|Japan|JP|일본|open
shawsci|Conrad Shanghai|co|Shanghai|China|CN|중국·동남아|open
tsntnci|Conrad Tianjin|co|Tianjin|China|CN|중국·동남아|open
ngocici|Conrad Nagoya|co|Nagoya|Japan|JP|일본|open
bjscici|Conrad Beijing|co|Beijing|China|CN|중국·동남아|open
hghfrci|Conrad Hangzhou|co|Hangzhou|China|CN|중국·동남아|open
hghyfci|Conrad Hangzhou Tonglu|co|Hangzhou (Tonglu)|China|CN|중국·동남아|open
tyocici|Conrad Tokyo|co|Tokyo|Japan|JP|일본|open
xmncici|Conrad Xiamen|co|Xiamen|China|CN|중국·동남아|open
canxwci|Conrad Guangzhou|co|Guangzhou|China|CN|중국·동남아|open
ckgcici|Conrad Chongqing|co|Chongqing|China|CN|중국·동남아|open
szxcici|Conrad Shenzhen|co|Shenzhen|China|CN|중국·동남아|open
hkghcci|Conrad Hong Kong|co|Hong Kong|Hong Kong SAR|HK|중국·동남아|open
mfmcsci|Conrad Macao|co|Macau|Macao SAR|MO|중국·동남아|open
jzhcici|Conrad Jiuzhaigou|co|Jiuzhaigou|China|CN|중국·동남아|open
mnlmbci|Conrad Manila|co|Pasay City (Metro Manila)|Philippines|PH|중국·동남아|open
syxsaci|Sunshine Yi Hotel Haitang Bay, Sanya|co|Sanya|China|CN|중국·동남아|open
urccici|Conrad Urumqi|co|Urumqi|China|CN|중국·동남아|open
aatcici|Conrad Altay Hemu|co|Altay (Hemu)|China|CN|중국·동남아|open
bkkqpci|Conrad Bangkok Sukhumvit Queen's Park|co|Bangkok|Thailand|TH|중국·동남아|coming_soon
bkkreci|Conrad Bangkok Residences|co|Bangkok|Thailand|TH|중국·동남아|open
bkkcici|Conrad Bangkok|co|Bangkok|Thailand|TH|중국·동남아|open
usmksci|Conrad Koh Samui|co|Koh Samui|Thailand|TH|중국·동남아|open
kulskci|Conrad Kuala Lumpur|co|Kuala Lumpur|Malaysia|MY|중국·동남아|coming_soon
sincici|Conrad Singapore Marina Bay|co|Singapore|Singapore|SG|중국·동남아|open
sinodci|Conrad Singapore Orchard|co|Singapore|Singapore|SG|중국·동남아|open
bpncici|Conrad Bali|co|Bali|Indonesia|ID|중국·동남아|open
pnqcici|Conrad Pune|co|Pune|India|IN|남아시아·몰디브|open
blrkrci|Conrad Bengaluru|co|Bengaluru|India|IN|남아시아·몰디브|open
mlehici|Conrad Maldives Rangali Island|co|Rangali Island|Maldives|MV|남아시아·몰디브|open
dxbcdci|Conrad Dubai|co|Dubai|U.A.E|AE|중동·아프리카|open
auhetci|Conrad Abu Dhabi Etihad Towers|co|Abu Dhabi|U.A.E|AE|중동·아프리카|open
bahfhci|Conrad Bahrain Financial Harbour|co|Manama|Bahrain|BH|중동·아프리카|open
ruhstci|Conrad Riyadh Laysen Valley|co|Riyadh|Saudi Arabia|SA|중동·아프리카|open
isthcci|Conrad Istanbul Bosphorus|co|Istanbul|Türkiye|TR|유럽|open
hamshci|Conrad Hamburg|co|Hamburg|Germany|DE|유럽|open
makcici|Conrad Jabal Omar Makkah|co|Makkah|Saudi Arabia|SA|중동·아프리카|open
athgrci|Conrad Athens The Ilisian|co|Athens|Greece|GR|유럽|open
cfumoci|Conrad Corfu|co|Corfu|Greece|GR|유럽|coming_soon
loncoci|Conrad London St. James|co|London|United Kingdom|GB|유럽|open
dubhcci|Conrad Dublin|co|Dublin|Ireland|IE|유럽|open
olbclci|Conrad Chia Laguna Sardinia|co|Domus de Maria (Sardinia)|Italy|IT|유럽|open
laxavci|Conrad Los Angeles|co|Los Angeles, California|USA|US|미주|open
lascdci|Conrad Las Vegas at Resorts World|co|Las Vegas, Nevada|USA|US|미주|open
pptbnci|Conrad Bora Bora Nui|co|Bora Bora|French Polynesia|PF|오세아니아·카리브|open
faoapci|Conrad Algarve|co|Almancil (Algarve)|Portugal|PT|유럽|open
rbacici|Conrad Rabat Arzana|co|Harhoura (Rabat)|Morocco|MA|중동·아프리카|open
indcici|Conrad Indianapolis|co|Indianapolis, Indiana|USA|US|미주|open
nyccici|Conrad New York Downtown|co|New York, New York|USA|US|미주|open
bnaleci|Conrad Nashville|co|Nashville, Tennessee|USA|US|미주|open
wascici|Conrad Washington, DC|co|Washington, DC|USA|US|미주|open
pvrpmci|Conrad Punta de Mita|co|Punta de Mita|Mexico|MX|미주|open
orlcici|Conrad Orlando at Evermore|co|Orlando, Florida|USA|US|미주|open
fllcici|Conrad Fort Lauderdale Beach|co|Fort Lauderdale, Florida|USA|US|미주|open
cuncici|Conrad Tulum Riviera Maya, an All-Inclusive Experience|co|Tulum|Mexico|MX|미주|open
itmolol|ROKU KYOTO, LXR Hotels & Resorts|lx|Kyoto|Japan|JP|일본|open
tyoolol|Gajoen Tokyo|lx|Tokyo|Japan|JP|일본|open
dpsolol|Umana Bali, LXR Hotels & Resorts|lx|Bali|Indonesia|ID|중국·동남아|open
blrolol|The Den Bengaluru, LXR Hotels and Resorts|lx|Bengaluru|India|IN|남아시아·몰디브|open
auhptol|The Mangroves Abu Dhabi, LXR Hotels & Resorts|lx|Abu Dhabi|U.A.E|AE|중동·아프리카|open
dohqkol|Katara Hills Doha, LXR Hotels & Resorts|lx|Doha|Qatar|QA|중동·아프리카|open
dohtpol|The Plaza Doha, LXR Hotels & Resorts|lx|Doha|Qatar|QA|중동·아프리카|open
dohpaol|Maysan Doha, LXR Hotels & Resorts|lx|Al Rayyan Area, Doha|Qatar|QA|중동·아프리카|open
hnlwiol|Ka La'i Waikiki Beach, LXR Hotels & Resorts|lx|Honolulu, Hawaii|USA|US|미주|open
oololol|Imperial Hotel Gold Coast|lx|Gold Coast|Australia|AU|오세아니아·카리브|open
bjvlxol|Susona Bodrum, LXR Hotels & Resorts|lx|Bodrum|Türkiye|TR|유럽|open
jtrblol|Sandblu Santorini, LXR Hotels & Resorts|lx|Santorini|Greece|GR|유럽|open
sezitol|Mango House Seychelles, LXR Hotels & Resorts|lx|Mahé|Seychelles|SC|중동·아프리카|open
paretol|Sax Paris, LXR Hotels & Resorts|lx|Paris|France|FR|유럽|open
smoolol|Oceana Santa Monica, LXR Hotels & Resorts|lx|Santa Monica, California|USA|US|미주|open
laxmcol|Cameo Beverly Hills, LXR Hotels & Resorts|lx|Los Angeles, California|USA|US|미주|open
lascfol|Crockfords Las Vegas, LXR Hotels & Resorts|lx|Las Vegas, Nevada|USA|US|미주|open
sancnol|Beach Village at The Del, LXR Hotels & Resorts|lx|Coronado, California|USA|US|미주|open
sanrhol|Shore House at The Del, LXR Hotels & Resorts|lx|Coronado, California|USA|US|미주|open
phxbmol|Arizona Biltmore, LXR Hotels & Resorts|lx|Phoenix, Arizona|USA|US|미주|open
axazbol|Zemi Beach House, LXR Hotels & Resorts|lx|West Indies (Anguilla)|Anguilla|AI|오세아니아·카리브|open
"""

BRAND_LABEL = {"wa": "Waldorf Astoria Hotels & Resorts", "co": "Conrad Hotels & Resorts", "lx": "LXR Hotels & Resorts"}
BRAND_SHORT = {"wa": "Waldorf Astoria", "co": "Conrad", "lx": "LXR"}
STATUS_LABEL = {
    "open": "영업 중",
    "coming_soon": "개관 예정(예약 불가)",
    "pre_opening": "프리오프닝(예약 불가)",
    "residence_only": "레지던스(호텔 아님)",
}
STATUS_NOTE = {
    "lonenwa": "Waldorf Astoria London – Admiralty Arch, 2027년 개관 예정",
    "bkkqpci": "Conrad Bangkok Sukhumvit Queen's Park, 개관 예정(Coming Soon 표기)",
    "kulskci": "Conrad Kuala Lumpur, 2027-02-01부터 예약 접수(Coming Soon)",
    "cfumoci": "Conrad Corfu, 2027-05-15 개관 예정(Coming Soon)",
    "lirrswa": "Waldorf Astoria Residences Costa Rica — 분양 레지던스, 숙박 예약 대상 아님",
    "bkkreci": "Conrad Bangkok Residences — 레지던스형 객실, 힐튼 예약 대상",
    "syxsaci": "Conrad 브랜드로 힐튼 디렉터리에 등재된 파트너 호텔(쓰야오지 시그니처)",
}

hotels, seen = [], set()
for line in RAW.strip().splitlines():
    code, name, brand, city, country, cc, region, status = [p.strip() for p in line.split("|")]
    assert len(code) == 7 and code.islower(), code
    assert code not in seen, "dup " + code
    seen.add(code)
    rec = {
        "code": code,
        "name": name,
        "brand": brand,
        "brandLabel": BRAND_LABEL[brand],
        "brandShort": BRAND_SHORT[brand],
        "city": city,
        "country": country,
        "countryCode": cc,
        "region": region,
        "url": f"https://www.hilton.com/en/hotels/{code}/",
        "status": status,
        "statusLabel": STATUS_LABEL[status],
    }
    if code in STATUS_NOTE:
        rec["note"] = STATUS_NOTE[code]
    hotels.append(rec)

by_brand = collections.Counter(h["brand"] for h in hotels)
by_region = collections.Counter(h["region"] for h in hotels)
by_status = collections.Counter(h["status"] for h in hotels)
open_by_region = collections.Counter(h["region"] for h in hotels if h["status"] == "open")
open_by_brand = collections.Counter(h["brand"] for h in hotels if h["status"] == "open")

out = {
    "meta": {
        "project": "힐튼포숙지도 (/hotel/) 1차 하이엔드 라인업",
        "generatedAt": "2026-11-27T14:45:00+09:00",
        "observedAt": "2026-11-27 14:20~14:45 KST (비로그인 브라우저)",
        "source": "hilton.com 브랜드별 Locations 디렉터리 (Waldorf Astoria / Conrad / LXR) — 로그인 없이 조회한 공식 목록",
        "sourceUrls": [
            "https://www.hilton.com/en/locations/resorts/waldorf-astoria/",
            "https://www.hilton.com/en/locations/conrad-hotels/",
            "https://www.hilton.com/en/locations/lxr-hotels/",
        ],
        "urlPattern": "https://www.hilton.com/en/hotels/{code}/ → 정식 슬러그 URL로 302 리다이렉트(실측 확인)",
        "counts": {
            "total": len(hotels),
            "byBrand": dict(by_brand),
            "byRegion": dict(by_region),
            "byStatus": dict(by_status),
            "openByBrand": dict(open_by_brand),
            "openByRegion": dict(open_by_region),
            "openTotal": sum(1 for h in hotels if h["status"] == "open"),
        },
        "notes": [
            "힐튼 디렉터리 표기 수: Waldorf 45 / Conrad 58 / LXR 21 = 124건. 브리프 예상(80~90곳)보다 많은 것은 힐튼이 개관 예정·레지던스까지 디렉터리에 넣기 때문.",
            "실제 '영업 중' 호텔은 119건. 제외 5건: 개관예정 4(lonenwa·bkkqpci·kulskci·cfumoci), 레지던스 1(lirrswa).",
            "2026-11-27 15:39 KST 재확인: Waldorf Astoria Riviera Maya(cunwawa, 올인클루시브)는 당초 2027-01 개관 예정으로 두었으나, 힐튼 디렉터리 카드에 140,000P Standard Room Reward·₩988,254가 표시되고 리뷰 1,189건이 쌓여 있어 영업 중으로 전환했다(사용자 확인).",
            "권역 구분은 브리프의 한국·일본·중국/동남아·미주·유럽/중동 틀을 8개(한국/일본/중국·동남아/남아시아·몰디브/중동·아프리카/유럽/미주/오세아니아·카리브)로 세분.",
            "브랜드 표기가 회사명과 다른 호텔 포함: Al Husn Hotel Muscat(WA), Grand Wailea·Ho'olei(WA), The Roosevelt New Orleans(WA), Rome Cavalieri(WA), Gajoen Tokyo·Imperial Hotel Gold Coast(LXR), Sunshine Yi Hotel Haitang Bay(Conrad).",
            "호텔 코드는 hilton.com URL의 7자리 코드(대문자 변환 시 ctyhocn). 예: SELCICI, BKKWAWA, ITMOLOL.",
            "추가 확인: 힐튼 Locations 목록에서 'Use Points'를 켜면 20곳/페이지로 'Points/night + Standard Room Reward/Premium Room Rewards' 라벨이 나온다(브랜드 8페이지로 124건 스캔). 단 이 값은 '향후 30일 최저'이며 날짜 지정값이 아니다.",
            "날짜별 상세 요금은 /book/ 경로인데 hilton.com/robots.txt가 User-agent:*에 /book/·/find-hotels/·/search/를 Disallow 한다 — 대량 자동 수집 설계 전 확인 필요(measurement_hilton_com_2026-11-27.md 참조).",
            "브랜드 이탈 검증 예: Waldorf Astoria Edinburgh(구 Caledonian)는 2024-06 Curio로 이동해 이 목록에 없음(외부 보도 교차 확인).",
        ],
    },
    "hotels": hotels,
}

OUT.parent.mkdir(parents=True, exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)

print(json.dumps(out["meta"]["counts"], ensure_ascii=False, indent=2))
print("total", len(hotels), "→", OUT)
