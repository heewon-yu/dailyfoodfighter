# 🥑 DailyFoodFighter (dailyfoodfighter.com) AI 글작성 & 운영 마스터 통합 명세서
> **수익화 블로그 자동화 파이프라인 (작성 ➔ 발행 ➔ 배포 ➔ 즉시 색인) 풀패키지 가이드**

---

## 1. 프로젝트 개요 및 운영 철학

- **공식 도메인:** `https://dailyfoodfighter.com`
- **배포 인프라:** Cloudflare Pages (무제한 대역폭, 엣지 CDN, 0원 무지출) + GitHub 저장소 연동
- **핵심 목표:** 100가지 자연 식재료의 영양 성분·생체이용률·임상 효능을 다루는 전문 미디어로, 구글 애드센스 심사 100% 승인 및 영미권 고단가 CPC 광고 수익 창출
- **발행 규칙:** **[한국어 전문 1편 + 글로벌 영문 전문 1편]**을 세트로 동시 발행
- **테마 순환 체계:** 4대 카테고리 순환 (**과일 ➔ 채소·야채 ➔ 육류·단백질 ➔ 수산물**)

---

## 2. 참조용 실제 발행 완료 글 (벤치마크 레퍼런스)

글을 작성할 때 반드시 아래 기발행 글의 구조, 표 서식, 톤앤매너, 광고 슬롯 위치를 1:1로 준수해야 합니다.

| 식재료 (카테고리) | 한국어 발행 링크 (KR) | 글로벌 영문 발행 링크 (EN) |
| :--- | :--- | :--- |
| **토마토 (과일)** | [토마토 효능과 영양 성분의 과학적 진실](https://dailyfoodfighter.com/posts/tomato-nutrition-benefits/) | [The Clinical Nutrition Science of Tomatoes](https://dailyfoodfighter.com/en/posts/tomato-nutrition-benefits/) |
| **블루베리 (과일)** | [블루베리 효능과 영양 성분의 과학적 진실](https://dailyfoodfighter.com/posts/blueberry-nutrition-benefits/) | [The Clinical Nutrition Science of Blueberries](https://dailyfoodfighter.com/en/posts/blueberry-nutrition-benefits/) |

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

## 4. 언어별 Frontmatter 및 템플릿 규격

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

## 5. 검색엔진 즉시 색인(Instant Indexing) 자동화 파이프라인

글을 배포한 후 검색엔진 봇이 수분 내로 긁어가도록 파이프라인 끝단에서 **IndexNow 프로토콜**을 필수 호출합니다.

### 핑 호출 명령어 (Bash):
```bash
bash scripts/ping-indexnow.sh \
  "https://dailyfoodfighter.com/posts/{식재료}-nutrition-benefits/" \
  "https://dailyfoodfighter.com/en/posts/{식재료}-nutrition-benefits/"
```

- **호출 대상:**
  - 네이버 서치어드바이저 (`searchadvisor.naver.com`)
  - 마이크로소프트 빙 (`bing.com`)
  - 얀덱스 및 글로벌 파트너스 (`api.indexnow.org`)
- **결과 확인:** `HTTP 200` 정상 수신 시 수분 내 크롤링 강제 트리거 완료.
- **사이트맵/RSS:** GitHub 및 Cloudflare 배포 시 `sitemap.xml`과 `feed.xml`(RSS 2.0)이 자동 갱신됩니다.

---

## 6. GPT / 코덱스 원클릭 실행 프롬프트 (One-Prompt Command)

VS Code Copilot, Cursor, 또는 웹 ChatGPT에 아래 프롬프트 한 줄만 입력하면 모든 과정이 완벽히 수행됩니다:

```text
저장소의 .github/copilot-instructions.md와 ingredients.md를 읽고, _templates/ 템플릿 규격에 맞춰 오늘 순환 카테고리의 다음 식재료 포스팅 1세트(한국어 1편 + 영문 1편)를 작성해줘. 

[작성 필수 규칙]
1. H1 제목 바로 아래에 ![신선한...](/assets/images/{영문}.jpg) 및 이탤릭 캡션 배치
2. 인트로 2단락 직후 '---' (애드센스 상단 광고 슬롯) 삽입
3. USDA 기반 100g 표준 영양성분표 및 4대 임상 효능 서술
4. 작성 완료 후 ingredients.md 체크리스트를 [x]로 업데이트
5. Git 커밋 및 푸시 후, bash scripts/ping-indexnow.sh로 네이버·빙 즉시 색인 핑 전송 안내
```

---

## 7. 저장소 핵심 파일 맵

```text
dailyfoodfighter/
├── .github/
│   └── copilot-instructions.md     # 코덱스/Copilot 자동 인식 마스터 규칙
├── _posts/                         # 발행된 블로그 글 (한/영)
├── _templates/
│   ├── post-template-ko.md         # 국문 표준 템플릿
│   └── post-template-en.md         # 영문 표준 템플릿
├── assets/
│   ├── css/style.css               # 반응형 & 모바일 & 다크모드 스타일
│   └── images/                     # 식재료별 고화질 16:9 대표 이미지
├── docs/
│   ├── WRITING_MANUAL.md           # 공용 작성 매뉴얼
│   └── GPT_CODEX_MASTER_SPEC.md    # [본 문서] 풀패키지 통합 명세서
├── scripts/
│   └── ping-indexnow.sh            # IndexNow 네이버/빙 즉시 색인 스크립트
├── _config.yml                     # Jekyll 설정, GA4, 네이버/구글 메타태그
├── feed.xml                        # 네이버 서치어드바이저용 RSS 2.0 피드
├── sitemap.xml                     # 구글/네이버용 동적 사이트맵
├── robots.txt                      # 검색 봇 크롤링 표준 허용 지침
└── ingredients.md                  # 100가지 식재료 테마 순환 체크리스트
```
