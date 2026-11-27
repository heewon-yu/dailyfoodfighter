# 정책자금·복지혜택 매칭 플랫폼 (Policy Benefit Matcher) — dailyfoodfighter 저장소로 통합됨

## 2026-11-27 단일 저장소(dailyfoodfighter) 통합

이 앱은 더 이상 별도 저장소 `heewon-yu/policy-benefit-matcher`가 아니라 **`heewon-yu/dailyfoodfighter` 저장소의 `apps/benefits/`** 에서 관리한다. 실서버 경로는 그대로 `https://dailyfoodfighter.com/benefits/` 이다.

```text
dailyfoodfighter/                 (Jekyll 블로그 + Cloudflare Pages)
  apps/benefits/                  ← 이 앱의 소스 (이 폴더)
    src/                          SvelteKit 앱 (app.html, routes, lib)
    static/og-benefits-20261119.jpg
    collector/ worker/ migrations/ docs/ tests/
  benefits/                       ← 빌드 산출물만 커밋 (실서버 /benefits/)
    index.html · privacy/ · app/ · og-benefits-20261119.jpg
    business-funding/ · government-support/   (Jekyll 전용 랜딩 페이지, 빌드가 건드리지 않음)
  _config.yml                     exclude: apps/  (Jekyll이 소스를 _site로 복사하지 않음)
```

### 빌드 · 배포

```bash
cd apps/benefits
npm install
npm run build:blog          # EMBED_BENEFITS=1 check + vite build + 검증 + JSON-LD 주입
npm run build:blog:static   # svelte-check 생략(빠른 빌드)
bash scripts/stage-blog-benefits.sh   # build/ → ../../benefits/ 동기화 후 git add
```

- Node.js 20.19+/22.12+ 권장. 메모리가 작은 환경(2GB 컨테이너 등)에서는 `NODE_OPTIONS="--max-old-space-size=512 --max-semi-space-size=16"` 로 빌드한다. 그대로 두면 프리렌더 단계에서 OOM이 날 수 있다.
- 빌드 후 `scripts/verify-blog-build.mjs` 가 `build/index.html`·`build/privacy/index.html`·`build/app/immutable` 존재를 확인하고, `scripts/inject-head-jsonld.mjs` 가 `<head>`의 제목·설명·robots·canonical·OG·Twitter 메타를 검사한 뒤 JSON-LD를 주입한다. 하나라도 없으면 빌드가 실패한다.
- **JSON-LD를 `svelte:head` 안에 넣지 말 것.** Svelte 5 프리렌더가 head 안의 `<script>`를 만나면 OOM으로 죽는다. 구조화 데이터는 이 후처리 스크립트가 주입한다.
- 푸터의 `/about/`·`/editorial-policy/`·`/contact/`·`/privacy/` 링크는 블로그 루트 페이지라 `paths.base`(/benefits) 밖에 있다. `svelte.config.js`의 `prerender.handleHttpError` 가 이 외부 링크만 통과시킨다.

### 검색 키워드형 메타 (영구 반영)

실서버에 적용된 메타를 **소스**에 고정했다(빌드 후 손으로 고치지 않는다).

- `src/routes/+page.svelte` `<svelte:head>`: title `혜택찾기 | 정부지원금·청년·주거·출산육아·창업 정책자금 맞춤 검색`, description(정부24·기업마당 공식 공고 기반), canonical, OG/Twitter, `robots(index, follow, max-image-preview:large)`
- `src/routes/privacy/+page.svelte` `<svelte:head>`: 개인정보 페이지용 robots·canonical·OG/Twitter
- JSON-LD(WebApplication+BreadcrumbList / WebPage): `scripts/inject-head-jsonld.mjs`

### 운영 API (변경 없음)

`/benefits/api/programs` 는 이 저장소의 `functions/benefits/api/programs.ts` Pages Function → `policy-benefit-api` Worker → D1(`policy-benefit-db`) 구조 그대로다. `apps/benefits/worker/wrangler.toml` 의 바인딩도 기존 운영 DB를 가리킨다. Worker·D1·수집기 재배포는 이번 통합에서 하지 않았다.

---

아래는 통합 이전(별도 저장소 시절)의 프로젝트 기록이다.

## 2026-11-20 조건검색 정비 및 D1 원본 증분 선적재 (PR #13)

