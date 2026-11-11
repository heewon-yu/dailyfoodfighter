# 5분단타왕 Google Play 등록 이미지 (Dark Premium v2)

디자인: 기존 웹앱 기반 네이비/골드/화이트, 5분 타이머, 가상 주식 모의투자 게임. 실제 화면에서 캡처한 이미지 4장을 기초로 구성했으며 랭킹 UI는 사용하지 않는다.

## 등록 규격과 파일

- `app-icon-512.png`: 512×512
- `feature-graphic-1024x500.png`: 1024×500
- `screenshot-01-home-1080x1920.png`: 메인/5분 타이머
- `screenshot-02-chart-1080x1920.png`: 캔들차트/이동평균선
- `screenshot-03-order-1080x1920.png`: 매수·매도/실시간 호가
- `screenshot-04-news-1080x1920.png`: 시장 뉴스
- `screenshot-05-explore-1080x1920.png`: 종목 탐색

## Codex 인계

1. 사용자가 제공하는 `scalping_king_playstore_assets.zip`을 압축 해제해 위 파일들을 이 디렉터리에 배치한다.
2. PNG 크기를 검사하고 이미지 훼손 없이 Google Play Console에 등록한다.
3. 배포 전 게임을 **모의투자 게임**으로 명시하고 실제 거래·실제 수익을 보장하는 설명을 쓰지 않는다.
4. 화면과 앱 기능이 실제 출시 빌드와 일치하는지 확인한다. 스크린샷은 실제 웹앱 화면 캡처에서 홍보용으로 재구성했다.
5. 기존 게임 코드, 사이트 배포 및 다른 GitHub Actions는 변경하지 않는다.

> 현재 커넥터는 컨테이너의 PNG 바이너리 직접 업로드를 지원하지 않아, 이 문서는 배치 명세이며 PNG 파일 자체는 아직 GitHub 저장소에 반영되지 않았다. PNG는 같은 ChatGPT 대화의 다운로드 링크에서 받을 수 있다.
