# SEO·생활지도 구현 기록

## 2026-11-27

- 작업 브랜치 `codex/living-guide`에서 변경 중.
- `/`를 생활지도 포털로 변경하고, 실제 서비스에 연결하는 카드 디렉터리를 추가.
- 기존 한국어 글 목록은 `/blog/`로 이동할 수 있도록 블로그 랜딩 페이지를 추가. 컬렉션의 기존 게시글 permalink 규칙은 변경하지 않음.
- 사이트 레이아웃의 한국어 기본 메뉴를 `/blog/`로 조정하고, 영어 블로그와 `/blog/` 사이의 실제 등가 경로에 hreflang 연결을 지정.
- 콘텐츠 작성·수정·오류 제보 원칙 페이지 `/editorial-policy/` 추가.
- `/hotel/` 안내 페이지를 추가하고 기존 `/cal/#hotel` 호텔 포인트 계산 기능으로 직접 연결.
- 사이트맵에 `/blog/`, `/editorial-policy/`, `/hotel/` 추가.
- `/air/`의 네이비·블루·화이트 스타일 기준을 참고한 생활지도 반응형 카드 UI 추가.
- 검색 인증, 기존 게시물 경로, ads.txt, robots 정책, 서비스 데이터와 기존 계산기 코드는 변경하지 않음.

## 검증

- `git diff --check`: 통과.
- 저장소의 핵심 서비스 경로 파일 존재 확인: 통과.
- 기존 PR 자동 검증 워크플로의 Jekyll 빌드와 SEO 검사: 성공. PR 이벤트이므로 IndexNow 제출 단계는 건너뜀.
- Cloudflare Pages 미리보기: 성공 (`https://codex-living-guide.dailyfoodfighter.pages.dev/`).
- 반응형 뷰포트 10종, 서비스 카드 URL 8개 및 관련 안내 URL HTTP 200: 확인.
- `/blog/` 검색·canonical·hreflang, 기존 게시글 URL, `/hotel/`에서 `/cal/#hotel` 이동: 확인.
- 생활지도 미리보기에서 누락된 favicon 요청 404 한 건 확인. 페이지 및 계산기 상호작용 관련 콘솔 오류는 없음.
- 프로덕션 배포 및 실제 검색·방문자 지표: 미진행.
