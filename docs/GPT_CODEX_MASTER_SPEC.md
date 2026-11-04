# 🥑 DailyFoodFighter (dailyfoodfighter.com) AI 글작성 & 운영 마스터 통합 명세서
> **수익화 블로그 자동화 파이프라인 (작성 ➔ 발행 ➔ Cloudflare 배포 ➔ IndexNow 즉시 색인) 풀패키지 가이드**

---

## 1. 프로젝트 개요 및 배포 인프라

- **공식 커스텀 도메인:** `https://dailyfoodfighter.com`
- **호스팅 & 배포 인프라:** **Cloudflare Pages** (GitHub 저장소 연동 자동 빌드 & 배포)
  - **직접 접속 및 프리뷰 주소:** `https://dailyfoodfighter.pages.dev`
  - **장점:** 월 100GB 대역폭 제한 없는 **무제한 대역폭(0원 무지출)**, 글로벌 엣지 CDN 초고속 캐싱, 애드센스 등 상업적 광고 수익화 100% 공식 지원
  - **배포 방식:** `heewon-yu/dailyfoodfighter` 저장소의 `main` 브랜치에 Git Push 발생 시 Cloudflare Pages가 즉시 감지하여 자동 빌드(`jekyll build`) 및 수십 초 내 글로벌 무중단 배포 완료
- **핵심 목표:** 100가지 자연 식재료의 영양 성분·생체이용률·임상 효능을 다루는 전문 미디어로, 구글 애드센스 심사 100% 승인 및 영미권 고단가 CPC 광고 수익 창출
- **발행 규칙:** **[한국어 전문 1편 + 글로벌 영문 전문 1편]**을 세트로 동시 발행
- **테마 순환 체계:** 4대 카테고리 순환 (**과일 ➔ 채소·야채 ➔ 육류·단백질 ➔ 수산물**)

---

## 2. 참조용 실제 발행 완료 글 (벤치마크 레퍼런스 주소)

글을 작성할 때 반드시 아래 기발행 글의 구조, 표 서식, 톤앤매너, 광고 슬롯 위치를 1:1로 준수해야 합니다. (브라우저 주소창에 직접 입력하여 열람 가능)

### 🍅 1호: 토마토 (카테고리: 과일)
- **한국어 (KR) 공식 주소:**
  `https://dailyfoodfighter.com/posts/tomato-nutrition-benefits/`
  *(Cloudflare Pages 직통 주소: `https://dailyfoodfighter.pages.dev/posts/tomato-nutrition-benefits/`)*
- **글로벌 영문 (EN) 공식 주소:**
  `https://dailyfoodfighter.com/en/posts/tomato-nutrition-benefits/`
  *(Cloudflare Pages 직통 주소: `https://dailyfoodfighter.pages.dev/en/posts/tomato-nutrition-benefits/`)*

### 🫐 2호: 블루베리 (카테고리: 과일)
- **한국어 (KR) 공식 주소:**
  `https://dailyfoodfighter.com/posts/blueberry-nutrition-benefits/`
  *(Cloudflare Pages 직통 주소: `https://dailyfoodfighter.pages.dev/posts/blueberry-nutrition-benefits/`)*
- **글로벌 영문 (EN) 공식 주소:**
  `https://dailyfoodfighter.com/en/posts/blueberry-nutrition-benefits/`
  *(Cloudflare Pages 직통 주소: `https://dailyfoodfighter.pages.dev/en/posts/blueberry-nutrition-benefits/`)*

---

## 3. 애드센스 승인 & 수익 극대화 5단 본문 아키텍처

모든 글은 아래의 5단 황금 레이아웃을 엄격히 따라야 합니다:

