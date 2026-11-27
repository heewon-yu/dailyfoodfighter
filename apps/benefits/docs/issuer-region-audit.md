# 소관기관 유형별 지역 증거 감사 (2026-11-20)

운영 D1 데이터를 건드리지 않고 이미 확보한 로컬 `audit-artifacts/baseline.json`에서 지역 분류를 분석한다.

## 구현 범위

- 소관기관을 중앙부처(`CENTRAL`), 광역지자체(`PROVINCE`), 기초지자체(`MUNICIPAL`), 기타(`OTHER`), 명칭 모호(`AMBIGUOUS`)로 나눈다.
- 소관기관 유형 정보는 `classifyIssuer`로 조회한다. 반환값 `canInferResidency:false`는 **소관기관 소재지만으로 신청 자격상 거주 지역을 단정하면 안 된다는 의미**다.
- 신청 대상 설명에 실제로 `관내 거주자`, `관내 주민등록` 등 근거가 있고 관할 지자체를 고유하게 식별할 수 있는 경우에만 지역 분류에 사용한다.
- 공식 지역 필드, 신청자 거주지 명시, 제목의 확정 지역은 우선시한다. 서로 모순되면 미확인으로 남긴다.
- 지원 대상 문구가 없거나 일반적인 기관 주소만 있는 공고는 지역 미확인을 유지한다.
- 지역 미확인 9,524건을 유형별로 분리 집계하고, 기초지자체 공고 중 원문 재검토 후보를 표시한다.

## iMac 로컬 실행

```bash
cd ~/policy-benefit-matcher
git fetch origin
git switch --track origin/feat/issuer-type-evidence-audit-20261120
npm test
npm run check

node scripts/audit-local-filters.mjs audit-artifacts/baseline.json
node scripts/audit-local-filters.mjs audit-artifacts/baseline.json --json \
  > audit-artifacts/issuer-type-audit-20261120.json
```

`Issuer types`는 전체 소관기관 유형의 분포이며 `UNKNOWN by issuer`는 지역이 여전히 미확인된 공고의 소관기관 유형별 건수다. 이 수치는 **실제 스냅샷 실행 후에만 확정**할 수 있다. `unknownMunicipalSamples`는 소관기관은 구분되지만 거주지 근거가 부족한 공고의 점검 후보이며, 일괄 지역 확정 대상이 아니다.

## 주의

- 기존 11,939건 데이터와 운영 D1은 변경하지 않는다.
- GitHub Actions 실행하지 않는다.
- 자동 검사 통과가 실제 자격요건 검증이나 공식 원문 대조의 완료를 의미하지 않는다.
- 스냅샷 및 JSON 실데이터는 `audit-artifacts/`에 로컬 보관하고 GitHub에 올리지 않는다.
