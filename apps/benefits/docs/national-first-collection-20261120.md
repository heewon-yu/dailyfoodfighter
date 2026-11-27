# 전국사업 우선 수집 · 정적 카탈로그 (2026-11-20)

## 확정 원칙

- 정부24·기업마당에서 전국 적용 사업을 우선 수집·검증한 뒤 지역 공고를 검토한다.
- 중앙부처나 전국 단위 공식 안내만 전국 공통 대표로 인정한다. 다른 지자체 공고로 대체하지 않는다.
- 전국 기본 사업은 제도당 1건; 거주지역 자체 추가지원은 별도로 표시한다.
- 명확한 타지역 전용 사업은 제외한다. 지역 미확인 일반 공고는 확인 필요로 표시한다.
- 전국 대표는 코드의 정적 JSON에서 읽으며, 운영 D1 읽기/쓰기를 추가하지 않는다.

## 실제 완료/보류

- 초기 후보 12종을 소스에 기록했지만 공식 페이지 및 조건 검증을 전부 완료한 것은 아니다.
- 공식 안내 페이지를 확인한 7종(부모급여, 가정양육수당, 유아학비, 아동수당, 국민취업지원제도, 국민내일배움카드, 주거급여)만 VERIFIED로 표시한다.
- 나머지 5종은 PENDING_SOURCE_REVIEW이며 공개 목록에서 제외한다.
- 공식 제도의 존재·링크 검증은 개인별 수급 자격 검증을 의미하지 않는다.
- 출처: https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00004657
- 출처: https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00003253
- 출처: https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=312&boardSeq=105235&lev=0&m=0301&s=moe
- 출처: https://www.work24.go.kr/ua/z/z/1300/selectEmssRqutIntro.do
- 출처: https://www.work24.go.kr/hr/h/a/1100/selectIssuGudn.do
- 출처: https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00001171
- 출처: https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00003201

## 로컬 테스트 (운영 쓰기 없음)

```bash
cd ~/policy-benefit-matcher
git fetch origin
git switch fix/default-regional-search-20261120
git pull --ff-only
npm test
npm run check
node scripts/audit-local-filters.mjs audit-artifacts/baseline.json
```

기존 11,939건 스냅샷 parity는 당시 조회 API 데이터의 완전성만 보증하며, 정부24·기업마당 원천 전체 사업의 수집 완전성을 보증하지 않는다.
최초 PR #13의 101개 테스트 중 1개는 기존 엄격 필터 기대값 충돌로 실패했고 테스트를 수정했다. 이후 신규 커밋까지 합친 iMac 테스트는 아직 확인되지 않았다.
운영 API 전체 재수집은 기존 iMac 키/일일 한도가 필요하여 수행하지 않았다. D1 쓰기, Worker 변경, GitHub Actions, Pages 운영 배포는 수행하지 않았다.

## 남은 핵심 결함

- 정부24·기업마당 원천 목록의 전국/지역별 완주 여부, 총건수·끝 페이지·중복 ID 검증 필요
- 5개 후보의 공식 출처 및 신청 자격 최신화, 나머지 분야 전국 핵심 제도 확대
- 전국 대표 1건과 관련 지역 추가지원 추천의 실제 UI 상호작용 테스트
- 101개+신규 테스트 및 정적 빌드 검사 후 병합·수동 Pages 배포
- 실사용 성능 지표와 D1 최적화 전후 운영 지표는 아직 측정 불가