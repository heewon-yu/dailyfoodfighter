# 추가 정보 전체 수집 — iMac 읽기 전용 (2026-11-20)

## 2026-11-20 API 승인 일일 한도 100% 사용

- Gov24 승인 일일 10,000회, Bizinfo 승인 일일 1,000회. `API_BUDGET_PERCENT=100`으로 두 소스를 각각 100%까지 사용하도록 코드와 Docker 기본값을 변경했다.
- `reserve()`가 실제 요청 직전에 기존 `/state/api-usage.json`의 **KST와 UTC 일일 호출량 중 큰 값**을 확인하고 소스별 누적 호출 수를 저장한다. 10,000/1,000회에 도달하면 추가 호출 차단. 실패한 외부 요청 시도도 호출량으로 계산.
- `.env`에 기존 `API_BUDGET_PERCENT=90`이 있다면 Docker Compose 기본값 100보다 `.env`가 우선한다. iMac 명령 앞에 `API_BUDGET_PERCENT=100`을 지정하거나 `.env`를 100으로 수정해야 한다.
- API 제공자 측 계정·키에 실제로 허용된 한도가 10,000/1,000회인지 확인할 것. 별도 앱이 같은 키를 쓰면 로컬 장부에 없는 호출이 추가돼 초과 가능. 제공자 측 요금제/초당 제한까지 확대되는 것은 아니다.
- 정기 자동수집 서비스 정지 상태는 코드 수정만으로 변경되지 않는다. 일회성 `docker compose run --rm --no-deps` 수집으로 진행한다.

```bash
cd ~/policy-benefit-matcher
git pull --ff-only
API_BUDGET_PERCENT=100 docker compose run --rm --no-deps collector python -m unittest discover -s tests -p 'test_quota.py' -v
API_BUDGET_PERCENT=100 docker compose run --rm --no-deps collector python -c 'from quota import quota_config; print("GOV24",quota_config("GOV24")); print("BIZINFO",quota_config("BIZINFO"))'
API_BUDGET_PERCENT=100 docker compose run --rm --no-deps collector python read_only_gov24_details.py --max-calls 1500
```

각 API 키에 대한 실제 하루 누적량은 `/state/api-usage.json`을 별도로 확인한다. 기존 호출 사용량을 0으로 변경하거나 파일을 삭제하지 않는다.
## 자동수집 중지 상태에서 수동 전체 데이터 확보 (중복 API 방지)

- 자동수집 서비스는 정지 상태를 유지한다. 아래 일회성 docker compose run 명령은 동일 Compose 프로젝트의 기존 named volume을 공유해 `/state/api-usage.json`과 수집 원본을 재사용한다. 별도의 정기 수집 서비스는 시작하지 않는다.
- 정부24 10,891건과 기업마당 1,347건의 LIST 원문은 이미 저장됐으므로 목록 API를 다시 호출하지 않는다.
- 정부24 serviceDetail/supportConditions은 source_id, endpoint, 행의 서비스ID가 일치하고 비어 있지 않은 캐시 파일만 재사용한다. 빈 응답이나 ID 불일치는 별도 재검증 대기로 남긴다.
- 기존 D1에 정규화 공고가 있다는 것만으로 API 원문 상세정보와 지원조건이 저장됐다고 간주하면 안 된다. 저장된 원문은 건너뛰고, D1에 이미 존재하는 ID는 로컬 보고서에 표시한다.
- 기업마당 원본 22개 필드는 기존 1,347건 JSON에 이미 전부 보존돼 있으므로 추가 API 호출이 필요 없다. 공공데이터포털의 별도 API는 승인된 키 확인 전 호출하지 않는다.

### iMac 터미널: 자동수집 정지 유지

```bash
cd ~/policy-benefit-matcher
git fetch origin
git switch fix/default-regional-search-20261120
git pull --ff-only
docker compose ps
docker compose run --rm --no-deps collector python -m unittest discover -s tests -p 'test_read_only_gov24_details.py' -v
docker compose run --rm --no-deps collector python -m unittest discover -s tests -p 'test_build_manual_full_data.py' -v
docker compose run --rm --no-deps collector python read_only_gov24_details.py --max-calls 1500
```

상세 수집 명령은 재실행 가능하며 기존 유효 원문 캐시를 건너뛴다. 등록된 API 사용량 원장이 승인 일일 예산을 지키고, 넘기면 당일 중단한다. 원본 Gov24 세부 응답 10,891종 × 2회 조회는 여러 회차가 필요할 수 있다.

### 저장된 원문 결합 및 D1 baseline 중복 확인 (API 호출 0)

```bash
cd ~/policy-benefit-matcher
mkdir -p audit-artifacts
docker compose run --rm --no-deps collector python read_only_gov24_details.py --summary-only
docker compose run --rm --no-deps collector python audit_official_fields.py
docker compose run --rm --no-deps -v "$PWD/audit-artifacts:/export" collector python -c 'import shutil; shutil.copytree("/state/read-only-catalog", "/export/read-only-catalog", dirs_exist_ok=True)'
python3 scripts/build-manual-full-data.py
python3 scripts/audit-national-source-snapshots.py
```