```text
[H1 메인 제목]
      │
[대표 고화질 사진 (16:9)] + *▲ 이탤릭 캡션*
      │
[인트로 훅 (2개 단락)] - 흥미 유발 및 역사/영양 개요
      │
[--- 구분선]  ⭐⭐⭐ [구글 애드센스 최우선 상단 디스플레이 광고 골든 슬롯]
      │
[## 1. 핵심 영양 성분표 (100g 기준)] - USDA / 농진청 표준 마크다운 표
      │
[## 2. 과학적으로 입증된 4대 건강 효능] - H3 소제목 ① ~ ④ (생화학 기전 인용)
      │
[--- 구분선]  ⭐⭐ [중간 콘텐츠 연관 광고 슬롯]
      │
[## 3. 영양소 흡수율 극대화 조리·섭취 가이드] - 생식 vs 가열, 지질 시너지 궁합
      │
[## 4. 섭취 시 주의사항 및 부작용] - 과다 섭취, 기저 질환, 약물 상호작용
      │
[## 5. 최종 요약 및 실천 팁] - 권장 섭취량, 보관법, 1줄 실천 가이드
```

---

## 4. 언어별 Frontmatter 및 작성 규격

- **영양표 공통 규격:** 한·영 템플릿의 3열(영양 성분, 생것 100 g당 함량, 미국 %DV)을 사용합니다. %DV는 FDA 일일기준치로 계산하고, 해당 기준치가 없으면 ‘기준치 없음’ 또는 ‘No DV’로 표시합니다. 단백질은 g 단위로 표시하고 표 아래에서 이유를 설명합니다. 정량 수치는 출처를 확인한 경우에만 추가합니다.

### 🇰🇷 한국어 포스팅 (`_posts/YYYY-MM-DD-{식재료영문소문자}-nutrition-benefits.md`)
```yaml
---
layout: post
title: "{한글식재료명} 효능과 영양 성분의 과학적 진실: {핵심 질문/효능}"
date: YYYY-MM-DD 00:00:00 +0900
lang: ko
category: "과일" # 과일, 채소, 육류, 수산물 중 택 1
tags: [{식재료명}, {핵심영양소}, 항산화, 영양학, 건강식단]
description: "{식재료명}의 핵심 생리활성 물질 분석과 흡수율을 극대화하는 조리 섭취법 및 과학적 건강 효능을 정리합니다."
permalink: /posts/{식재료영문소문자}-nutrition-benefits/
---
```
- **글자 수:** 공백 제외 1,800 ~ 2,500자
- **문체:** 신뢰감 있는 건강 매거진 톤 (`해요`/`합니다` 조화, 학술 용어 병기)

### 🇺🇸 글로벌 영문 포스팅 (`_posts/YYYY-MM-DD-en-{식재료영문소문자}-nutrition-benefits.md`)
```yaml
---
layout: post
lang: en
title: "The Clinical Nutrition Science of {English Food Name}: Proven Benefits, Bioavailability, and Culinary Optimization"
date: YYYY-MM-DD 00:00:00 +0900
category: "Fruits" # Fruits, Vegetables, Meat, Seafood
tags: [{English Name}, {Key Nutrient}, Antioxidants, NutritionScience, EvidenceBased]
description: "A comprehensive clinical review evaluating {Scientific Name}, examining bioavailability kinetics, systemic health mechanisms, and culinary optimization."
permalink: /en/posts/{식재료영문소문자}-nutrition-benefits/
---
```
- **분량:** 800 ~ 1,200 단어
- **문체:** 미국·영국 고단가 타겟 임상 영양학 논문 스타일 (USDA FoodData Central, Bioavailability, In vivo kinetics 등)

---

## 5. 전체 파이프라인 작업 흐름 (End-to-End)

1. **식재료 선택:** `ingredients.md` 트래커에서 오늘 순환 카테고리의 미발행 `[ ]` 항목 선정
2. **대표 이미지 준비:** `assets/images/{식재료영문}.jpg`에 고화질 16:9 사진 배치
3. **한·영 글 작성:** `_posts/` 폴더에 위 규격대로 국문 1편, 영문 1편 작성
4. **트래커 갱신:** `ingredients.md`에서 해당 식재료를 `[x]`로 완료 체크
5. **Git 커밋 & 푸시:**
   ```bash
   git add .
   git commit -m "feat(post): add {식재료} bilingual post set"
   git push origin main
   ```
