# 2026-11-20 조건검색 및 D1 원본 선적재 인계

## 확정 방향
수집이 완료될 때까지 기존의 공개 `programs` 테이블은 건드리지 않고 공식 API 원문을 **별도 D1 스테이징** `official_source_snapshots`에 먼저 축적한다. 공식 원본 데이터에 대한 접근이 쉬워지며 최종 매칭 및 공개 적용은 검증이 끝난 뒤 진행한다. 수동 API 재수집, GitHub Actions, 자동수집 재시작, Worker/웹 배포는 포함되지 않는다.

### 수집 상태 (2026-11-20 실제 터미널)
- 정부24 목록 10,891 / 10,891건. 상세 4,440건, 조건 4,439건, 상세+조건 모두 4,439건, 나머지 6,452건.
- 기업마당 현재 연결된 목록 API 1,347/1,347건. 예전 약 3,000건과의 차이/다른 API 공고는 아직 검증할 사항.
- 정부24 API 10,000회/일 도달로 로컬 차단 완료. 내일 사용할 수 있는 한도는 KST/UTC 양쪽 장부 확인 필요.

### 재실행 가능 D1 선적재
- `migrations/0003_official_source_snapshots.sql`: 기존 `programs`와 별개인 공식 원본(JSON+SHA-256) 테이블.
- `scripts/build-manual-full-data.py`: Docker persistent volume 원본 LIST+DETAIL+CONDITIONS 통합, 출처·ID·완전성 감사.
- `scripts/build-d1-staging-sql.py`: 중복 ID/오염된 Gov24 상세 원본 차단, 상태별 해시 계산, 기존 상세를 지우지 않는 UPSERT 생성. 원본 변경 때 검토상태 PENDING으로 되돌림.
- `scripts/stage-official-to-d1-imac.sh`: 기본 `--dry-run`으로 원본 내보내기·SQL 생성만. `--apply-remote`를 명시한 경우에만 기존 Cloudflare 운영 D1의 **스테이징 테이블만** 변경.
- API 키·프로필·Worker 인증 토큰은 D1 스테이징 파일에 포함하지 않는다. 공개 프로그램 목록은 증분 저장 후에도 그대로다.

## 수동 실행 (iMac)
**이미 다른 터미널에서 수동수집 중이라면 해당 작업 종료 후 수행.**

```bash
cd ~/policy-benefit-matcher
git pull --ff-only
docker compose run --rm --no-deps collector python -m unittest discover -s tests -v
npm test
bash scripts/stage-official-to-d1-imac.sh --dry-run
```

테스트 및 manifest 검사 통과 후 **실제 운영 D1 스테이징에 적재하려면**:

```bash
bash scripts/stage-official-to-d1-imac.sh --apply-remote
```

이 명령은 Wrangler 로그인/Cloudflare D1 쓰기 권한이 있어야 한다. D1에 쓰기가 발생하며, 공개 검색용 `programs` 데이터는 수정하지 않는다. 운영 D1에는 주로 이미 공개된 지원사업 데이터가 저장돼 있어도 삭제·변경은 지양한다.

```bash
cd ~/policy-benefit-matcher/worker
npx wrangler d1 execute policy-benefit-db --remote --command "SELECT source, COUNT(*) AS total, SUM(detail_complete) AS detail_count, SUM(conditions_complete) AS conditions_count FROM official_source_snapshots GROUP BY source"
npx wrangler d1 execute policy-benefit-db --remote --command "SELECT source, COUNT(*) AS total FROM programs GROUP BY source"
```

전체 수집 종료까지 동일 명령을 재실행하여 새 상세·조건의 누락분만 갱신 가능. 스테이징 원본은 `programs`의 구조적 적합성 판단에 자동 사용되지 않는다.

## 조건검색 코드
- `src/lib/matching.ts`: 연령, 중위소득 구간, 자녀수·출생연도, 임신, 혼인, 가구원, 주거, 재직, 사업유형, 접수기간을 비교. 미검증 JA 지원조건 코드만으로 `NO`를 반환하지 않고 `CHECK`로 처리. 검토된 조건 및 명백한 불일치는 `NO`.
- `src/lib/territory.ts`: 지역명·지자체 기관·공고 제목·거주 요건의 상충 여부를 구분하며 불분명한 지역을 전국으로 간주하지 않음.
- `src/lib/region-visibility.ts`: 내 지역·전국·지역 확인 필요 기본 노출, 다른 지역 확정은 기본 검색에서 제외. `전체 지역 비교`는 별도로 선택 가능.
- `src/routes/+page.svelte`: 사용자의 시·도/시군구·조건 설정과 `displayRegion`, `matchProgram` 결과를 이용한 클라이언트 필터/정렬. 세부조건이 미확인이라고 자격 확정으로 노출하지 않음.
- `tests/matching.test.mjs`, `tests/default-region-search.test.mjs`: 지역·가구·중위소득·연령 판정 회귀 테스트.

**한계**: 대규모 전체 목록을 페이지별로 읽어온 뒤 브라우저에서 필터링하므로 전체 검색 결과를 조건별로 빠짐없이 비교하는 **서버측 조건검색은 아직 별도 개발·검증 대상**이다. 또한 공식 상세조건의 구조화/검증 완료가 필수이며, 현재 4,439건 원본 수집만으로 자격 판정이 100% 정확해지는 것은 아니다.

## 미완료
1. iMac에서 Python/Node 테스트 및 dry-run 실행 확인.
2. Wrangler 실제 remote D1 스테이징 적재 및 건수·해시 검증.
3. 사업별 원본 상세조건을 정규화하여 `programs` 검색용 필드에 안전하게 병합하는 별도 마이그레이션, 지역·연령·소득 근거 검증.
4. 기존 API 검색의 DB 레벨 필터/전체 페이지 정확도 보강 및 통합 테스트.
5. 검증 후 공개 Worker/Pages 배포. 배포 전엔 사용자 검색화면이 변경됐다고 주장하지 않음.

현재 GitHub 반영은 브랜치 `fix/default-regional-search-20261120`이며 PR #13에서 통합 검토 중. 이 문서는 실행 증거와 미완료 항목을 구별한다.