출력 `audit-artifacts/manual-full-data/gov24-full-original.json`, `bizinfo-full-original.json`은 기존 원문을 병합한 로컬 결과이며 `manual-full-data-report.json`에 API 원문 유효성, 상세 정보 결측, 기존 D1 baseline ID 포함 여부가 기록된다. 공식 전국/지역 적합성은 자동 확정하지 않는다. 운영 D1/Worker와 배포는 변경하지 않는다.
## 현재 실제 완료

- 정부24 LIST: 원천 10,891 / 10,891, 109페이지, 중복 0, 완료.
- 기업마당 LIST: 원천 1,347 / 1,347, 14페이지, 중복 0, 완료.
- 이 수치는 **각 API의 LIST 응답 페이지**를 뜻한다. 정부24의 개별 상세 10,891건 및 지원조건 10,891건은 미수집.

## 정부24: 추가로 받을 수 있는 정보

- `serviceDetail`: 지원대상, 선정기준, 지원내용, 신청방법·기한, 구비서류, 온라인 신청 URL, 근거법령 등 소스 원문 필드.
- `supportConditions`: 연령 범위, 중위소득 대역, 가족·생애주기·고용상태·기업 조건 등 원문 JA 플래그.
- 총 원천 서비스 10,891건 각각 **두 API 호출**, 최대 약 21,782건의 상세 조회가 필요하다. 기존 scheduler와 같은 `/state/api-usage.json` 사용량 원장을 공유하므로 일일 승인 한도 및 기존 정기 수집 예산을 침범하지 않도록 실행을 나눌 것.
- `collector/read_only_gov24_details.py`는 원천 LIST가 완료되었을 때만 실행되고, 중앙부처 담당 표시를 우선 조회하되 이를 전국 단위 자격 판단 증거로 취급하지 않는다.
- 저장 경로 `/state/read-only-catalog/gov24/details/{서비스ID}/{detail,conditions}.json`. 있던 결과는 재요청하지 않으며 각 필드는 원문 그대로 저장.
- 상세 API 빈 응답은 저장하되 결측으로 별도 로그를 남긴다. `details_complete`는 두 엔드포인트의 응답 파일 존재 기준이므로 **상세 필드가 충분하거나 자격이 검증됐다는 뜻이 아니다**.

## 기업마당: 추가 조회 범위

- 이미 저장한 원본 `page-*.json`은 정규화 단계에서 버렸던 모든 원본 JSON 필드를 보존한다. 소관·수행기관, 신청기간, 대상, 지원 분야, 사업신청방법, 문의처, 첨부파일 URL 등 실존 여부를 오프라인에서 감사할 수 있다.
- 기업마당 `bizinfoApi.do` 공식 명세는 최신 지원사업 **목록형 API**와 각종 항목을 안내한다. API의 다른 엔드포인트가 각 공고마다 더 상세한 데이터를 제공한다는 근거는 아직 없다. 무허가 사이트 스크래핑을 수행하지 않는다.
- 공공데이터포털 별도 `15157820` API는 등록일·수정일·신청 방법/문의처 등 더 많은 필드를 제공할 수 있으나, **별도 서비스 접근권한·이용허락 확인**이 필요하다. 기존 기업마당 인증키가 자동으로 해당 API에 통한다고 가정하지 않는다.
- 소스 라이선스: 공공데이터포털 15157820은 출처 표시 및 변경 금지 유형. 본문 변형·상업 재배포는 조건을 다시 확인한다.

## iMac 명령

```bash
cd ~/policy-benefit-matcher
git fetch origin
git switch fix/default-regional-search-20261120
git pull --ff-only
docker compose exec -T collector python -m unittest discover -s tests -p 'test_read_only_gov24_details.py' -v
docker compose exec -T collector python audit_official_fields.py
docker compose exec -T collector python read_only_gov24_details.py --max-calls 200
```

마지막 명령을 여러 번 실행해 `remaining=0`까지 진행할 수 있다. `--max-calls`는 실행당 상한이고 당일 호출량을 초기화하지 않는다. 공공 API 잔여 한도가 없으면 다음 날 재실행한다. 한 번에 200개 이하 호출을 권장한다. 종료 시 `detail-verification.json`에 호출량·실패·누락이 남는다.

```bash
mkdir -p audit-artifacts
docker cp "$(docker compose ps -q collector):/state/read-only-catalog" audit-artifacts/
python3 scripts/audit-national-source-snapshots.py
```

**주의:** `docker compose run`으로 새 컨테이너/별도 상태 볼륨을 만들지 말고, 기존 운영 collector에 `docker compose exec`를 사용한다. 인증키·원문 데이터를 GitHub에 올리지 않는다. 원천 전체 목록을 가져온 시점과 상세 조회 시점이 다르므로 필드 변경 가능성도 보고한다. 운영 D1/Worker와 Pages 배포는 실행하지 않는다.