- [D1 스테이징 및 조건검색 인계](docs/d1-staging-matching-rebuild-20261120.md): 정부24와 기업마당의 공식 원본을 **기존 공개 `programs`와 별도 D1 테이블** `official_source_snapshots`에 증분 저장하도록 준비했다. 운영 D1 실제 적재와 공개 사이트 배포는 **아직 검증되지 않음**.
- `src/lib/matching.ts`는 미검증 Gov24 JA 조건으로 신청 불가를 단정하지 않도록 수정했고, 지역/연령/소득/가구·사업유형 필터 회귀 테스트를 보강했다. 전체 페이지에 대한 서버측 조건검색과 상세 원본→공개 `programs` 병합은 후속 검증이 필요하다.
- 수동 작업: `git pull --ff-only && bash scripts/stage-official-to-d1-imac.sh --dry-run`. 테스트·보고서 확인 후 **사용자가 운영 D1 스테이징 실제 반영을 원할 때만** `bash scripts/stage-official-to-d1-imac.sh --apply-remote`.
- 최근 확인한 iMac 정부24 상세/조건 모두 4,439/10,891건, 기업마당 공식 LIST 1,347건. 정부24 10,000회 일일 호출 한도에 도달해 로컬 보호 차단됨. 자동수집은 정지 유지.

## 2026-11-20 읽기 전용 정부24·기업마당 전체 목록 수집 (운영 D1 쓰기 없음)

- [iMac 실행 지침](docs/read-only-full-catalog-imac-20261120.md): 기존 Docker collector 내부에서 정부24/기업마당 API를 100건/페이지씩 호출, 독립 재개 체크포인트와 page-*.json 저장, 중복/누락/원천 총건수 감사.
- 안전한 실행은 `docker compose exec -T collector python read_only_full_catalog.py --source gov24 --max-pages 25` 와 `--source bizinfo`로 진행. 기존 `/state/api-usage.json` 사용량 원장을 공유하므로 승인 한도 내에서만 진행한다.
- `python3 scripts/audit-national-source-snapshots.py`는 `audit-artifacts/read-only-catalog`와 기존 `baseline.json`을 **읽기 전용** 비교한다.
- 전체 원천 목록 수집은 **iMac 실제 명령 실행 결과를 아직 받지 못했으므로 미완료**. 운영 D1에 업로드/삭제하지 않는다.
- 전국 대표 사업 공개는 [공식 카탈로그 품질 명세](docs/national-first-collection-20261120.md) 원칙을 따른다. 검증 대기 자료는 공개 결과에서 제외.


공식 지원 공고를 수집·정규화하고, 사용자 조건과 비교해 소상공인·예비창업자 정책자금 및 개인·가구 복지 혜택을 탐색하는 모바일 퍼스트 웹앱입니다. **추천 결과가 신청 자격을 확정하는 것은 아닙니다.**

## 2026-11-20 최신 프로젝트 현황 — 운영 배포 완료 / 맞춤추천 추가 소스 보강

- **이전에 배포 확인된 버전:** 사용자가 iMac에서 웹 JavaScript 37/37, Python 64/64, Worker 3/3 회귀테스트 통과를 제공. Worker `af4dffee-e97f-4ecf-9d37-6e70dfe8ed84`, 블로그 웹 `c006322` GitHub push 성공. 사용자 웹사이트 확인 후 Docker `collector`가 `Up`인 상태도 확인했다.
- **실 D1 읽기 전용 감사 결과:** GOV24 10,597건 + BIZINFO 1,337건 = 총 11,934건. 부모급여·보육료·양육수당·유아학비·아이돌봄 후보 공고가 모두 검색됐다. 다만 공식 신청 자격의 정확성은 별도 검토.
- **이번 추가 개발(아직 웹 재배포 전):** 17개 시·도+236개 유일 시·군·구명 지역 분류, 시도 연동 선택 메뉴, 인천의 2026 개편 명칭, `내 지역·전국 / 지역 확인 필요 / 전체 지역 비교` 모드, 자녀 출생연도·중위소득 경계 검증, 시작일 전 표기. 개인화 설정은 브라우저 내에서만 비교.
- **정확도 보강 상세·테스트 기준:** [2026-11-20 맞춤추천 품질 보강 명세](docs/matching-quality-2026-11-20.md). 수정은 정적 웹 화면/로직만 해당하며 Worker·운영 D1·수집기 재배포는 필요 없다.
- **iMac 최종 적용 (GitHub Actions 사용 안 함):** `cd ~/policy-benefit-matcher && /bin/bash scripts/release-personalization-imac.sh`. 테스트 성공 후 블로그 `benefits/` 코드만 push. Cloudflare Pages Production 빌드 결과는 반드시 별도 확인.

