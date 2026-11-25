# P0 기술 SEO·GSC·GA4 전수검증 기준선 (2026-11-25)

작성: 2026-11-25 10:40 KST · 검증 대상 `https://dailyfoodfighter.com` (Cloudflare Pages) · 저장소 `heewon-yu/dailyfoodfighter`

이 문서는 'DailyFoodFighter SEO 최적화 및 검색 유입 극대화' P0 단계의 **실측 기준선**이다. 아래 수치는 모두 2026-11-25에 직접 측정한 값이며, 추정치는 추정이라고 표시했다.

---

## 0. 이번 P0에서 가장 중요한 발견 — 배포가 15분간 멈춰 있었다 (수정 완료)

- 증상: 09:44~09:54 커밋 5개(`8d0765b`, `d2e2e98`, `1b8fced`, `8b7afdb`, `b2cb870`)가 실서버에 반영되지 않음. 신규 계산기 페이지 404, 홈 식재료 검색 없음, 다시마·당근 글 제목이 수정 전 값, sitemap 142개(계산기 2개 누락).
- 원인: 커밋 메시지의 **`[skip ci]`**. 이 사이트는 GitHub 저장소 연동 Cloudflare Pages가 `main` 푸시마다 자동 빌드하는데(`docs/GPT_CODEX_MASTER_SPEC.md`, `map/README.md`), Cloudflare Pages는 커밋 메시지에 `[skip ci]`가 있으면 빌드를 건너뛴다. 당시 작업이 GitHub Actions만 피하려고 붙인 태그가 배포까지 막았다.
- 확인: `[skip ci]` 없는 `7fa8b94`(09:40 실제 404)·`cb9fd0f`(09:41)는 반영, `[skip ci]` 붙은 09:44 이후 커밋은 전부 미반영. 10:31 일반 메시지로 푸시(`63e0659`)하자 밀린 5개까지 함께 배포되어 계산기 200·sitemap 144 확인.
- **운영 규칙: 이 저장소 커밋 메시지에 `[skip ci]`를 쓰지 않는다.** (일일 포스팅 액션의 커밋 메시지에는 원래 없음 → 매일 발행분은 정상 배포)

---

## 1. 검사 환경

| 항목 | 결과 |
| --- | --- |
| 로컬 Jekyll 빌드 | **불가** — 이 작업 환경에 `ruby`·`jekyll`·`bundle` 미설치(Python 3.12만 존재). Jekyll 3/4 렌더링은 실서버 HTML로만 확인 |
| 실서버 검사 | `_seo/p0_deep_audit.py` (Python, urllib+lxml, 8 workers) — sitemap 전수 + 내부링크·이미지 전수 + JSON-LD 파싱 |
| FAQ 대조 | `_seo/faq_check.py` — FAQPage JSON-LD 질문/답변과 렌더 본문 텍스트 대조 |
| USDA 값 검증 | `https://api.nal.usda.gov/fdc/v1/food/{id}` (공개 DEMO_KEY, 무료·읽기 전용) |
| GSC/GA4 | 브라우저 직접 접속, `leemovie89@gmail.com` 프로필, 실적 CSV 내보내기로 원자료 확보 |

재실행:

```
python3 _seo/p0_deep_audit.py --out /tmp/p0_audit.json
python3 _seo/faq_check.py https://dailyfoodfighter.com/posts/<slug>/
```

---

## 2. 실서버 전수 검사 결과 (배포 후, sitemap 144 URL)

