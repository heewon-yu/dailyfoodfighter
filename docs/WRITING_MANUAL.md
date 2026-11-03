# DailyFoodFighter 콘텐츠 작성 매뉴얼 (GPT Codex & 피클 공용)

이 문서는 **피클(AI 비서)**과 **GPT 코덱스(OpenAI Codex / GitHub Copilot)**가 동일한 품질, 양식, 톤앤매너로 데일리푸드파이터 블로그 글을 작성하고 배포할 수 있도록 정리한 표준 지침서입니다.

---

## 📌 한눈에 보는 핵심 작업 흐름

1. **식재료 선정:** `ingredients.md`에서 현재 카테고리(과일 ➔ 채소 ➔ 육류 ➔ 수산물 순환)의 미발행 `[ ]` 식재료 1종 선택
2. **대표 사진 준비:** `/assets/images/{영문소문자}.jpg` 경로에 고화질 사진 배치
3. **국문 글 작성:** `_templates/post-template-ko.md` 서식으로 `_posts/YYYY-MM-DD-{영문명}-nutrition-benefits.md` 생성
4. **영문 글 작성:** `_templates/post-template-en.md` 서식으로 `_posts/YYYY-MM-DD-en-{영문명}-nutrition-benefits.md` 생성
5. **체크리스트 업데이트:** `ingredients.md`에서 해당 식재료를 `[x]`로 완료 표시
6. **Git 커밋 및 푸시 (Cloudflare Pages 자동 배포):**
   ```bash
   git add .
   git commit -m "feat(post): add {식재료} bilingual post set"
   git push origin main
   ```
   *(푸시 즉시 Cloudflare Pages에서 자동 빌드되어 무제한 대역폭으로 글로벌 배포)*
7. **검색엔진 즉시 색인(IndexNow) 호출:**
   ```bash
   bash scripts/ping-indexnow.sh "https://dailyfoodfighter.com/posts/{식재료}/" "https://dailyfoodfighter.com/en/posts/{식재료}/"
   ```
   ➔ 네이버 서치어드바이저, 마이크로소프트 빙, 얀덱스에 즉시 핑을 쏴 수분 내 크롤링 강제 트리거

---

## 🔗 참조용 실제 발행 완료 글 주소 (Benchmark URLs)

- **토마토 (과일):**
  - 한국어: `https://dailyfoodfighter.com/posts/tomato-nutrition-benefits/`
  - 영문: `https://dailyfoodfighter.com/en/posts/tomato-nutrition-benefits/`
- **블루베리 (과일):**
  - 한국어: `https://dailyfoodfighter.com/posts/blueberry-nutrition-benefits/`
  - 영문: `https://dailyfoodfighter.com/en/posts/blueberry-nutrition-benefits/`

---

## 🤖 GPT / 코덱스 실행용 마스터 프롬프트

ChatGPT, Claude, 또는 VS Code Copilot/Codex에 아래 한 줄만 입력하면 저장소 규칙을 읽고 글을 완벽히 작성하고 색인 핑까지 수행합니다:

> **"저장소의 `docs/GPT_CODEX_MASTER_SPEC.md`와 `ingredients.md`를 읽고, `_templates/` 템플릿 규격에 맞춰 오늘 순환 카테고리의 다음 식재료 포스팅 1세트(한국어 1편 + 영문 1편)를 작성해줘. 작성 후 `ingredients.md`도 업데이트하고, `bash scripts/ping-indexnow.sh` 명령어를 안내해줘."**

---

## 📐 본문 5단 황금 구조 (구글 애드센스 최적화)

| 순서 | 구성 요소 | 설명 및 애드센스 전략 |
| :---: | :--- | :--- |
| **0** | **헤더 & 메타** | H1 제목, 카테고리 뱃지, 발행일, 작성자 정보 |
| **1** | **대표 사진** | H1 바로 아래 고화질 16:9 사진 + 이탤릭 캡션 (체류 시간 극대화) |
| **2** | **인트로 훅** | 2개 단락으로 구성된 흥미 유발 및 과학적 개요 |
| ⭐ | **상단 광고 자리** | 인트로 직후 `---` 구분선 (전 세계 블로그 CTR 1위 골든 스팟) |
| **3** | **1. 영양 성분표** | USDA/농진청 기반 100g 표준 영양 데이터 표 |
| **4** | **2. 4대 건강 효능** | ①~④ 생화학 기전 중심의 임상 효능 서술 |
| ⭐ | **중간 광고 자리** | 효능 섹션 직후 `---` 구분선 |
| **5** | **3. 섭취 가이드** | 가열 vs 생식, 시너지 식품 궁합, 생체이용률(Bioavailability) 극대화법 |
| **6** | **4. 주의사항/부작용** | 과다 섭취 주의, 기저 질환(신장/위산 등) 및 약물 상호작용 |
| **7** | **5. 최종 요약** | 1줄 총평, 일일 권장 섭취량, 보관 요령 |
