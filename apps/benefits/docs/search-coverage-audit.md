# 검색 누락과 중복을 반복 검증하는 방법

테스트는 GitHub Actions나 운영 D1 접속 없이 로컬 iMac 터미널 또는 Codex 환경에서 실행할 수 있다. Worker와 페이지 탐색 검증에는 Node.js 22.18 이상이 필요하다. 사용자가 저장한 공식 원본으로 감사할 때는 Python 3.10 이상과 기존 Docker 상태 볼륨이 필요하다.

```bash
npm test
npm --prefix worker test
docker compose run --rm --no-deps -v "$PWD:/repo:ro" -w /repo/collector \
  -e STATE_DIR=/tmp/benefits-tests -e GOV24_DAILY_FULL_CATALOG=NO \
  -e GOV24_INCREMENTAL_ENABLED=NO -e CONFIRM_GOV24_BULK_QUOTA=NO \
  collector python -m unittest discover -s tests -q
bash scripts/stage-official-to-d1-imac.sh --dry-run
python3.11 scripts/verify-d1-staging-local.py
python3.11 scripts/build-search-audit-snapshot.py --output audit-artifacts/search-audit.sqlite
node scripts/audit-search-coverage.mjs audit-artifacts/search-audit.sqlite
```

`--dry-run`은 원본 복사와 SQL 파일 생성만 한다. 생성 경로는 Git에서 제외된다. 스냅샷 생성기는 기존 파일을 덮어쓰지 않으므로 재생성할 때는 새 파일명을 지정한다. 운영 D1에서 별도로 승인받아 확보한 SQLite 스냅샷도 마지막 명령에 직접 지정할 수 있다.

감사 명령은 원본 전체를 한 번 훑어 기대 결과 ID를 만들고, 실제 Worker와 브라우저의 페이지 탐색 코드가 마지막 페이지까지 반환한 ID를 대조한다. 인천·연수구, 제주, 소득·자녀·사업자, 접수 상태, 전국 대표, 소관기관·검색어, 각 분야와 세부 분야 등 32개 시나리오에서 누락·초과·중복 건수를 출력한다. 차이가 있으면 실패 상태로 종료한다. 자동 회귀에는 첫 1,000건 뒤의 예상 ID를 코드와 독립적으로 고정한 표본 테스트가 포함된다.

이 결과는 해당 스냅샷과 검증한 조합에서의 검색 전달 정확도를 뜻한다. 원천 API에 없는 공고나, 원문 증빙이 부족한 자격조건의 판단까지 보증하지 않는다. 원본에서 재구성한 검색 스냅샷은 운영 D1의 실제 사본과 구별한다.

## 2026-11-20 로컬 검증

- 32개 검색 조합에서 누락·초과·중복은 각각 0건이었다. 인천 기본 모드는 기대 3,528건과 일치했다.
- 공식 원본 12,238건으로 재구성했다. 정부24 10,891건, 기업마당 1,347건이다. 정규화에 실패한 행은 없었다. 검색 대상에서 제외되는 마감 공고는 원본에는 보존된다.
- 스테이징 SQL은 최초 12,238개 행을 삽입했고 동일 SQL 재실행에서 변경 0건이었다. SQLite의 별도 공개 공고 행은 그대로였다.
- 같은 로컬 SQLite에서 복지 목록 5,000건 뒤 조회 비교. 기존 업데이트순 OFFSET은 임시 정렬을 만들었고 약 206,860 VM 명령, 같은 최신 인덱스를 사용하는 OFFSET은 약 63,060 명령, 키셋 커서는 약 1,320 명령을 실행했다. 키셋 조회에는 다음 페이지 존재 여부 확인용 한 행이 포함된다. VM 명령 수는 D1 과금 행 수가 아니다.
- 기존 D1 Insights의 최근 24시간 관측에서 웹 검색 관련 상위 쿼리는 약 624만 읽기, 상세 보강 대상 조회는 약 265만 읽기였다. 자정 UTC 기준의 동일한 쿼터 기간 집계는 아니다. 현재 브랜치는 기존 키셋 인덱스와 공개 첫 페이지 캐시를 사용한다. 임의 문자열 검색과 큰 범위의 관리자 감사는 여전히 많은 후보 행을 살펴볼 수 있다.
- 이번 검증은 운영 D1 쿼리와 외부 API 호출을 하지 않았다. 운영 제한 해제가 확인된 뒤 승인된 스테이징 쓰기·필요한 최소 조회로 D1 실제 수치를 확인해야 한다.
