# 한입·한밤·해외지도 합산 방문자 카운터

세 지도는 동일한 `/map/` 페이지의 탭이므로, **방문자는 세 탭을 합산한 하나의 수치**로 표시한다. 탭 전환은 별도 방문으로 집계하지 않는다.

## Cloudflare Pages 적용 (GitHub Actions 불필요)

1. Cloudflare D1에 소규모 전용 DB를 생성한다. **기존 운영 D1은 사용하지 않는다** (읽기 한도 및 기존 업무에 미치는 영향 방지).
2. 해당 DB에 `docs/map-visitor-schema.sql`을 실행한다.
3. DailyFoodFighter Cloudflare Pages 프로젝트의 **Settings → Bindings → D1 database**에 바인딩 이름 `MAP_VISITS_DB`로 위 DB를 연결한다. Preview/Production 별도 설정 여부를 확인한다.
4. `feature/map-public-visitor-counters-20261123` 변경 사항을 검증한 후 main에 병합한다. 해당 도메인에 연결된 Pages 배포 경로로 반영한다. GitHub Actions를 수동 실행하거나 재활성화하지 않는다.
5. `/api/map/visitors` GET이 200과 `today,total`을 반환하는지, `/map/` 하단에 두 수치가 표시되는지 확인한다.

## 집계

- 오늘: Asia/Seoul 기준 자정에 새 날짜 카운터를 시작.
- 누적: 카운터 적용 이후 집계된 중복 제거 방문 합계. 과거 기록 소급 없음.
- 새로고침 및 세 지도 간 탭 전환은 동일 브라우저·일자 기준 1회만 반영한다. 브라우저 데이터 삭제 또는 다른 기기에서는 별도 방문자로 취급한다.
- IP, 이름, 원본 visitorId를 서버에 저장하지 않음. 비식별 해시만 저장. 브라우저 localStorage에 UUID를 저장한다.
- API 오류 시 임의의 0명을 보여주지 않고 '—'를 표시하여 정상 지도 서비스에 영향을 주지 않음.
- 운영 트래픽 증가 시 D1 rows-read/free quota를 감시하고 중복 방지 저장소의 보관 정책을 별도로 정한다.

## 배포 전 필수

**DB 스키마와 D1 바인딩은 아직 실제 Cloudflare 계정에 적용하지 않았다.** 따라서 준비되지 않은 환경에서는 공개 수치가 '—'로 표시된다. 연결과 실제 운영 사이트 확인 전에는 완료로 간주하지 말 것.
