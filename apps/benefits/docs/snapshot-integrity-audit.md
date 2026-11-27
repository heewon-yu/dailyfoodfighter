# 공고 스냅샷 완전성 검증 (읽기 전용)

## 이 테스트가 입증하는 것

검증 시점에 **별도로 확보한 기준 공고 ID**와 실제 Worker `/api/programs`의 커서 기반 조회 결과를 끝까지 비교한다. 50건씩 화면에 표시하는 `scanPage` 로직으로 조회하며, 1,000건을 넘는 원천 검색 구간도 이어서 탐색한다.

- 공고 ID 누락/추가 및 페이지 간 중복 검출
- `maxRows=1000`은 **한 페이지 스캔 예산**이지 전체 조회 상한이 아님을 검증
- 지역/자녀 조합은 `scenarios[].expectedIds`를 **별도 수작업 또는 독립 기준**으로 설정해야 함
- API 호출 횟수, 조회한 원천 행 수, 전체 경과시간 기록
- 이 감사는 실제 브라우저 클릭/DOM E2E 테스트나 원천 정부 API 수집 완전성 검사와 다름

### 1) Codex/GitHub Actions 없이 고정 회귀 테스트

```bash
cd ~/policy-benefit-matcher
git fetch origin
git switch --track origin/test/snapshot-pagination-integrity-20261120
npm test
npm run check
```

`tests/snapshot-integrity.test.mjs`는 **1250개 로컬 가짜 공고**로 전체 ID 비교, 인천+자녀 대상 공고의 1,000건 이후 발견, 누락·추가 ID, 잘못된 개인 정보 API 파라미터를 검사한다. 실제 운영 D1에 요청하지 않는다.

### 2) 로컬 DB 사본으로 독립 기준 스냅샷 만들기

**반드시 Worker가 조회할 DB와 같은 시점의 로컬 SQLite 사본을 사용**한다. 운영 `--remote`를 사용하지 않는다.

```bash
mkdir -p audit-artifacts
python3 scripts/export-audit-snapshot.py /absolute/path/to/local-d1.sqlite audit-artifacts/baseline.json
```

파일은 Git에 포함하지 않는다. `source=local-read-only-sqlite` / `capturedAt` / `asOfKstDate`가 기록되며, 확정 만료 공고 및 CLOSED/ARCHIVED 공고를 제외한 ID가 기준이다.

로컬 Worker 실행은 현재 프로젝트의 `worker/wrangler.toml` D1 바인딩을 사용한다. Wrangler 로컬 DB와 스냅샷 사본이 다른 파일이면 **검증 불일치가 정상적으로 발생할 수 있으므로 먼저 DB 파일을 맞춰야 한다.**

```bash
cd worker
npx wrangler dev --local --port 8787
```

별도 터미널:

```bash
cd ~/policy-benefit-matcher
node scripts/verify-snapshot-integrity.mjs audit-artifacts/baseline.json http://127.0.0.1:8787/api/programs
```

출력된 `missing`·`extra`가 0이고 끝까지 읽었을 때만 해당 스냅샷 기준 PASS이다. 실행이 멈추거나 후속 커서 조회가 실패하면 FAIL로 종료한다.

### 3) 필터 시나리오의 정답 작성

스냅샷의 `scenarios`에 `name`, `params` (공개 검색 파라미터), `profile` (로컬 검사 전용), `regionMode` (`mine`, `unknown`, `all`), `personalFirst`, **독립적으로 준비한 `expectedIds`** 배열을 추가한다.

예시:

```json
{
  "name": "인천 자녀 1명",
  "params": {"availability": "review", "category": "WELFARE"},
  "regionMode": "mine",
  "profile": {"regionSido": "인천광역시", "childrenCount": 1, "childBirthYears": "2025"},
  "personalFirst": true,
  "expectedIds": ["GOV24:검증된_ID"]
}
```

**위 ID는 예시 형식일 뿐 실제 공고 ID가 아니다.** 원본 자료를 독립적으로 확인하여 모두 교체한다. 개인 정보는 GET 요청 파라미터로 보내지 않는다.

현재 스크립트는 제목·지역·개인 자격 판정에 대해 생산 코드를 재사용하므로, 필터 엔진 자체의 정확성을 독립적으로 증명하지는 못한다. 별도의 공식 공고 기반 정답표와 수작업 검증이 필요하다.

### 안전·한계

- 이 스크립트들은 로컬 DB에 쓰지 않고, 운영 D1을 읽거나 수정하지 않는다.
- 원격 URL은 `--allow-remote` 없이 거부하며, 대량 운영 요청을 권장하지 않는다.
- 실서비스 Worker와 화면의 실제 결합 E2E를 확정하려면 별도 브라우저 자동화가 필요하다.
- 기준 DB와 대상 Worker가 같은 스냅샷을 조회하지 않거나 중간에 수집 데이터가 바뀌면 비교는 의미가 없다.
- 데이터가 애초에 수집되지 않았다면 이 검증만으로 원천 데이터 누락을 찾아낼 수 없다.
- GitHub Actions, 실서비스 배포, Docker 재시작, D1 삭제·수정은 하지 않는다.
