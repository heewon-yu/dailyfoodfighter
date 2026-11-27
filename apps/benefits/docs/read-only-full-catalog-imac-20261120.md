# iMac: 정부24·기업마당 API 읽기 전용 전체 스냅샷 (2026-11-20)

원천 API의 **실제 전체 목록**을 운영 D1에 쓰지 않고 가져오는 독립 명령. GitHub Actions와 Worker/D1 ingest, 기존 collector scheduler 코드, 기존 source snapshot cursor는 사용하지 않는다.

## 안전 조건

- 기존 실행 중인 Docker collector **안에서** 실행한다. 그래야 기존 `/state/api-usage.json` 일일 한도 원장을 공유한다. `docker compose run`으로 새 별도 볼륨을 만들지 않는다.
- `collector/read_only_full_catalog.py`는 `gov24.request_data('list')`와 기업마당 공식 list API만 호출한다. Gov24 detail/conditions는 별도 예산이며 이번 전체 목록 단계에서는 조회하지 않는다.
- 결과는 기존 Docker named volume의 `/state/read-only-catalog/{gov24,bizinfo}/page-*.json`에 페이지 단위로 원문 저장하고 별도 manifest를 만든다.
- 수집 횟수 `--max-pages`는 한 번의 실행당 상한이며, 중단하면 checkpoint부터 재개한다. 분당 호출 제한과 운영 예약 수집을 고려해 배치 실행한다.
- page count와 공식 reported_total이 일치하고 중복 ID가 없어야 source_complete=true. 페이지 변화·한도 초과·오류 시 중단, 기존 결과는 보존된다.
- 전체 목록과 상세 자격 확인은 다르다. URL·대상·지원내용 검증은 공식 원문별 추가 검토가 필요하다.

## 1. iMac 터미널: 먼저 코드와 단위 테스트

```bash
cd ~/policy-benefit-matcher
git fetch origin
git switch fix/default-regional-search-20261120
git pull --ff-only
docker compose exec -T collector python -m unittest discover -s tests -p 'test_read_only_full_catalog.py' -v
npm test
npm run check
```

이전에 PR #13 초기 실행에서는 101개 중 1개 테스트가 기존 정책 기대값 때문에 실패했다. 그 테스트 수정 이후 통합 회귀 로그는 아직 확인되지 않았다. 테스트 실패 시 전체 수집 진행 전에 분석한다.

## 2. 정부24 / 기업마당 전체 목록 (쓰기 없음)

```bash
cd ~/policy-benefit-matcher
docker compose exec -T collector python read_only_full_catalog.py --source gov24 --max-pages 25
docker compose exec -T collector python read_only_full_catalog.py --source bizinfo --max-pages 25
```

각 명령 끝에 `source_complete: true`가 나오는지 확인한다. `INCOMPLETE`이면 **동일한 명령을 재실행**하면 다음 페이지부터 이어받는다. 기한/쿼터를 넘지 않도록 분할 실행한다. 필요한 API 호출 수는 원천 API 총건수/100을 올림한 값 이상이며 실제 total은 응답마다 확인한다.

## 3. 읽기 전용 원천 데이터 로컬 복사

```bash
cd ~/policy-benefit-matcher
mkdir -p audit-artifacts
docker cp "$(docker compose ps -q collector):/state/read-only-catalog" audit-artifacts/
python3 scripts/audit-national-source-snapshots.py
```

`audit-artifacts/`는 .gitignore에 등록된 로컬 자료 보관함. raw 페이지와 누락 ID 표본, 원천 reported_total 대조 결과는 GitHub에 업로드하지 않는다. 명령 실행 결과에는 API 키가 표시되지 않는다.

## 확인 사항

- 수집기 외부에 API 키를 붙여 넣지 말 것. Docker의 `GOV24_API_KEY`, `BIZINFO_API_KEY`를 내부에서 사용한다.
- `api-usage.json`은 운영 스케줄러와 공유되므로 별도 전체 조회를 하면 남은 당일 호출 예산이 감소한다.
- Gov24 및 Bizinfo 원천 전체 목록 **완료되기 전에는** `전체 수집 완료`라고 보고하지 않는다.
- 매칭 UI는 전국 공식 대표 공고당 1개 + 내 지역 추가지원 + 지역 미확인 정책. 정적 전국 후보 12종 중 공식 출처 검증 상태 7종만 공개 대상으로 분류해 두었다.
- 이번 코드는 D1 읽기/쓰기, 수집기 스케줄과 상태 원장을 변경하지 않지만 **원천 API 읽기 호출은 실제 발생한다**.