# 정책혜택 매칭 — 2026-11-20 최종 작업 현황 및 Codex 인계

> 기준: GitHub `heewon-yu/policy-benefit-matcher` 브랜치 `fix/default-regional-search-20261120`, draft PR #13. 기존 작업과 iMac에서 제출된 터미널 로그만을 사실로 구분한다. 이 문서는 실행·배포 성공을 주장하지 않는다.

## 긴급 추가 상황 — 2026-11-20 Cloudflare D1 읽기 한도 초과
- Cloudflare 계정에 **D1 row read requests are temporarily blocked** 알림. Rows read 일일 5,000,000행 한도 소진. 사용자 알림의 복구 예정: **2026-11-21 00:00 UTC / 한국시간 오전 9시**.
- Cloudflare 정책상 읽기 또는 쓰기 일일 한도 초과 시 DB 쿼리 전반이 실패할 수 있으므로, "쓰기는 가능"이라고 가정하지 말 것. 한도 초기화 전 운영 D1 원격 SELECT/INSERT/UPSERT/DDL/DELETE 일체 중단. 로컬 수정·테스트·스테이징 SQL dry-run은 계속 가능. https://developers.cloudflare.com/d1/platform/pricing/
- Codex 최우선 순서는 비싼 SELECT/offset·instr·lower·JSON 조건·인덱스 누락·반복 API 요청·purge/감사 쿼리 진단 → 로컬 쿼리 최적화/회귀 테스트 → 한도 해제 확인 → 최소 읽기 진단/원본 D1 스테이징. 불필요한 대량 조회, 무제한 재시도, 스테이징 강제 적재 금지.
- 전체 최신 실행 지시는 `docs/CODEX_EXECUTION_PROMPT_2026-11-20.md`를 따르며, 스테이징 실제 운영 적재 성공은 아직 확인되지 않음.

## 0. 제품 확정 요구사항
1. 전국 공통 복지제도(부모급여·아동수당 등)는 **동일 제도 대표 1개**만 표시한다. 지자체가 동일 제도를 안내한 공고를 또 대표 결과로 노출하지 않는다.
2. 거주지역 자체의 **별도 예산·별도 제도 추가지원**은 전국 제도와 합치지 않고 별도 결과로 표시한다. 예: 인천 거주자가 부모급여 검색 → 전국 공통 부모급여 대표 1건 + 관련성이 공식적으로 입증된 인천 자체 출산·양육 추가지원 사업 각각 표시. 별개인 지역사업을 제목 유사만으로 삭제/통합하지 않는다.
3. 확실한 타지역 전용 사업은 기본 검색에서 제외한다. 전국+내 지역+지역 불확실 결과를 보여주되, 불확실한 지역은 '지역 확인 필요'로 구분한다. '전체 지역 비교'는 명시적으로 선택한 경우에만 한다.
4. 연령·소득·가구원·자녀수와 출생연도·임신·혼인·주거·고용·사업자 유형·업력·신청기간을 공식 근거 기반으로 비교한다. `LIKELY` / `CHECK` / `NO` 3단계이며, 미확인 데이터를 확정 적격/부적격이라고 단정하지 않는다.
5. 오늘 수집한 기존 공고는 원본을 **중복 등록하지 않고 보강**한다. `source + source_id`가 동일하면 원본 해시 비교 후 변경분만 갱신하며, 오늘 LIST에 없는 과거 기존 건은 즉시 삭제하지 않는다.
6. 이용자의 개인 조건은 브라우저 로컬에 저장한다. D1에 개인프로필을 적재하거나 서버에 전송하지 않는다.

## 1. 수집 실측 상태
- Gov24 LIST 10,891/10,891 (109페이지, 원본 저장). `serviceDetail` 4,440, `supportConditions` 4,439, 모두 있는 사업 **4,439**, 남은 **6,452**. 최종 로그 `calls_this_run=79`, `failures_this_run=0`, `Approved API quota exhausted`.
- Gov24 iMac 로컬 사용량: 2026-11-20에 **10,000/10,000회**로 로컬에서 차단됨(직전 8,021 + 1,900 + 79; 같은 날 같은 장부라는 전제).
- Bizinfo LIST 1,347/1,347 (14페이지, API 원본의 확인된 22필드), 실측 사용량 127/1,000회. 과거 약 3,000건과 차이의 출처는 **미확인**. 전체 웹사이트·과거 공고·첨부 본문까지 확보했다는 뜻은 아니다.
- 하루 상한 설정: Gov24 10,000회, Bizinfo 1,000회, `API_BUDGET_PERCENT=100`. 영속 `/state/api-usage.json`에 KST 및 UTC 일별 사용량 기록. API 발급처 집계/다른 호출과의 차이는 확인 필요.
- Docker 스케줄러 `collector` 서비스 **정지** 상태. 수동 one-off만 사용. D1 운영 데이터 실제 쓰기는 **아직 확인된 적 없음**.

