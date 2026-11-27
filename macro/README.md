# 경제지표지도 (`/macro/`)

공포·탐욕지수부터 금리·물가·환율·코인까지, 경제지표를 한 화면에서 보는 대시보드입니다.

- 페이지: <https://dailyfoodfighter.com/macro/>
- 데이터 API: <https://dailyfoodfighter.com/api/macro>
- 정적 폴백: <https://dailyfoodfighter.com/macro/data/snapshot.json>
- 구조·계산식·갱신 방법 상세 문서: [`docs/MACRO_ARCHITECTURE.md`](../docs/MACRO_ARCHITECTURE.md)

## 파일 구성

| 경로 | 역할 |
| --- | --- |
| `macro/index.html` | 대시보드 화면(지표 카드·요약 바·출처 표기) |
| `macro/assets/macro.css` | 딥 틸(#0f766e)·앰버(#b45309) 팔레트, 반응형 그리드 |
| `macro/assets/macro.js` | `/api/macro` 조회 → 실패 시 `snapshot.json` 폴백, 렌더링·자동 갱신(5분) |
| `macro/data/snapshot.json` | 마지막으로 확보한 지표 + CPI·PPI 발표 일정/컨센서스 |
| `functions/api/macro.js` | Cloudflare Pages Function. 실시간 수집 + 스냅샷 병합 응답 |
| `functions/_shared/macro.js` | 수집 로직(공용). 모든 수치는 이 파일에서만 가져옵니다 |
| `scripts/macro-snapshot.mjs` | 폴백 스냅샷 생성기 (`node scripts/macro-snapshot.mjs`) |

## 갱신

- 시세·금리·환율·코인: 접속 시 `/api/macro`가 직접 조회(엣지 캐시 5분).
- CPI·PPI 발표치/예상치/다음 발표일: 발표가 월 1회이므로 스냅샷에 담고, 필요할 때 스크립트로 재생성합니다.

```bash
# 저장소 루트에서 (Node 18 이상)
node scripts/macro-snapshot.mjs
git add macro/data/snapshot.json && git commit -m "chore(macro): 지표 스냅샷 갱신"
```

## 원칙

- 추정·가짜 수치는 넣지 않습니다. 값을 못 받으면 `null`로 두고 화면에는 "확인 불가"와 기준일을 표시합니다.
- 모든 카드에 출처와 기준 시각을 적습니다.
- 투자 권유가 아니라 공개 데이터를 그대로 보여주는 참고 자료입니다.
