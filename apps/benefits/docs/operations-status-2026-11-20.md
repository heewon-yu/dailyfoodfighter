# 혜택찾기 운영 인계 및 실측 상태 — 2026-11-20

> 기준: 2026-11-19 KST 사용자 iMac 터미널 로그 + GitHub 소스 확인. **운영 중인 iMac에 원격 접속하여 직접 실시간 확인한 결과는 아님.** 2026-11-20 시점의 연속 가동 여부는 별도 확인 필요. 아래의 수치들은 2026-11-19 스냅샷으로, 누적 DB 전체 건수가 아니다.

## 1. 프로젝트와 운영 주소

- 프론트엔드: https://dailyfoodfighter.com/benefits/ (기존 dailyfoodfighter 사이트의 `/benefits/`).
- 수집/웹 소스: [heewon-yu/policy-benefit-matcher](https://github.com/heewon-yu/policy-benefit-matcher).
- 웹 정적 배포 저장소: [heewon-yu/dailyfoodfighter](https://github.com/heewon-yu/dailyfoodfighter); 게임 경로와 블로그는 별개.
- Cloudflare Worker: https://policy-benefit-api.leemovie89.workers.dev (service `policy-benefit-api`).
- Cloudflare D1: `policy-benefit-db`.
- 실행: iMac M1의 Docker Compose `collector` 서비스. GitHub Actions 사용하지 않음.
- 개인정보 프로필: 브라우저 로컬 저장, 수집기/D1로 전송하지 않는 설계.

## 2. 완료·검증 근거

### 프론트엔드와 공유 이미지

- SvelteKit 매칭·지역 등 테스트 24/24 성공, `svelte-check` 0 errors / 0 warnings, 블로그 정적 빌드 성공 (2026-11-19 사용자 로그).
- 개인·가구 유형에 따른 맞춤 매칭과 14개 세부 토픽 탐색 UI의 코드 반영. 일부 자격 정보는 원본 공고의 상세 누락으로 판정 불확실.
- 블로그 `main`에 공유 이미지 및 OG 메타 포함된 빌드 push: `849b65d` (파일 `benefits/og-benefits-20261119.jpg`, 90,652바이트).
- 카카오톡 실제 미리보기/캐시 초기화와 최신 Cloudflare Pages 게시 여부는 이 자료로 완전 검증되지 않음. 이미지 경로: https://dailyfoodfighter.com/benefits/og-benefits-20261119.jpg .

### Worker와 수집기

- Worker `policy-benefit-api` 배포 사용자 로그 확인: version `b88f670d-f5dc-4f43-b40a-06a6f987e1c0`. D1 바인딩 확인, Worker cron은 **만료 공고 정리**, 정부24/기업마당 데이터 수집이 아님.
- 기업마당 대상 유형 공백 정규식 수정: GitHub `5bfcc47`.
- 수집기 테스트 간 영속 상태 혼입/장시간 실행 수정: `4013977`. 사용자 iMac Docker에서 전체 **63 tests, OK, 0.021s** 확인.
- Docker `Collector ready: True` 확인. 이는 환경변수/할당량 형식 준비 신호이지 모든 API 연결 증빙은 아니다. 이후 아래 실제 수집 로그가 연결 및 업로드 성공의 직접 근거.
- 수동 정부24 전체 목록 스캔 (2026-11-19): **22 batches, fetched 10,887, changed 1,385, uploaded 1,385, complete true**. `fetched`는 API 목록에서 읽은 행 수로 DB 저장 총건수가 아니다.
- `docker compose up -d --no-deps collector` 실행 후 동일 `collector-1` 컨테이너가 `Running`으로 유지됨. 여러 번 `up -d`해도 별도 컨테이너가 중복 생성된 증거 없음.
- 14:00 KST 자동 수집 회차 완료: `fetched=1371, changed=1361, uploaded=1361, completed_slot=2026-11-19T14:00:00+09:00`. **1,361건이 전부 신규라고 확정할 수 없으며, 비정상적으로 높은 변경 판정 비율을 재확인할 것.**
- 2026-11-19 15:33:19 KST `status.py`: last slot 14:00; next slot 16:00; `Collection due: no`; 정부24 예약 사용량 3,017 / 9,000, 기업마당 14 / 900. 이것은 해당 시점의 값이며 현재 사용량을 뜻하지 않음.

## 3. 확정 운영 정책

| 항목 | 운영 정책 |
| --- | --- |
| 수집 시간 (KST) | 10:00, 12:00, 14:00, 16:00, 18:00 |
| 정부24 API 승인량 / 내부 상한 | 10,000회/일 / 최대 9,000회 (90%) |
| 기업마당 API 승인량 / 내부 상한 | 1,000회/일 / 최대 900회 (90%) |
| 초기 수집 | 전체 목록 페이지 스캔, 페이지 진행점/호출 예산 유지 |
| 지속 수집 | 변경 해시 선별 + 상세/조건 백필; 현재 하루 1회 전체 목록 스캔도 설정됨 |
| 삭제 정책 | 신청 종료/만료 공고는 원칙적으로 D1 영구 삭제, 원천 목록 누락에 의한 삭제는 충분한 검증 필요 |
| 자동 실행 | Docker Desktop 실행, iMac 전원 및 절전 방지, 인터넷 연결 필요 |
| API 비밀정보 | 로컬 `.env`와 Cloudflare Worker secret, 문서/채팅/커밋에 넣지 않음 |
| GitHub Actions | 사용 안 함 |

자동 수집기 스케줄링/컨테이너 복구는 `collector/scheduler.py`와 `docker-compose.yml`에서 수행된다. iMac 절전/종료 중에는 신규 데이터가 갱신되지 않고, 이미 D1에 저장된 웹 조회는 계속 가능하다. 수집은 최신 D1 저장 이후 웹에서 다시 조회할 때 반영되며 정부 원본 변경 즉시 반영되는 것은 아니다.

## 4. 중복 방지 실제 구현과 아직 남은 부분

- `collector/pipeline.py`는 같은 실행 내 `(source, source_id)`를 한 번만 유지하며, SHA-256 `content_hash`를 계산한다.
- `POST /api/ingest/check`는 D1의 동일 원천 ID와 해시를 비교해 **차이가 있는 레코드만** 업로드 대상으로 알려준다. 오류 시 모든 건을 변경으로 간주하지 않고 실패한다.
- Worker의 D1 저장은 `ON CONFLICT(id)` upsert 사용; 별도 행 중복 적재를 방지한다.
- 스케줄러는 마지막 성공 슬롯을 영속 저장해 같은 시간대의 중복 완료 작업을 방지한다.
- **하지만 원천 API 목록을 다시 조회하는 것은 여전히 발생**한다. `GOV24_DAILY_FULL_CATALOG=YES`라면 하루 1회 전체 목록을 재스캔한다. 수동 `bootstrap.py` 완료가 스케줄러의 일일 완료 마커까지 함께 설정되는 것은 아니어서 당일 자동 회차가 다시 전체 목록을 조회할 수도 있다.
- 최초 전체 수집 1,385건과 직후 자동 회차 `changed=1361`은 해시 값의 불안정성, 상세 백필과 목록 스텁 간 차이, 원천 값 변화, 또는 조회 집합 차이를 실제 비교해야 한다. **중복 없는 신규 공고 1,361건이라고 간주하지 말 것.**
- 원천별 API 절대 호출 자체를 중복 0으로 만드는 구현은 아직 확인되지 않았다. 재검증 주기는 정보 최신성과 호출량 간 절충이 필요하다.

## 5. 운영자 점검 명령 (비밀키 출력 금지)

```bash
cd ~/policy-benefit-matcher
docker compose ps
docker compose logs --tail=80 collector
docker compose exec collector python status.py
```

재기동(필요 시): `docker compose up -d --no-deps collector`. 반복 호출은 일반적으로 같은 서비스를 유지한다. **자동 수집이 실행 중일 때 별도의 `docker compose run ... python bootstrap.py`를 동시에 실행하지 말 것.** 중복 API 호출과 상태 파일 경쟁을 유발할 수 있다.

테스트는 코드 변경 이후에만 수행:

```bash
docker compose run --rm --no-deps collector python -m unittest discover -s tests -v
```

운영 키나 `.env`의 내용은 기록하거나 공유하지 말 것.

## 6. 남은 검증·개선 (완료로 오인 금지)

1. **최우선:** 자동 회차에서 `changed=1361/1371`이 나온 이유를 원천 ID·해시·D1 기존 값으로 조사. 실제 재업로드 낭비가 확인될 때 수정. 공식 API 호출량과 D1 업로드량을 구분.
2. **일일 전체 조회 최적화:** 수동 완료 후 같은 날 자동 전체 스캔을 반복하지 않도록 진행 상태 마커를 통합하고, 이후 갱신 전략을 원천 API 제공 변경일/증분 기능에 맞춰 재설계. 단, 누락·철회 탐지 안정성을 해치지 않을 것.
3. **복지 핵심 품목 보강:** 영유아보육료, 부모급여, 가정양육수당, 유아학비, 아이돌봄서비스가 운영 DB에 수록됐는지 확인. 정부24 API에 없다면 복지로 등 공식 출처 연계 여부 별도 검토.
4. **맞춤조건 정확도:** 자녀 월령·어린이집/유치원 이용·가정양육, 지역/소득/임신 등 세부 자격. '조건 일치 / 추가 확인 필요 / 명백 불일치'를 검증하는 UI·데이터 품질 개선은 추가 과제이며 완료로 보고하지 않음.
5. **운영 검증:** 다음 예약 슬롯의 실제 실행, 웹 API 공개 응답, Cloudflare Pages 최신 배포, 카카오톡 OG 미리보기 최종 표시, 중복/마감 삭제 정합성을 추가 확인.
6. **거버넌스:** 승인된 공공 API 이용약관, 개인정보 처리방침 실운영 내용 검증, D1 보관/삭제 정책 점검.

## 7. 이력과 링크

- [프론트엔드 소스](https://github.com/heewon-yu/policy-benefit-matcher)
- [운영 웹 소스](https://github.com/heewon-yu/dailyfoodfighter)
- [Notion 프로젝트 마스터](https://app.notion.com/p/41d280abdcf3814caccbc57c90c01686)
- 배포/테스트 관련 커밋: `676f1e4` (Worker 문자열 수정), `5bfcc47` (Bizinfo 정규식), `4013977` (테스트 상태 격리), 웹 `849b65d` (OG 공유 이미지).


## 8. 2026-11-20 품질 보강 코드 반영 — 운영 배포/실DB 결과 별도 확인

이 절은 2026-11-20 GitHub `main`에 추가된 **후속 코드 변경**이다. 2026-11-19의 구버전 배포/테스트 결과와 혼동하지 말 것. 사용자 iMac의 신규 프론트 빌드, Worker 재배포, Docker 재시작 및 전체 회귀 테스트는 이 문서 작성 시점에 아직 확인되지 않았다.

### 변경 내용

- 기본 탐색에서 접수기간 미확인 공고도 포함 (API `availability=review`). 만료/명시적 종료는 제외; 미래 시작일이 명시되면 화면에 `접수 예정`으로 표시. 기존 `open` 모드는 검증 가능한 현재 접수만 반환하며 선택적으로 유지. Worker `review` 조건을 종료일 중심으로 보강.
- 프론트의 잘못된 마감일 정규식(`/\\d/` 리터럴 이스케이프 오류) 수정. 매칭 엔진의 마감일은 KST 기준으로 비교.
- 기존 자녀 출생연도 입력(예: `2022,2025`)을 사용해 *전국 공통으로 공식 연령범위가 알려진* 부모급여(0~23개월), 가정양육수당(24~85개월·미취학), 영유아/어린이집 보육료(0~5세 반), 유아학비(3~5세 반)를 보수적으로 구분. 출생연도만으로 월령 경계에 걸리면 `CHECK`; 자녀별 출생연도가 누락되면 자동 탈락하지 않는다. 어린이집/유치원 이용 여부는 여전히 개인이 공식 기관에서 확인. 기타 임의의 육아 공고에 이 전국 기준을 적용하지 않음.
- 후속 수집 로그에 원천별 목록 조회/변경/미변경 수를 분리해서 출력하여 2026-11-19 `changed=1361` 중 기업마당 최초 도입과 정부24 업데이트를 분해 가능.
- Gov24 목록에서 공식 HTTPS 링크가 없어 정규화/업로드를 할 수 없었던 공고 건수를 추가 출력. `10,887 fetched` 대비 `1,385 uploaded` 차이의 원인 분석을 위한 것이며, 임의의 지원사업 URL을 생성하지 않는다.
- **상세 보강 중복 갱신 결함 수정:** Worker의 `/api/ingest/pending`은 기존 목록 `content_hash`를 포함하여 반환하고, 수집기의 상세정보 보강은 그 **목록 해시를 유지**한다. 기존에는 상세정보 해시로 바뀌면서 다음 동일 목록을 다시 `changed`로 보는 문제가 가능했음. Worker+Docker 양쪽 업데이트 후에만 수정 효과가 확실함.
- 회귀 테스트 소스: `tests/matching.test.mjs`, `worker/tests/programs-availability.test.mjs`, `collector/tests/test_changes.py`, `collector/tests/test_gov24.py`. 일부 자녀 연령 계산 재현 스모크 테스트는 독립 환경에서 수행했지만 **iMac 전체 빌드·Worker TypeScript 체크는 재검증 전**이다.

### 운영 DB 실제 누락 검증 (READ ONLY)

```bash
cd ~/policy-benefit-matcher
/bin/bash scripts/audit-benefits-d1-imac.sh
```

이 스크립트는 `wrangler d1 execute --remote --command 'SELECT ...'`만 사용한다. 원천별 고유 공고수, 신청기간 미표기 건수, 정부24 상세보강 건수, 부모급여/보육료/가정양육수당/유아학비/아이돌봄 후보 검색 및 표본 제목을 출력한다. 실제 출력이 없으므로 원본의 5개 핵심 지원이 D1에 모두 있다고 주장하지 않는다. `0건`이 나오면 별도 API 원본 조회와 URL 누락 통계를 확인해야 함.

### 소스 배포와 QA 재검증

```bash
cd ~/policy-benefit-matcher
git pull --ff-only
npm test
npm run check
docker compose run --rm --no-deps -e STATE_DIR=/tmp/benefits-tests collector python -m unittest discover -s tests -v
cd worker
npm run check
npm test
npx wrangler deploy
cd ..
/bin/bash scripts/release-personalization-imac.sh
# 다른 수집 회차가 실행 중이지 않을 때 재시작
docker compose restart collector
docker compose ps
docker compose logs --tail=80 collector
/bin/bash scripts/audit-benefits-d1-imac.sh
```

테스트 실패 시 **배포하지 않는다**. 이 릴리스는 GitHub Actions를 사용하지 않는다. Worker 먼저 배포하고, `/benefits/` 정적 빌드를 배포해야 `availability=review`의 미래 공고 라벨이 맞는다. Cloudflare Pages 자동 배포 완료/브라우저 반영은 별도 확인해야 한다.

### 후속 체크

1. D1 조회 결과로 5가지 핵심 육아제도 실존/비존재를 구분하고, 없는 건 정부24 API에서 서비스명/공식 링크 유무를 점검한다. 복지로 공식 출처와 연계 가능한지 검토하되 승인되지 않은 크롤링/임의 URL 생성 금지.
2. 다음 10·12·14·16·18시 회차에서 `Change-check by source`를 확인한다. **목록 재조회는 정부 데이터 변경/철회 탐지에 필요**하며, 미변경 DB 재업로드가 0에 가까운지 별도로 관찰.
3. 개인 맞춤 추천 실제 사례에서 자녀 출생연도, 지역, 고용/사업자, 소득, 신청기간을 점검한다. 임의 공고에 대한 최종 신청 자격을 자동 확정하지 않는다.

### 공식 기준 참고 (2026)

- 부모급여: https://m.bokjiro.go.kr/ssis-tem/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00004657
- 영유아보육료: https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00003250
- 가정양육수당: https://central.childcare.go.kr/lcentral/cmmnpage/cmmnpage22.jsp
- 유아학비: https://www.childschool.go.kr/si/ifo/supportInfo001.do


## 9. 2026-11-20 테스트 실패 원인과 안전한 운영 배포

### 사용자 iMac에서 확인된 로그

- `npm test`: **37/37 PASS**, `npm run check`: **0 errors, 0 warnings**.
- Docker Python 테스트는 **64개 중 1개 오류**(`test_successful_recovery_then_noon`, 562.668초).
- 에러 메시지는 `SSL: UNEXPECTED_EOF_WHILE_READING`이지만, **일차 원인은 테스트 격리 결함**이다. `scheduler.run`만 모의 처리했던 테스트가 실제 Docker 운영 환경변수 `GOV24_DAILY_FULL_CATALOG=YES`를 상속하여 `bootstrap.bootstrap()`를 실행했다.
- 사용자가 공유한 테스트 로그에 `Batch 1..14`, `Change-check by source`, 업로드 건수가 기록됨. 이는 단순한 출력 문구가 아니라 테스트에서 **실제 원천 API 및 D1 요청이 발생했을 가능성이 높다는 증거**이다. 그날 API 호출 예산과 D1 갱신 내역을 별도 확인해야 한다.
- 명령은 `&&`로 연결되었으므로 Python 테스트 실패 후의 Worker `wrangler deploy`, 웹 빌드/push, Docker 재시작, D1 감사는 실행되지 않았다. 즉 **이번 변경의 운영 배포는 아직 미완료**.

### 수정 내용

- GitHub `52b2a27`: `collector/tests/test_scheduler.py`의 문제 테스트에서 운영 `os.environ`을 비우고 필요한 테스트용 값만 설정, `scheduler.STATE_DIR` 임시 분리, `bootstrap.bootstrap` 호출을 실패하도록 모의 처리. 단위 테스트가 외부 API/운영 D1에 접근하지 못하도록 격리했다.
- GitHub `c49871e`: [안전 배포 스크립트](../scripts/finish-benefits-release-imac.sh)를 추가. 테스트 시 `STATE_DIR=/tmp/benefits-tests`, `GOV24_DAILY_FULL_CATALOG=NO`, `CONFIRM_GOV24_BULK_QUOTA=NO` 강제. 전체 테스트 성공 후에만 Worker와 `benefits/` 프론트엔드 배포 단계로 이동하며, GitHub Actions는 사용하지 않는다.
- 수집기 자동 스케줄과 실운영 데이터, 호출량 상한은 변경하지 않았다. 테스트가 실 API를 조회하는 실수를 재발시키지 않도록 하는 수정이다.

### iMac에서 재시도

```bash
cd ~/policy-benefit-matcher
/bin/bash scripts/finish-benefits-release-imac.sh
```

이 명령은 프로젝트 `git pull --ff-only` → JS 테스트 → Svelte 검사 → 안전한 Python 테스트 → Worker 검사/테스트/배포 → 웹 정적 빌드 후 `dailyfoodfighter` GitHub `benefits/` push 순이다. 블로그 GitHub 연동 Cloudflare Pages가 실제로 새 빌드를 게시했는지 대시보드 또는 실사이트에서 별도 확인할 것.

실수집 중 중단 위험이 있어 스크립트는 기존 수집기를 자동 재시작하지 않는다. **예약 회차가 실행 중이지 않을 때만** `docker compose restart collector`를 수동 수행. 육아 지원 실제 수록 여부는 `/bin/bash scripts/audit-benefits-d1-imac.sh`를 별도 실행하여 확인.

**아직 확인 필요:** Python 64/64 재통과, Worker 배포 성공, Pages 배포 완료, 원천별 운영 수집 중복 감소, D1 육아 혜택 조회 결과.


## 10. 2026-11-20 지역·나이·소득 매칭 정확도 후속 보강 — 소스 반영 / 웹 재배포 필요

사용자가 **인천 지역을 선택했는데 경상북도·곡성군 등 다른 지역 공고가 노출된다**고 보고하여 정확도 보강을 별도로 진행했다.

- 지역 분류: 명시된 D1 지역 필드를 우선하고 공고 제목의 `[경북]`, `경상북도 아이돌봄`, `곡성군 아이돌봄`, `인천형`, `연수구` 등을 추가 인식한다. 중앙행정기관의 소재지는 지역 자격의 근거로 사용하지 않음.
- 공개 행정명칭 자료를 교차 점검해 **전국 17개 시·도, 고유 지역명 236개**를 반영. 최초 자료의 부산 누락을 확인하고 완전한 시도 자료로 교체했으며, 시·군·구 선택 메뉴와 2026-07-01 인천 행정체계 개편 명칭을 추가. `서구`, `중구` 등 중복명이 상위 시·도 없이 등장하면 `UNKNOWN`.
- UI 기본은 해당 지역·전국만 표시. `지역 확인 필요` 메뉴에서 범위를 판단할 수 없는 공고를 별도 조회하며 `전체 지역 비교`에서는 지역 불일치가 표시된다. 저장 프로필은 계속 브라우저에서만 처리되고 서버로 자동 전송되지 않음.
- 알려진 전국 기본제도(부모급여·가정양육수당·영유아보육료·유아학비·아동수당)와 지역 추가사업을 구분한다. 공고별 최종 신청 자격을 확정한 것으로 오해하면 안 됨.
- 자녀 출생연도(정확한 월령 경계는 `CHECK`), 실수 소득비율 구간, 소득비율 미입력, 접수 시작 전 `CHECK` 판정 보강.
- 신규 회귀테스트: `tests/region-quality.test.mjs`와 기존 `tests/matching.test.mjs`. 2026-11-20 V8 순수 지역로직 스모크 표본에서 인천/타지역/전국/미확인 분류는 의도대로 동작함. **실제 `npm test` / `npm run check`는 이번 새 코드 기준 iMac에서 재실행할 것.**
- 상세 파일·검증 사례: [matching-quality-2026-11-20.md](matching-quality-2026-11-20.md).
- 이 후속 수정은 **정적 웹 프론트엔드만 재배포**한다. Worker·D1·Docker 수집기·API 호출량·GitHub Actions 건드릴 필요 없음.

```bash
cd ~/policy-benefit-matcher
/bin/bash scripts/release-personalization-imac.sh
```

해당 스크립트는 로컬 `git pull --ff-only` + 테스트/타입 체크 + 정적 웹 빌드 및 `dailyfoodfighter`의 `benefits/` push를 수행한다. 스크립트가 실패하면 배포 성공으로 보고하지 말 것. Cloudflare Pages에서 실제 Production 성공 및 웹페이지의 `지역 판정` 필터 확인 후 완료.