## 2. GitHub 기구현 — 보존하고 중복 개발 금지
- `collector/read_only_full_catalog.py`: 양 원천 LIST 전체 조회, 체크포인트, 페이징·중복·총량 검사.
- `collector/read_only_gov24_details.py`: Gov24 DETAIL/CONDITIONS 개별 원본 저장 및 성공 응답 재사용, 호출 예산 단위 `--max-calls 1..2000`, `--summary-only`.
- `collector/quota.py`, `docker-compose.yml`: 100% 승인 상한(기본), 영속 원장/KST+UTC 이중 보호.
- `scripts/build-manual-full-data.py`: 원본 목록·상세·조건 결합, 원본 그대로 보존.
- `migrations/0003_official_source_snapshots.sql`: 기존 검색 테이블 `programs`와 격리된 D1 원본 스테이징 테이블.
- `scripts/build-d1-staging-sql.py`: 원본 검증, source ID 중복 방지, 원본 JSON/SHA-256 UPSERT SQL 생성, 새 자료에 상세가 없으면 기존 상세 보존.
- `scripts/stage-official-to-d1-imac.sh`: Docker 원본 export → 병합 → staging SQL 생성. 기본 `--dry-run`; 명시한 `--apply-remote`만 원격 D1 스테이징 쓰기. **실행 검증/실제 운영 반영 미완료**.
- `src/lib/territory.ts`, `src/lib/region-visibility.ts`, `src/lib/issuer-classification.ts`: 지역 범위/관할 근거, 타지역 제외, 미확인 유보.
- `src/lib/matching.ts`, `src/lib/child-age.ts`: 가족·소득·연령 등 매칭 3단계. 검증되지 않은 Gov24 JA 조건/사업자 대상은 자동 `NO`가 아닌 `CHECK`.
- `src/lib/national-titles.ts`, `src/lib/national-catalog.json`, `src/routes/+page.svelte`: 일부 전국 대표 제도·중복 키·내지역 검색 및 클라이언트 필터.
- `worker/src/index.ts`: 기존 D1 `programs` 조회 API, 인증 ingest/check/pending 엔드포인트.
- `tests/`, `collector/tests/`, `worker/tests/`: 관련 회귀 테스트. **이번 신규 수정 후 실제 iMac 전수 통과 로그 없음**.
- README, `docs/d1-staging-matching-rebuild-20261120.md`에 단계적 반영 절차 기록.

