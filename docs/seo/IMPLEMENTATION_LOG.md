# SEO·생활지도 구현 기록

## 2026-11-27

- 작업 브랜치 `codex/living-guide`에서 변경 중.
- `/`를 생활지도 포털로 변경하고, 실제 서비스에 연결하는 카드 디렉터리를 추가.
- 기존 한국어 글 목록은 `/blog/`로 이동할 수 있도록 블로그 랜딩 페이지를 추가. 컬렉션의 기존 게시글 permalink 규칙은 변경하지 않음.
- 사이트 레이아웃의 한국어 기본 메뉴를 `/blog/`로 조정하고, 영어 블로그와 `/blog/` 사이의 실제 등가 경로에 hreflang 연결을 지정.
- 콘텐츠 작성·수정·오류 제보 원칙 페이지 `/editorial-policy/` 추가.
- `/hotel/`은 `힐튼 포인트 숙박` 안내로 구성하고 StayPoint(`https://staypoint-korea.blushcrown.chatgpt.site/`)로 연결. `/cal/#hotel`은 별도의 다중 브랜드 호텔 포인트 계산기로 유지.
- StayPoint의 현재 Sites 권한은 `custom`이며 소유자 1명만 허용됨을 확인. 공개 방문자 접근은 변경하지 않았으므로 공개 배포 전에 접근 범위를 확정해야 함. 방문자용 화면에는 미완성 상태 배지를 노출하지 않음.
- 사이트맵에 `/blog/`, `/editorial-policy/`, `/hotel/` 추가.
- `/air/`의 네이비·블루·화이트 스타일 기준을 참고한 생활지도 반응형 카드 UI 추가.
- 메인 컬러는 `/air/`의 네이비 `#0f2340`로 두고, 보조 상호작용 색도 네이비 계열로 정리.
- 1차 홈 화면은 서비스 진입과 최근 영양 글을 우선 노출하고, 계산기별 상세 가이드 연결은 1차 배포 뒤 후속 작업으로 둠.
- 검색 인증, 기존 게시물 경로, ads.txt, robots 정책, 서비스 데이터와 기존 계산기 코드는 변경하지 않음.

## 검증

- `git diff --check`: 통과.
- 저장소의 핵심 서비스 경로 파일 존재 확인: 통과.
- 생활지도 카드 12개와 StayPoint 호텔 링크·하위 페이지 문구 및 경로를 확인.
- 홈 카드 12개 링크의 저장소 내 경로 존재 여부, 네이비 색상 토큰, 미완성 상태 문구 비노출을 정적 확인.
- 별도 브랜치 `codex/first-screen-preview`로 첫 화면을 Cloudflare Pages 미리보기에 배포 (`3e74fa0`). 새 GitHub Actions 실행이나 PR 생성 없이 브랜치 배포를 사용.
- 브라우저에서 홈과 `/hotel/` 접근을 확인. StayPoint 외부 페이지는 익명 방문 시 HTTP 401(현재 소유자 전용); 접근 범위는 변경하지 않음.
- 운영 도메인에 대한 배포는 아직 수행하지 않음.
- 기존 PR 자동 검증 워크플로의 Jekyll 빌드와 SEO 검사: 성공. PR 이벤트이므로 IndexNow 제출 단계는 건너뜀.
- 저장소의 기존 GSC/GA4 기준선(2026-11-25 보고서)을 확인하고 현재 기준과 구분해 기록.
- 132개 게시글 정적 감사 실행: front matter·내부 링크 오류 없음; 건강 주장 패턴 후보 70개, 직접 출처 링크 확인 후보 35개.
- 기존 생활지도 미리보기 `e08e075`의 데스크톱·모바일 10종 QA는 과거 검증 이력으로 보존.
- 신규 첫 화면 미리보기 `https://codex-first-screen-preview.dailyfoodfighter.pages.dev/`에서 카드 12개, 1440px 데스크톱, 390px 모바일 및 `/hotel/` 페이지 확인.
- 첫 화면에서 발견한 favicon 404를 기존 로고 PNG로 수정했고, 후속 미리보기에서 이미지 응답 200 및 브라우저 콘솔 오류 0건 확인.
- `/blog/` 검색·canonical·hreflang, 기존 게시글 URL은 이전 미리보기에서 확인. 현재 페이지 대상 전체 경로 회귀 점검은 상세 단계에서 진행.
- 운영 사이트 `/sitemap.xml` URL 162개를 브라우저에서 확인: 모두 고유·HTTP 200, noindex 없음. canonical 누락 13개, 설명 메타 누락 2개, H1 누락 1개를 찾아 저장소 원본에 보완.
- 혜택찾기 개인정보 페이지의 공개 HTML과 hydration 번들을 함께 갱신해 맞춤 프로필의 로컬 저장, 조회 요청 필드, 삭제 방법, Cloudflare 처리 설명을 실제 구현과 대조. 재배포 후 브라우저 재검증 예정.
- 최신 Google 공식 안내는 사람 우선·독창적 가치와 검색 조작 목적의 대량 유사 콘텐츠 회피를 강조한다. AdSense 정책은 Google 서비스 사용에 따른 데이터 수집·공유·사용과 쿠키·식별자 등의 공개를 요구한다. [Search Central](https://developers.google.com/search/docs/fundamentals/creating-helpful-content), [AdSense Publisher Policies](https://support.google.com/adsense/answer/10502938?hl=en).
- 프로덕션 배포 및 실제 검색·방문자 지표: 미진행.
