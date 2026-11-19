# /api/300-seconds/rankings — 바인딩 계약

300초 추리게임의 일일 순위 API입니다. Cloudflare Pages Functions로 배포되며
`functions/api/300-seconds/rankings.js` 하나가 GET·POST·OPTIONS를 모두 처리합니다.

## 반드시 있어야 하는 바인딩

| 환경 | 변수 이름 | D1 데이터베이스 | 없을 때 |
| --- | --- | --- | --- |
| Production | `DB` | `scalping-db` (`29139594-23f2-4f10-afb4-456afbd413a2`) | 503 `D1 binding unavailable` |
| Preview | `DB` | `scalping-db` (같은 DB) | 503 |

- 코드는 `env.DB || env.SCALPING_DB`를 순서대로 찾습니다. 새로 만드는 구성에서는 `DB`만 쓰세요.
- Scalping King(`/api/scalping/*`)은 **`SCALPING_KING_DB`** 를 쓰며 300초와 DB를 공유하지 않습니다.
  Production은 `scalping-king-production`, Preview는 `scalping-db-release-qa`입니다.
  두 게임의 바인딩을 서로 바꿔 쓰면 안 됩니다(`functions/_shared/scalping.js`의 `dbFor()`가 fail-closed).
- **바인딩은 대시보드에만 있습니다. 저장소에는 없습니다.**(wrangler 설정 파일 미사용)
  바인딩을 바꾼 뒤에는 Deployments → 최신 배포 → **Retry deployment** 를 해야 실제 반영됩니다.

## 2026-11-19 장애 기록

- 증상: Cloudflare 5xx 6.43% (24시간 219건), `300 Seconds daily retention` 워크플로 4일 연속 실패,
  300초 리더보드가 "랭킹 서버 연결 전"으로 표시(순위 저장·조회 전면 불통).
- 원인: 11-18 Scalping King D1 격리 작업(`fix/scalping-d1-isolation-20261118`) 때
  production 환경에서 `DB` 바인딩이 삭제됨. preview에는 남아 있어 preview 배포만 정상이었음.
- 조치: production에 `DB → scalping-db` 재등록 후 재배포. GET 200/POST 200/retention 워크플로 성공 확인.
- 교훈: 게임별 DB 격리 작업을 할 때 **다른 게임의 바인딩을 지우지 않았는지** 이 표로 확인하고,
  배포 후 `curl -s -o /dev/null -w '%{http_code}' https://dailyfoodfighter.com/api/300-seconds/rankings` 로 200을 확인한다.

## API 계약

- `GET /api/300-seconds/rankings?nickname=<닉네임>`
  - 응답 200: `{ day, daily: [{nickname,score,solved,hints,rank}], mine: {score,solved} | null }`
  - 매 요청마다 KST 오늘 이전 행을 지우는 purge를 함께 수행한다(일일 초기화).
  - 바인딩이 없을 때만 503 `{ day, daily: [], mine: null, notice: 'D1 binding unavailable' }`.
- `POST /api/300-seconds/rankings`
  - 본문: `{ nickname, score, solved, hints, mode, day }`
  - 닉네임 `^[가-힣A-Za-z0-9_]{2,12}$`, `score === solved * 100`, `0 ≤ score ≤ 10000`, `0 ≤ hints ≤ 3`.
  - `day`가 KST 오늘이 아니면 409 `day_expired`, 형식이 틀리면 400 `invalid_score`.
  - 같은 날 같은 닉네임은 최고 점수만 유지(upsert).
- `OPTIONS`: CORS preflight 200.

## 스키마

`schema.sql`이 기준입니다. 함수는 요청마다 `CREATE ... IF NOT EXISTS`를 batch로 실행하므로
빈 DB에 처음 붙어도 스스로 테이블을 만듭니다.

## 검증

```bash
curl -s -o /dev/null -w 'GET %{http_code}\n' https://dailyfoodfighter.com/api/300-seconds/rankings
curl -s -w '\nPOST %{http_code}\n' -X POST https://dailyfoodfighter.com/api/300-seconds/rankings \
  -H 'Content-Type: application/json' \
  --data "{\"nickname\":\"테스트봇\",\"score\":100,\"solved\":1,\"hints\":0,\"mode\":\"normal\",\"day\":\"$(TZ=Asia/Seoul date +%F)\"}"
```

검증용 행은 D1 콘솔에서 `DELETE FROM mystery_rankings_v4 WHERE nickname='테스트봇';` 로 지운다.