## 과거 운영 스냅샷 (2026-11-19 로그·2026-11-20 기록)

> 다음은 **2026-11-19 KST 사용자 iMac 실측 로그**에 근거한 상태입니다. 현재 시각의 무중단 운영, 공개 사이트의 최신 Pages 배포, 전체 D1 건수는 별도 검증이 필요합니다.

| 항목 | 상태 / 검증 근거 |
| --- | --- |
| 운영 웹 | [dailyfoodfighter.com/benefits/](https://dailyfoodfighter.com/benefits/) 정적 빌드 GitHub push 확인 (웹 `849b65d`) |
| 프론트엔드 | 매칭 테스트 24/24, Svelte 검사 오류 0, 빌드 성공 |
| 카카오톡 공유 | OG 이미지/메타 코드 및 JPEG(1200×630) 운영 웹 저장소에 반영. 카카오 미리보기 최종 표시 확인은 별도 |
| Worker/D1 | `policy-benefit-api` Worker 및 `policy-benefit-db` 바인딩 배포 로그 확인 |
| Python 수집기 | 단위 테스트 **63/63 OK** (2026-11-19); iMac Docker 설정 `Collector ready: True` |
| 정부24 초기 스캔 | **22배치, 10,887건 목록 조회, 1,385건 업로드, complete=true** |
| 자동 수집 | `collector-1 Running`, 2026-11-19 14시 회차 정상 완료: 1,371건 조회, 1,361건 변경판정·업로드 |
| 운영 API 예산 | 정부24 승인 10,000/일 → 9,000 상한; 기업마당 승인 1,000/일 → 900 상한 |
| 일정 | **매일 KST 10:00 / 12:00 / 14:00 / 16:00 / 18:00** |
| GitHub Actions | 사용하지 않음 |

**운영 상세·장애 복구·미완료 품질검증:** [2026-11-20 운영 인계 문서](docs/operations-status-2026-11-20.md).

- 위 숫자는 테스트값이 아닌 사용자 수집기 로그이며, `fetched`와 `uploaded`를 구분해야 합니다. **D1의 총 고유 공고 수를 뜻하지 않습니다.**
- 14시의 변경판정 1,361건은 초기에 수집된 공고의 상세 백필·스텁 내용 차이 등으로 과대 감지되었을 가능성이 있어 검증이 필요합니다.
- 원천 API의 재조회 자체는 여전히 있습니다. 해시 비교는 변경 없는 공고의 **DB 재업로드**를 방지하는 장치이지 모든 API 호출 중복 방지 장치는 아닙니다.
- iMac이 절전되지 않고 Docker Desktop과 인터넷이 살아 있어야 예정된 시간에 새 공고가 수집됩니다. 운영 웹 조회는 iMac이 멈춰도 D1의 저장 데이터를 기반으로 계속 가능하도록 구성되어 있습니다.

## 2026-11-20 정확도·수집효율 후속 코드 (배포·운영 재검증 필요)

- **기본 검색에 신청기간 미기재/접수 예정 공고 포함**, 명확히 만료된 공고만 제외. 기간 미기재는 신청 가능 확정이 아니라 `신청기간 확인 필요`.
- **기존 자녀 출생연도 기반** 보수적 연령대 판정: 부모급여, 영유아보육료, 가정양육수당, 유아학비. 월령 경계·시설 이용·가족 정보 미입력은 `CHECK`로 남김.
- 프론트 마감일 정규식과 KST 날짜판정 수정.
- 수집원별 변경·미변경 건수, 정부24 공식 링크 미존재로 제외된 항목 수 로깅.
- Gov24 상세정보 보강 시 **목록 해시를 유지**해 다음 동일 목록에서 불필요한 변경 판정이 생길 가능성을 낮춤.
- 실제 운영 DB에서 육아·보육지원 핵심 제도 누락을 확인하는 읽기 전용 도구: `/bin/bash scripts/audit-benefits-d1-imac.sh`.
- **주의:** 상기 변경은 소스 반영 상태다. 2026-11-20 이후 iMac 회귀테스트/Worker 및 사이트 재배포/운영 D1 감사 결과는 아직 제출되지 않았다. 구체적 검증·배포 순서는 [운영 인계 문서의 8절](docs/operations-status-2026-11-20.md) 참고.

## 아키텍처

```text
정부24·기업마당 공식 API
    → iMac M1 / Docker Python collector (5회/일, 영속 쿼터/체크포인트)
    → HTTPS 인증 Worker ingest + 변경해시 비교
    → Cloudflare D1 (policy-benefit-db)
    → Cloudflare Worker public API
    → dailyfoodfighter.com/benefits/ (SvelteKit 정적 웹)
```

- 소스 저장소: [heewon-yu/policy-benefit-matcher](https://github.com/heewon-yu/policy-benefit-matcher).
- 블로그 배포 저장소: [heewon-yu/dailyfoodfighter](https://github.com/heewon-yu/dailyfoodfighter). 기존 블로그·게임 경로와 분리.
- Worker: `https://policy-benefit-api.leemovie89.workers.dev`; scheduled Worker cron은 **만료 공고 정리용**이며 공식 API 수집은 iMac Docker에서 수행합니다.
- 사용자 프로필은 브라우저 로컬 저장소를 원칙으로 하며 공고 수집 파이프라인에 전송하지 않습니다.
- 자격 조건이 불확실한 지원은 무조건 자격 일치라고 판단하지 않고 추가 확인 대상으로 유지합니다.

## 운영 확인 명령

```bash
cd ~/policy-benefit-matcher
docker compose ps
docker compose logs --tail=80 collector
docker compose exec collector python status.py
```

Docker 서비스는 `restart: unless-stopped`이지만 Docker Desktop 자체의 기동과 macOS 절전 방지 설정이 필요합니다. 필요 시 `docker compose up -d --no-deps collector`. 자동 서비스가 실행 중일 때 `python bootstrap.py`를 중복 실행하지 마세요.

## 개발 및 테스트

```bash
npm install
npm run check
npm test
npm run dev
docker compose run --rm --no-deps collector python -m unittest discover -s tests -v
```

단위 테스트는 실제 API 연결 및 운영 DB 데이터 품질을 보증하지 않습니다. 호출 예산은 `.env`와 Docker 상태 볼륨에 따라 관리하며 API 키와 Worker 토큰을 문서/커밋에 포함하지 않습니다.

## 남은 품질 검증

1. **변경 판정 효율:** 초기 정부24 1,385건 업로드 직후 자동 14시 회차 1,361건 변경판정 원인 및 불필요한 재업로드 여부 검증.
2. **중복 API 호출:** 수동 전체 스캔 완료와 자동 일일 전체 스캔 간 완료 체크포인트 연동, 실제 증분 변경일/해시 안정성 검증.
3. **복지 품목 누락 확인:** 영유아보육료, 부모급여, 양육수당, 유아학비, 아이돌봄서비스 등이 실제 D1에 수록되는지 검증. 정부24에 없을 경우 다른 공식 출처 검토.
4. **맞춤 자격 정확도:** 자녀별 월령, 어린이집·유치원 이용 여부, 지역/소득 조건 등. 3단계 '일치/추가 확인/불일치' 정확성 검증은 미완료.
5. **운영 품질:** 다음 예약 수집 성공, 공고 마감 후 D1 삭제 정합성, 공개 웹 최신 배포, 카카오 공유 캐시 확인.
6. **개인정보 및 이용허락:** 실제 운영방침·API 계약조건/원문 표시 검증.

## 문서

[운영 인계](docs/operations-status-2026-11-20.md) ·
[설계](docs/hybrid-architecture.md) ·
[Docker 설정](docs/local-docker-setup.md) ·
[수집기 연동](docs/collector-integration.md) ·
[정부24 API](docs/gov24-api.md) ·
[기업마당 API](docs/bizinfo-api.md) ·
[개인정보 처리방침 초안](docs/privacy-policy.ko.md) ·
[Notion 프로젝트 마스터](https://app.notion.com/p/41d280abdcf3814caccbc57c90c01686)
