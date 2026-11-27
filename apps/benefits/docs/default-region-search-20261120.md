# 기본 지역 검색 변경 · 배포 전 검증

## 최종 동작

- 내 지역 공고, 전국 대상 공고, 지역 미확인 공고를 모두 검색 결과에 포함한다.
- 명확한 타지역 대상 공고 또는 타지역 지자체 소관 공고는 기본 검색에서 제외한다.
- 단 명시적인 전국 대상 공고는 타지역 소관기관이어도 포함한다.
- 지역 미확인은 별도 필터 없이 카드에 '지역 확인 필요' 표기한다.
- 전체 지역 비교 모드는 기존대로 유지하며 기본 지역 검색은 수혜 자격을 확정하지 않는다.

## 로컬 11,939건 검증

```bash
cd ~/policy-benefit-matcher
git fetch origin
git switch --track origin/fix/default-regional-search-20261120
npm test
npm run check
node scripts/audit-local-filters.mjs audit-artifacts/baseline.json
node scripts/audit-local-filters.mjs audit-artifacts/baseline.json --json > audit-artifacts/default-region-audit-20261120.json
```

과거 '내 지역 확인 95건' 수치는 기존 엄격 필터 기준이다. 이번 변경 후에는 지역 확인 필요 후보도 표시되므로 더 커진다. 늘어난 건수가 실제 수급 가능성 입증은 아니다.

## 테스트 통과 후 iMac에서 정적 웹 배포

```bash
cd ~/policy-benefit-matcher
git switch main
git pull --ff-only origin main
/bin/bash scripts/release-personalization-imac.sh
```

위 스크립트는 npm 테스트/체크 및 정적 빌드 성공 후 블로그 저장소 benefits/만 푸시한다. 블로그 저장소가 더럽거나 예상한 파일이 없으면 중단한다. Cloudflare Pages Production 배포 성공 여부와 실제 검색 결과는 별도 검증한다. 운영 D1/Worker/Collector/GitHub Actions는 사용하거나 변경하지 않는다.