# 실제 D1 스냅샷 기반 지역·육아·소득 필터 감사

2026-11-20의 운영 D1 공고 11,939건을 복사한 **로컬 스냅샷**에 대해 동작한다. 운영 D1 / 정부24 API에 다시 접속하지 않는다. 개인 프로필도 로컬 코드 내부에만 머문다.

## 실행

```bash
cd ~/policy-benefit-matcher
git fetch origin
git switch --track origin/test/real-snapshot-filter-audit-20261120
npm test
npm run check

node scripts/audit-local-filters.mjs audit-artifacts/baseline.json
node scripts/audit-local-filters.mjs audit-artifacts/baseline.json --json \
  > audit-artifacts/filter-audit-20261120.json
```

이미 실행 중인 로컬 Worker를 종료할 필요는 없다. 이 스크립트는 스냅샷 파일만 읽고 Worker를 호출하지 않는다.

## 결과 해석

- **Regional scope**: 전국 / 특정 지역 / 확인되지 않은 지역 건수
- **Unknown region / contradictory evidence**: 공식 공고 상세 대조가 필요한 후보
- **National**: 전국 제도명별 제목 후보와 분류상 전국 확정 건수. 후보 0건이면 **해당 이름의 공고를 이 스냅샷에서 못 찾은 것**이지, 정부 제도가 존재하지 않는다는 뜻은 아니다
- **인천 시도만 / 연수구 자녀 1명 / 무자녀 / 소득 50·150%**: 필터 통과 건수. 내 조건에서 나오거나 빠진 이유를 비교하기 위한 탐색 결과이지 수혜 자격 확정 아님
- **Structured-region invariants**: 확실한 타지역 구조화 필드가 인천 추천에 섞이거나, 명확한 인천 시도 필드가 지역 충돌로 가려지는지 판단한다
- **hardChecksPassed**: 이 **제한된 지역 정합성 규칙** 검사만 의미한다. 전국 공고 누락·개인 자격의 독립 검증까지 완료되었다는 뜻은 아니다

## 확인이 필요한 후속 단계

1. JSON 보고서의 모순 지역, 지역 미확인, 육아 정책 후보를 공식 공고의 자격·지역 대상과 대조한다.
2. 원본에 없는 전국 기본급여는 수집기 및 원천 API의 실제 자료 제공 범위를 따로 조사한다.
3. 인천/연수구·자녀 연령·소득 등 대표 사례별 독립적인 `expectedIds` 정답표를 수기로 만들고 기존 `verify-snapshot-integrity.mjs`의 `scenarios`에 삽입한다.
4. 브라우저 클릭, 렌더링, 실제 배포 API 테스트는 별도 E2E 검증이 필요하다.

**주의:** 스냅샷과 보고서는 `audit-artifacts/`에만 보관한다. GitHub 커밋이나 공개 문서에 실데이터 전체를 붙이지 않는다. 운영 D1과 수집기 재시작·배포 없음.
