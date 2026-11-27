# Codex 최종 실행 지시 — 정책자금·복지혜택 매칭 프로젝트
기준일: 2026-11-20 / GitHub: https://github.com/heewon-yu/policy-benefit-matcher / Draft PR #13
브랜치: fix/default-regional-search-20261120

당신은 기존 프로젝트의 개발·검증·안전한 데이터 통합 담당자다. 먼저 `docs/CODEX_HANDOFF_2026-11-20.md`와 `docs/d1-staging-matching-rebuild-20261120.md`를 완독하고 실제 현재 코드를 직접 확인하라. 요약이나 새 설계안만 제출하지 말고, 권한이 허용되는 구현·단위테스트·정적분석·로컬 검증·GitHub 반영을 가능한 만큼 수행하라. 이미 구현된 기능은 중복 재개발하지 않는다.

## 최상위 P0 장애: Cloudflare D1 무료 한도 초과 (2026-11-20)
- 계정에 Cloudflare 경고 **"D1 row read requests are temporarily blocked"** 발생. 당일 Rows read 5,000,000 한도 도달. **초기화: 2026-11-21 00:00:00 UTC = 한국시간 2026-11-21 09:00:00 KST.** 실제 제한 해제 확인 전 운영 D1에 SELECT/INSERT/UPSERT/DELETE/DDL/대량 감사 등 모든 원격 쿼리 실행 금지.
- 중요한 사실: **읽기만 초과했으니 쓰기는 가능하다고 단정하지 말 것.** Cloudflare 공식 정책에 따르면 Free 플랜에서 daily rows read *또는* rows written 한도에 도달하면 D1 쿼리 자체가 오류로 차단될 수 있다. 운영 D1 쓰기 시도는 오늘 하지 말고, 로컬 테스트/SQL 생성만 준비한다. 공식 문서: https://developers.cloudflare.com/d1/platform/pricing/
- 한도 초기화 후 Cloudflare Dashboard **해당 계정에서 D1 사용량/메트릭 확인**, 읽기 제한 해제 및 쓰기 잔여량·D1 저장 용량 확인. 운영 DB 접근은 가벼운 PK 조회·필요한 최소 검증만 수행, 대량 스캔/COUNT/반복 SELECT/전체 해시 비교 금지. 기존 공개 데이터·인증을 보호한다.
- **읽기 500만행 폭증 원인부터 진단**: Worker `/api/programs`의 offset 기반 페이징과 `instr(...)`, `lower(...)`, `json_extract` 조건, 부분 인덱스, 필터 후 스캔 `maxRows=1000`, 수집기 D1 중복조회, 주기적 purge, 관리자 감사 쿼리를 각각 검토. D1 `EXPLAIN QUERY PLAN`, 쿼리별 meta.rows_read / rows_written 및 Cloudflare Metrics/Insights를 활용하되 **한도 해제 후 소량의 표본 쿼리부터** 수행.
- 인덱스/키셋 커서, SQL WHERE 조건 푸시다운, 불필요한 COUNT/전체 테이블 훑기 방지, 캐시 키와 만료정책, 호출 횟수 제한, 날짜·지역 필터 및 검색어 조회 계획 개선. 가능한 방식의 사전 계산/검색 전용 구조를 평가하고 실제 샘플 데이터로 실행 계획과 정확도를 검증한다. 무조건 신규 인덱스를 추가하거나 과도한 데이터 재적재를 하지 않는다.
- 운영 D1 반영 스크립트 `scripts/stage-official-to-d1-imac.sh --apply-remote`는 **한도 차단 중 금지**. 초기화 및 로컬 테스트 확인 뒤에만 스테이징 적재를 시도하며, 승인된 공식 원본 스테이징 이외의 공개 `programs` 및 Worker/사이트 배포는 별도 승인 조건 유지.
- Free 사용 한도: 읽기 5,000,000 rows/day, 쓰기 100,000 rows/day(별도), 초기화 00:00 UTC. 측정 단위는 **SQL 문장 실행 횟수가 아니라 처리된 행 수**다. 일부 UPDATE/UPSERT/인덱스/DDL에서 읽기와 쓰기 모두 발생 가능. 목표는 일일 읽기 사용량을 한도보다 충분히 낮추고 비용 폭주 없이 동작하는 것이다.