## 3. 최우선 미완료 (Codex가 실행)
### P0-A: 현상 검증 / 안전성
- 최신 branch/PR, 작업트리 로컬 변경·원격 차이 검토, 덮어쓰기 금지.
- `npm test`, `npm run check`, `npm run build`, `cd worker && npm test && npm run check`, `docker compose run --rm --no-deps collector python -m unittest discover -s tests -v` 로컬 실행. GitHub Actions **절대 실행하지 않음**.
- staging SQL의 실제 D1 제한, 크기·바인드·트랜잭션, UPSERT 조건, idempotence, 재시도/부분실패·체크포인트를 테스트. 스크립트 자체의 여러 회차 재실행 검증.
- `programs` 기존 행 수·해시·상태 기준선을 읽기 전용으로 백업. D1 실제 쓰기는 dry-run 결과/변경범위 검증 뒤 승인된 **원본 스테이징 범위 내**로 한정.
### P0-B: 안전한 D1 선적재
- `official_source_snapshots`에 Gov24 현재 확보 LIST/DETAIL/CONDITIONS 및 Bizinfo 원본 1,347건을 source ID 기준 INSERT/변경분만 UPSERT. 미확보 상세는 NULL로 두되 이전 상세 훼손 금지.
- 건수는 Gov24 LIST 10,891개 전체 스테이징 가능, 상세 4,440, 조건 4,439; Bizinfo LIST 1,347. 실제 적재 전 export 검사 필수.
- 현 `programs`는 **변경하거나 삭제하지 않음**. SQL 파일/민감정보 커밋 금지, 배치 과도 크기 조절, 완료/실패 건수 기록.
- 이후 수집분은 반복 실행할 수 있게 증분·검증 보고서 강화.
### P0-C: 자격조건 정규화
- 공식 Gov24 `serviceDetail`/`supportConditions`의 실제 필드 샘플 조사 후 지원대상/거주·세부지역/연령/중위소득·가구원/사업자·매출·업력/자녀/접수기간을 근거·신뢰도와 함께 구조화.
- Bizinfo 22필드(지원대상·신청방법·제출서류·지역·문의처 등) 구조화. 실제 공고/첨부본문이 없는 조건은 확정하지 않는다.
- 연령(생일 경계), 소득(중위소득의 단위·연도·가구원), 시군구, 가족 대상 범주와 대체조건 OR 논리 검증. 미확인 `CHECK`; 불확실한 텍스트를 근거로 `NO` 남발 금지.
- 정상 샘플/오인식/상충/비대상/경계 테스트 추가. 검증된 필드만 `programs`에 증분 전파할 경로 설계 및 별도 변경 검토.
### P0-D: 전국 대표/지역 자체 별개 및 검색 전수성
- 부모급여 등 전국 제도는 대표 1개만(동일제도 키 + 공식 근거). 지방정부의 **독립 추가지원**은 결코 대표 제도에 병합하지 않는다. 단순 명칭만으로 전국 판정 금지.
- `인천 거주 + 부모급여` 조회에서 전국 대표 1개, 인천 자체 별도(공식 확인된 경우), 타지역 전용 제외, 지역미상 확인 필요; 서울·제주·경북·군구 및 동일이름 중복 회귀 케이스.
- 현재 프론트 `scanPage`의 `maxRows=1000` 제한 및 클라이언트 후필터 탓에 실제 DB 전체에서 누락되는 문제: **서버측 DB 전체 조건/지역 검색** 또는 동등하게 정확한 커서 페이징으로 해결. 지역·연령·소득·가구 필터가 모든 페이지에서 일치해야 함.
- `national-catalog.json`의 VERIFICATION/대표 제도 실제 근거와 출시 상태 확인, 프론트·서버 필터 동기화, 지역 불명/전국 구분 필드 보강.
### P1: 범위·운영 효율
- Bizinfo 1,347 vs 과거 3,000 추정치 근거 차이 확인, 별도 공식 API/과거 공고 스코프 조사(추가 호출은 별도 쿼터 준수).
- 자동수집 재개 전 수동 원본 캐시 공유하여 이미 수집된 Gov24 DETAIL 재호출하지 않도록 통합. **자동 서비스 재시작 금지**.
- 만료 공고 일괄 삭제/archiving, Worker scheduled purge와 증분 수집 간 안전성 감사.
- 공개 웹/Worker 실제 배포는 검증 완료 뒤 별도 승인 단계. 기존 운영 경로 보호.

## 4. 검사·수동 단계
```bash
cd ~/policy-benefit-matcher
git status --short && git branch --show-current && git fetch origin
git pull --ff-only
docker compose ps
npm test && npm run check && npm run build
(cd worker && npm test && npm run check)
docker compose run --rm --no-deps collector python -m unittest discover -s tests -v
bash scripts/stage-official-to-d1-imac.sh --dry-run
```
실제 원본 스테이징에만 쓰려면 검증 후 `bash scripts/stage-official-to-d1-imac.sh --apply-remote`. 원격 인증 및 용량/쿼터/SQL 배치 확인 전 실행 금지. 별도 사용자 승인 없이 Worker/사이트/공개 `programs` 배포 금지.

## 5. 완료 판정/보고
- 수집수치·API 한도·D1 원본 행 수와 새/갱신/변경 없음/오류 각각 집계하고 원본 누락/원천 ID 오류=0.
- 전국 제도 대표 중복 0, 지역 자체 추가지원 누락 0(검증 샘플 기준), 명백한 타지역 오노출 0, 미확인 조건 자격 확정 0.
- 전체 DB 커서/마지막 페이지 포함 조건별 검색 검증, 동일 batch 재반영 결과 idempotent, 기존 공개 DB 행 손상 0.
- 실제 실행 가능한 범위는 코드·테스트·GitHub 반영 후 커밋 SHA/PR #13·실행 로그로 보고. 미실행은 미실행, 실패는 실패로 기록.