| 검사 항목 | 결과 |
| --- | --- |
| sitemap URL 수 | 142 → **144** (계산기 2개 추가) |
| HTTP 200 / 최종 URL 일치 / 리디렉션 | **144/144 200, 리디렉션 0, 최종 URL 불일치 0** |
| canonical | 144/144 자체 canonical 일치 |
| hreflang | 62쌍 + 계산기 1쌍 **상호 참조 100%**, x-default 포함, 고아 hreflang 0 |
| robots meta | sitemap 내 noindex 0 |
| title/description | 누락 0, 중복 0 (privacy·contact 4개는 이번에 고유 description 부여) |
| h1 | 전 페이지 1개 |
| GA4 `G-KBV8HQ5J6Z` | 144/144 탑재 |
| AdSense `ca-pub-7921440641343288` | 144/144 스크립트+meta 탑재 |
| viewport | 144/144 탑재 |
| JSON-LD | 400블록 파싱 오류 0, 페이지당 Article/BlogPosting 중복 0, FAQPage 124개 질문-본문 불일치 0(수정 후) |
| 내부 링크 | 144개 고유 대상 **전부 200**, 404 링크 0, 301/308 리디렉션 링크 0, trailing slash 누락 링크 0 |
| 이미지 | 63개(`img src`+`og:image`) **전부 200**, 404 0 |
| 비정상 URL 5종 (`/nonexistent-test-…`, `/en/nonexistent-…`, `/posts/nonexistent-…/`, `/category/nonexistent/`, 무슬래시 변형) | **전부 실제 HTTP 404**, soft 404 아님(404 템플릿 2,535바이트) |

### 구조 요약
- 게시물 124편(한/영 62쌍) + 카테고리 8 + 정책·허브 10 + 계산기 2 = 144
- 모든 게시물: BlogPosting + BreadcrumbList + FAQPage, 허브 글 12편은 ItemList 추가
- 약점(콘텐츠): contact 136단어, en/contact 129단어, privacy 293~369단어 — 얇은 페이지(P1)

---

## 3. 신규 기능 실서버 검증

### 3.1 계산기 `/nutrition-calculator/`, `/en/nutrition-calculator/`
- 배포 후 200, 한/영 상호 hreflang, `WebPage` JSON-LD, GA4·AdSense·viewport 정상, 표 5행 + JS 렌더 확인.
- **산식 검증(브라우저 실조작)**: `100g 기준값 × 가식부 g ÷ 100`, 소수 표기 kcal 1자리·단백질 2자리.

| 식재료 | 선택 라벨 | 100g 결과(실측) | USDA FDC 원값 |
| --- | --- | --- | --- |
| 달걀 | 달걀 (생것·가식부) | 143.0 kcal · 6.28 g(50g) / 143.0 kcal(100g) | FDC 171287 = 143 kcal, 12.56 g |
| 두부 | 일반 두부 (황산칼슘 응고) | 76.0 kcal · 8.08 g | FDC 172476 = 76 kcal, 8.08 g |
| 닭가슴살 | 닭가슴살 (생것·껍질 제거) | 120.0 kcal · 22.50 g | FDC 171077 = 120 kcal, 22.5 g |
| 사과 | 사과 (생것·껍질 포함) | 52.0 kcal · 0.26 g | FDC 171688 = 52 kcal, 0.26 g |
| 바나나 | 바나나 (생것·가식부) | 89.0 kcal · 1.09 g | FDC 173944 = 89 kcal, 1.09 g |

- 합계 검증: 기본값(달걀 50g + 두부 100g) = 147.5 kcal · 14.36 g ✓ / 닭가슴살 100g+두부 100g = 196.0 kcal · 30.58 g ✓
- 입력 검증: 6000g 입력 시 "0~5000g 사이의 무게를 입력하세요" 표시, 결과 `—` ✓
- JS 배열 `[[143,12.56],[76,8.08],[120,22.5],[52,0.26],[89,1.09]]`와 표 값 일치 ✓

### 3.2 닭가슴살 기준 차이 (확인 결과)
- 계산기: FDC 171077(생것·껍질·뼈 제거) **120 kcal / 22.5 g**
- 닭가슴살 가이드 본문 표: **110 kcal / 23.1 g / 지방 1.24 g / 수분 74.8 g** — USDA FDC 171077과 일치하지 않음(국내 성분표 계열 값으로 보이나 본문은 "USDA FoodData Central"로 표기 → **출처 표기 불일치, P1 콘텐츠 검수 대상**)
- 본문 '한 줄 결론'이 지방 **2.6 g**으로 표(1.24 g)와 모순 → **1.24 g로 정정(이번 커밋)**
- 계산기 표 아래에 차이를 명시하는 안내 문단을 한/영으로 추가(무단 대체 금지 원칙 준수)

### 3.3 홈 식재료 검색 `/`, `/en/`
- `dff-find` 섹션 정상 노출(초기 `hidden` → JS 활성), 62개 가이드 카드 대상 필터 동작.
- "계란" 입력 → 달걀 2건 표시(별칭 매핑 동작) ✓, 결과 카운트/무결과 문구 정상.

