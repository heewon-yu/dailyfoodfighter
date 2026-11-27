# GSC 색인 요청 우선순위 메모

2026-11-28 08:00 GSC(Google Search Console) 수동 색인 요청 때 아래 순서로 제출한다.
제출 전 각 URL의 HTTP 200과 `robots` 메타(`index, follow`)를 확인한다.

## 최우선 (1순위)

| 순위 | URL | 성격 | 확인 |
| --- | --- | --- | --- |
| 1 | `https://dailyfoodfighter.com/card/` | 2026-11-27 신규 공개 — 이달의 카드지도(카드 발급 캐시백·유형별 추천 TOP 5). `sitemap.xml`·IndexNow 반영 완료 | 메타 `index, follow`, canonical, OG/Twitter, JSON-LD |

## 2순위 — 신규·개편 서브페이지

| URL | 비고 |
| --- | --- |
| `https://dailyfoodfighter.com/` | 메인 3×3 서비스 그리드에 `/card/` 9번째 카드 추가, title·description·OG에 카드 키워드 반영 |
| `https://dailyfoodfighter.com/hotel/` | 힐튼포숙지도 개편분(주말숙박권 달력 1개월) |
| `https://dailyfoodfighter.com/cal/` | 계산기 12종 페이지 |
| `https://dailyfoodfighter.com/air/` | 마일지도 — 19차 배치 반영 |

## 3순위 — 신뢰 페이지(간접 신호)

`/about/` · `/editorial-policy/` · `/privacy/` · `/contact/` — `/card/` 서비스 안내와 카드 정보 원칙(공식 카드사 공지 기준, 참고용) 반영 완료.

## 체크리스트

1. `https://dailyfoodfighter.com/sitemap.xml`에 `/card/` 포함 여부 확인
2. IndexNow: `bash scripts/ping-indexnow.sh --sitemap` (또는 `/card/` 단일 URL)
3. GSC URL 검사 → 색인 요청 → 결과(발견됨/색인됨) 기록
4. 48시간 후 `site:dailyfoodfighter.com/card` 노출 확인