## 금지/보호
- GitHub Actions 사용량 한도 문제로 Actions 실행·재실행·새 워크플로·스케줄링 금지.
- Docker `collector` 스케줄러 재시작 금지. 수동 원본 수집은 사용자가 담당하며, 그 저장 데이터와 일일 API 호출 원장 `/state/api-usage.json`을 삭제·초기화하지 않는다.
- 원천 API를 불필요하게 호출하지 말 것. 정부24는 2026-11-20 로컬 10,000회 소진. 호출 가능량은 KST/UTC 이중 한도 및 현재 시각 기준으로 확인하고, 별도 승인 없이 추가 수집하지 않는다.
- 기존 D1 `programs`의 행 삭제·대량 덮어쓰기·실 운영 Worker·Cloudflare Pages 배포·main 병합은 하지 않는다. 기존 사용자 프로필 또는 API 키/토큰을 저장소에 커밋하지 않는다.
- 사용자 승인 범위는 **공식 공개 원본의 독립 D1 스테이징 선적재**다. 그 밖의 공개 검색 자료 변경·운영 배포는 테스트와 차이 보고 후 별도 승인 대상이다.
- 로컬 작업트리 변경이 있다면 보존하고 `git status`·원격 비교 후 충돌 없는 방식으로 작업한다.

## 알려진 사실 — 재검증해야 할 숫자는 구분
- Gov24 LIST 공식 API 10,891/10,891, DETAIL 4,440, CONDITIONS 4,439, BOTH 4,439, REMAINING 6,452 (11/20 iMac 실제 출력). 실패 0, 일일 승인 로컬 예산 10,000/10,000으로 종료.
- Bizinfo API 현 목록 1,347건/14페이지. API 원문 22필드 확보. 과거 약 3천 건과의 차이는 아직 근거 미확인.
- 기존 D1의 과거 관측: Gov24 10,597건, Bizinfo 1,337건(관측 시점과 현재 스냅샷은 다름). 이 값을 현재 DB 건수로 단정하지 말고 READ-ONLY로 재확인.
- `migrations/0003_official_source_snapshots.sql`, `scripts/build-manual-full-data.py`, `scripts/build-d1-staging-sql.py`, `scripts/stage-official-to-d1-imac.sh`가 브랜치에 있음. D1 실제 적재 성공 증거는 아직 없음.
- 핵심 필터 구현은 `src/lib/matching.ts`, `territory.ts`, `region-visibility.ts`, `child-age.ts`, `national-titles.ts`, `src/routes/+page.svelte`, `worker/src/index.ts`에 있다.