---

## 4. Google Search Console 실측 (2026-11-25 10:05, 데이터 11-24까지)

### 4.1 실적
| 기간 | 클릭 | 노출 | CTR | 평균 게재순위 |
| --- | --- | --- | --- | --- |
| 최근 7일 (11/16~11/22) | 0 | 49 | 0% | 46.9 |
| 최근 28일 (10/28~11/22) | 3 | 962 | 0.3% | 46.5 |

일자별 노출: 11/13 188 · 11/14 207 · 11/15 174 → **11/16 4 · 11/17 8 · 11/18 7 · 11/19 18 · 11/20 3**. 11/13~15 급등 후 급락(동시에 순위 45.9→55.6→67.2로 악화). 3일간의 일시적 노출 확대였다는 해석이 가능하나 원인 미확정 → 관찰 항목.

기기(28일): 데스크톱 2클릭/802노출/0.25%/52.3위 · 모바일 1/156/0.64%/**17.4위** · 태블릿 0/4/10.3위 → 모바일 순위가 압도적으로 좋음(모바일 색인·노출 우선).

국가(28일, 노출 상위): 미국 331(0.3%, 43.9위) · 한국 75(1.33%, 31.3위) · 캐나다 66(61.3위) · 영국 75(61.2위) · 인도 63(46.3위) · 브라질 50(36.8위) · 호주 36(70.6위).

### 4.2 검색어 (28일 375행)
- 노출 상위: `tofu protein per 100g` 11(85.8위) · `banana nutrition` 11(88.3) · `vitamins in bananas` 10(78) · **`palak keerai nutrients` 9(5.7)** · `protein in eggs` 6(16.7) · `effect of shrimp on creatinine` 6(21.5) · `banana carbohydrates` 6(83.2)
- **개선 후보(평균 순위 4~20위, 노출 2회 이상) — 7건**
  1. `palak keerai nutrients` 9노출 · 5.67위
  2. `protein in eggs` 6 · 16.67
  3. `how much protein does an egg have` 3 · 6.33
  4. `how many proteins in an egg` 3 · 6.67
  5. `mackerel fishmeal` 3 · 13.67
  6. `how much protein in an egg` 2 · 17.0
  7. `how many carbs in a banana` 2 · 20.0
  - 노출 1회 포함 시 4~20위 후보는 37건(예: `how many calories in a banana`, `spinach oxalate` 계열 등)
- 7일 상위 검색어는 국문·영문 혼재: `블루 베리 효능` 2 · `달걀 단백질` 2 · `tokwa protein` 2 등 노출 1~2회, 순위 54~100위.

### 4.3 페이지 (28일)
`/en/posts/banana-…` 249노출(56.5위) · `/en/posts/spinach-…` 100(51.8) · `/en/posts/carrot-…` 73(57.6) · `/en/posts/egg-…` 62(50.6) · `/en/posts/chicken-breast-…` 54(29.5) · `/en/posts/mackerel-…` 45(28.0) · `/en/posts/oyster-…` 44(57.6) · `/en/posts/garlic-…` 39(37.8) · `/posts/shrimp-…` 25(34.9) · `/en/posts/onion-…` 24(**8.58**) · `/en/posts/blueberry-…` 23(67.9)
- 클릭 발생: `/en/posts/tofu-…` 2클릭(2.94%) · `/en/about/` 1클릭 — 28일 클릭 3건 전부.

### 4.4 색인 (보고서 최종 업데이트 11-16)
- 색인 생성됨 **53** / 색인 안 됨 **6**
  - 리디렉션이 포함된 페이지 **1**: `https://dailyfoodfighter.com/en`
  - 발견됨 - 현재 색인이 생성되지 않음 **5**: `/category/수산물/`, `/en/category/meat/`, `/en/posts/broccoli-…`, `/en/privacy/`, `/posts/onion-…`
- 색인된 53개 구성: 게시물 42 + 카테고리 6 + 정적 5(/ · /en/ · about 2 · privacy)
- **사이트맵 142개 중 89개는 Google이 아직 모르는 상태**. 124편 중 색인된 게시물은 34%.

### 4.5 사이트맵
`/sitemap.xml` 11-17 제출, 11-22 마지막 읽기, 상태 성공, **발견된 페이지 130**(당시 142 중). `/feed.xml` 113, `/feed-ko.xml` 57. → 11-22 이후 신규 12개는 다음 읽기에서 반영 예상, 현재 sitemap 144.

### 4.6 '리디렉션 관련 색인 문제' 원인 규명 (11-19 알림)
- 대상 URL은 **`https://dailyfoodfighter.com/en`** 1건(슬래시 없음). 최근 크롤 11-18 02:10, 11-12 검증 시작 → 11-17 "검증 실패".
- 원인: Cloudflare Pages가 디렉터리 경로를 **308로 `/en/`에 정규화**한다(실측: `/en` → 308 → `/en/`, `/posts/<slug>` → 308 → `/posts/<slug>/`). Google은 리디렉션 응답을 색인할 수 없으므로 이 URL은 영구히 '리디렉션이 포함된 페이지'로 남고, 재검증도 실패한다.
- `/en`이 어디서 발견됐는지: **사이트맵·RSS·피드·현재 144개 페이지의 내부 링크 어디에도 `/en`(무슬래시) 없음**(전수 확인). 과거 URL 검사·색인 요청 또는 외부 링크로 유입된 것으로 판단(추정).
- 판정: **기술적 결함 아님.** `/en/`이 자체 canonical로 정상 색인되므로 추가 조치 불필요. 검증은 "수정됨"으로 처리되지 않으며 무시해도 된다. 단, 앞으로 색인 요청은 항상 **슬래시가 붙은 URL**로 제출한다(무슬래시 제출 시 308로 되돌아와 같은 항목이 다시 생김).
- GSC 추가 관찰: 코어 웹 바이탈 데이터 없음(URL 36, 11-16 기준) · 탐색경로 유효 19 · HTTPS 36 · 권장사항: `/en/posts/banana-…` 노출 -72%, `/en/posts/tofu-…` +771%.

---

## 5. GA4 실측 (같은 계정, 속성 dailyfoodfighter.com, "거의 완전한 데이터" — Gold 샘플 아님 확인)

### 5.1 요약
| 지표 | 최근 7일(11/18~11/24) | 최근 28일(10/28~11/24) |
| --- | --- | --- |
| 세션 | 61 | 288 |
| 참여 세션 | 14 (22.95%) | 79 (27.43%) |
| 세션당 평균 참여 시간 | 14초 | 13초 |
| 이벤트 | 206 (3.38/세션) | 1,531 (5.32/세션) |
| 페이지뷰 | — | 540 |
| 활성 사용자 | — | 235 (사용자당 조회 2.30, 사용자당 참여 16초) |
| 주요 이벤트(전환) | 0 | 0 |

### 5.2 유입 (세션 소스/매체)
| 소스/매체 | 28일 세션 | 참여율 | 세션당 참여시간 |
| --- | --- | --- | --- |
| (direct) | 209 (72.6%) | 26.3% | 12초 |
| (not set) | 33 (11.5%) | 0% | 6초 |
| youtube.com/referral | 13 | 53.8% | 5초 |
| google/organic | **11 (3.8%)** | 54.5% | 15초 |
| m.search.daum.net/referral | 7 | 42.9% | 1분03초 |
| t.co/referral | 7 | 57.1% | 5초 |
| daum/organic | 5 | 60.0% | 58초 |
| bing/organic | 1 | — | — |
| chatgpt.com/ai-assistant | 1 | — | 14초 |
| dataindex.pro/referral | 2 | — | — |

- **자연검색 합계(28일): 17세션**(google 11 · daum 5 · bing 1). 7일은 6세션(google 1 · daum 4 · bing 1).
- **네이버 유입 0** — 국내 검색 채널 부재가 뚜렷한 공백.
- 직접 유입 72.6%는 대부분 운영자 본인·X/youtube 등 비검색 유입으로 보인다(추정).

### 5.3 페이지 (28일, 조회수 상위)
`/` 242(44.8%, 사용자 161, 1.5회/사용자, 8초) · `/posts/onion-…` 29 · `/category/과일/` 28 · `/posts/tomato-…` 25 · `/category/채소/` 22 · `/posts/blueberry-…` 20 · `/en/` 19 · `/category/육류/` 14 · `/about/` 8 · `/category/수산물/` 8
- `/nutrition-calculator/`·`/en/nutrition-calculator/` 조회 **0** — 11-25 09:54에 배포된 신규 페이지라 정상(수집 불가 아님, 실제 0건).
- '추가 페이지 이동' 프록시: 사용자당 조회 2.30회(28일). 카테고리 페이지가 상위에 있는 것은 목록→글 이동이 일어난다는 뜻.
- 랜딩 페이지(세션 기준) 표: 이 속성의 기본 보고서 모음에는 '랜딩 페이지' 보고서가 없고 '페이지 및 화면'(조회수 기준)만 제공되어 **세션 기준 랜딩 페이지 수치는 표준 보고서에서 수집 불가**. 등가 지표로 페이지별 조회수·사용자수와 유입 소스(§5.2)를 쓴다. 필요하면 탐색(Exploration)에서 세션 랜딩 페이지 측정기준으로 별도 생성해야 한다.

---

## 6. 이번 P0에서 수정한 내용 (커밋 `63e0659`)

1. **FAQPage JSON-LD 질문 문구를 렌더 본문과 일치**시킴 — 9개 글 11건
   - black-soybean(백태), duck(en, "Should I eat the skin?"), oyster kr 2건(검은 테두리, “R자 … 말라”), oyster en(R 규칙), shrimp en(alimentary tract), mackerel kr 2건(혈합육, 간고등어), mackerel en(chiai), garlic en·apple en(kramdown 스마트 인용부호로 본문과 달라진 것 포함)
2. **privacy·contact 4페이지 고유 meta description** 부여(기존에는 사이트 기본 설명 중복)
3. **닭가슴살 '한 줄 결론' 지방 2.6 g → 1.24 g** (본문 표·front matter와 일치)
4. **계산기에 닭가슴살 기준 차이 명시 문단 추가**(한/영) — 가이드 110 kcal·23.1 g vs 계산기 FDC 171077 120 kcal·22.5 g
5. 감사 스크립트 `_seo/p0_deep_audit.py`, `_seo/faq_check.py` 추가

배포: `[skip ci]` 없이 푸시 → Cloudflare Pages 빌드 성공 → 실서버 재검증에서 144 URL 전부 200, FAQ 불일치 0, description 중복 0. GSC 색인 요청: `/nutrition-calculator/` **11-25 제출 완료**, `/en/nutrition-calculator/`은 일일 할당량 초과로 **11-26 제출 필요**.

---

## 7. 남은 과제

### P1
- **색인 커버리지**: 124편 중 34%만 색인. 신규 글은 발행 당일 sitemap·IndexNow(정상), GSC 수동 색인 요청은 일 10건 한도. 우선순위는 ①노출 있는데 미색인(banana en·spinach en은 색인됨, broccoli en·onion kr 미색인) ②카테고리(/category/수산물/, /en/category/meat/) ③정책 페이지(/en/privacy/).
- **닭가슴살 본문 표 출처 표기**: 표 값(110 kcal·23.1 g·1.24 g·수분 74.8 g)이 USDA FDC 171077과 불일치. 식약처/농진청 값과도 완전 일치하지 않아 원 출처 확인 후 표기 수정 또는 FDC 171077 값으로 교체 검토(계산기와 통일).
- **의학·영양 주장 검수**: `audit_posts.py` 결과 medical_claim_review 72편 / direct_reference_link_review 111편 그대로. P0에서 손대지 않음.
- 얇은 페이지(contact 136단어 등) 보강 또는 색인 우선순위 하향.
- `palak keerai nutrients`(5.67위)·달걀 단백질 질문형(6~17위) 등 4~20위 후보 7건에 대한 1차 의도 최적화(제목·첫 문단·표·FAQ 정합).

### P2
- 11/13~15 노출 급등 후 급락 원인 추적(색인 변동인지 순위 변동인지).
- 네이버 유입 0 — 네이버 서치어드바이저 수집·RSS 반영 상태 점검(현재 RSS 자동발견 태그는 있음).
- 코어 웹 바이탈 데이터 확보(현재 GSC에 데이터 없음).
- 계산기 확장은 검증된 FDC food ID와 가식부 기준이 확인된 식품만 추가.