6. **Cloudflare Pages 자동 배포:** Push 즉시 Cloudflare Pages가 감지하여 30초 내 `https://dailyfoodfighter.com` 및 `https://dailyfoodfighter.pages.dev`에 글로벌 동시 반영
7. **검색엔진 즉시 색인(IndexNow) 강제 호출:**
   배포 직후 IndexNow API를 호출하여 네이버 서치어드바이저와 빙(Bing) 크롤러에 수분 내 즉시 수집 트리거:
   ```bash
   bash scripts/ping-indexnow.sh \
     "https://dailyfoodfighter.com/posts/{식재료영문}-nutrition-benefits/" \
     "https://dailyfoodfighter.com/en/posts/{식재료영문}-nutrition-benefits/"
   ```
   *(응답 코드 `HTTP 200` 확인 시 정상 수신 완료)*

---

## 6. GPT / 코덱스 원클릭 실행 프롬프트 (One-Prompt Command)

VS Code Copilot, Cursor, 또는 웹 ChatGPT에 아래 프롬프트를 그대로 복사해 입력하면 모든 과정이 오차 없이 완벽하게 수행됩니다:

```text
저장소의 docs/GPT_CODEX_MASTER_SPEC.md와 ingredients.md를 읽고, 아래 지침에 따라 오늘 순환 카테고리의 다음 식재료 포스팅 1세트(한국어 1편 + 영문 1편)를 작성해줘.

[작성 및 배포 필수 규칙]
1. 벤치마크 레퍼런스(토마토 및 블루베리 한·영 글)의 5단 황금 레이아웃 100% 준수
2. H1 제목 바로 아래에 대표 이미지 ![신선한...](/assets/images/{영문}.jpg) 및 이탤릭 캡션 배치
3. 인트로 2단락 직후 애드센스 골든 슬롯 '---' 삽입
4. USDA 기반 100g 표준 영양성분표 및 4대 임상 효능 서술
5. 작성 완료 후 ingredients.md 체크리스트를 [x]로 업데이트
6. 배포는 Cloudflare Pages 연동(Git Push 시 자동 무제한 배포)으로 진행됨
7. 푸시 완료 후 즉시 실행할 bash scripts/ping-indexnow.sh 네이버·빙 색인 핑 명령어 안내
```

---

## 7. 저장소 핵심 파일 맵

```text
dailyfoodfighter/
├── .github/
│   └── copilot-instructions.md     # 코덱스/Copilot 자동 인식 마스터 지침 (Cloudflare 배포 반영)
├── _posts/                         # 발행된 블로그 글 (한/영)
├── _templates/
│   ├── post-template-ko.md         # 국문 표준 템플릿
│   └── post-template-en.md         # 영문 표준 템플릿
├── assets/
│   ├── css/style.css               # 반응형 & 모바일 & 다크모드 스타일
│   └── images/                     # 식재료별 고화질 16:9 대표 이미지
├── docs/
│   ├── WRITING_MANUAL.md           # 공용 작성 매뉴얼 (Cloudflare 배포 반영)
│   └── GPT_CODEX_MASTER_SPEC.md    # [본 문서] 풀패키지 통합 마스터 명세서
├── scripts/
│   └── ping-indexnow.sh            # IndexNow 네이버/빙 즉시 색인 스크립트
├── _config.yml                     # Jekyll 설정, GA4, 네이버/구글 메타태그
├── feed.xml                        # 네이버 서치어드바이저용 RSS 2.0 피드
├── sitemap.xml                     # 구글/네이버용 동적 사이트맵
├── robots.txt                      # 검색 봇 크롤링 표준 허용 지침
└── ingredients.md                  # 100가지 식재료 테마 순환 체크리스트
```