## 실행할 작업: 우선순위대로 끊지 말고 진행
### 1) 검증
- GitHub PR #13의 최신 변경 및 기존 로컬 수정 내역 확인.
- 로컬 `npm test`, `npm run check`, `npm run build`, `(cd worker && npm test && npm run check)`, `docker compose run --rm --no-deps collector python -m unittest discover -s tests -v` 실행. 모든 실패를 재현·수정 후 재실행. GitHub Actions 금지.
- 원본 export/통합/SQL 생성 `bash scripts/stage-official-to-d1-imac.sh --dry-run` 실시. 원본 JSON에는 비밀키·사용자정보가 없음을 검증.
### 2) D1 안전한 선적재 — 한도 해제 후
- **D1 제한이 해제되기 전에는 원격 감사/SELECT도 수행하지 말 것.** 해제 후 메트릭·인덱스/PK 범위를 활용해 최소 행만 읽는 방식으로 운영 D1의 `programs` 상태를 확인하고 전후 비교 기준을 남겨라.
- 승인된 범위: 운영 D1의 **별도** `official_source_snapshots` 테이블에 기존 원본 10,891 LIST/부분 상세 및 Bizinfo 1,347 LIST를 기수집분만 INSERT/UPSERT.
- source+source_id 기준으로 신규=삽입, 동일 해시=건너뛰기, 상세 추가/변경=그 부분 갱신, 기존 데이터의 누락 상세/조건 덮어쓰기 금지, 과거 건 임의 삭제 금지.
- SQL 배치 크기/D1 요청 제한/중단·재실행/부분 실패/테이블 migration의 실제 동작을 우선 검증. 문제가 있으면 안전한 로컬 코드 변경·테스트를 통해 수정한 뒤 실행.
- 원격 D1 인증/권한이 없으면 추측해서 '완료'라고 보고하지 말고 검증 가능한 로컬 산출물과 정확한 마지막 수동 명령 제공.
### 3) 조건검색 코드 전면 정합성
- 지역: 전국·내 지역·미확인·타지역 전용을 정확히 구분. 지역소관 기관 소재지를 거주 제한으로 무조건 해석하지 말며, 타지역 전용 공고는 기본 제외.
- 연령: 만 나이·생일 경계, 정부24 조건 코드와 지원대상 원문. 소득: 중위소득 %구간·가구원·기준연도, 지원 유형별 예외. 가족: 자녀 수·각 출생연도·임신/혼인/주거·재직. 기업마당: 예비창업/소상공인/중소기업·업력·매출 등.
- 미검증 추론·원문 충돌·정보 미입력은 CHECK; 실제 근거 명확한 불일치만 NO. 공식 근거를 추적 가능하게 보존.
- 정규화 기능을 함수/모듈로 구축하고 저장된 Gov24 serviceDetail/supportConditions, Bizinfo LIST를 사용하는 오프라인 fixture/회귀 테스트 추가. 승인 없이 운영 `programs`에 적용하지 않는다.
### 4) 전국 대표와 지역 자체 추가혜택 구분
- 인천 거주 + 부모급여 검색: '부모급여 — 전국 공통' 대표 안내는 하나만. 인천의 독립 출산·양육 지원은 실제 공식 공고가 확인될 경우 별도 사업으로 표시. 제주·경북 등 타지역 전용은 제외, 지역 불명확은 확인 필요.
- 전국제도 동일성은 공식 사업 식별/내용 근거를 기반으로 판단; 제목 유사성만으로 별개 지역지원 삭제 금지.
- 전국 대표 중복(동일 제도 여러 지역 게시)·중앙 전국혜택 누락·인천 자체지원 오제외·시군구 충돌·전국으로 잘못 분류된 지역사업 회귀 테스트.
### 5) 전체 DB 검색 정확도 + D1 행 읽기 폭증 방지
- 프론트 `scanPage maxRows=1000`만 가져와 후필터하는 구조에서는 뒤쪽 DB 사업 누락 가능. 검색/지역·나이·소득·사업자/가구 조건에서 누락 없는 전 범위 커서/서버 필터 구조 개발 및 테스트.
- 개인 조건을 서버에 보내면 개인정보 처리방침/로컬전용 원칙과 충돌한다. 개인정보 전송하지 않는 설계(공개 비개인조건 DB 필터와 클라이언트 자격 판정 분담 등)를 우선 검토하고, 전 DB 정확도/성능/요청 비용을 증명하라.
- 로컬·작업브랜치에서만 검증하며 운영 API/Worker 배포는 승인 없이는 하지 않는다.
### 6) 재수집 최적화·추가 감사
- 수동으로 확보된 Gov24 상세 원본 캐시를 추후 자동수집 코드가 재사용하도록 기능 구현/단위 테스트하되 수집 스케줄러는 중지 유지.
- 기업마당 1,347과 과거 약 3,000 차이는 '현 API 페이지 범위/과거 공고/별도 서비스'로 원인 후보를 나눠 근거 기반 조사. 검증 없이 전체 3,000건이라고 주장하지 않는다.
- D1 만료 처리/삭제 로직은 삭제가 데이터 소실로 이어지는지 점검만 하고 임의 실행하지 않는다.

## 완료 조건 / 보고 형식
- 변경 파일, 수행한 테스트(명령/성공/실패), 원본 LIST/DETAIL/CONDITIONS 실제 건수, D1 신규/변경/건너뜀, 운영 `programs` 전후 총건수(한도 해제 후 측정), 부정확한 지역결과/중복/오차 회귀 검증, D1 쿼리별 rows_read·rows_written과 기존 대비 개선/한도 안전율, 외부 API 호출 수, PR 반영 SHA를 보고.
- 불가능한 작업·계정 인증·실기기/운영 배포는 명확히 '미완료' 표시.
- 테스트를 통과한 변경만 기존 PR #13에 반영. main 병합 및 운영 공개는 후속 승인 전 수행하지 마라.
