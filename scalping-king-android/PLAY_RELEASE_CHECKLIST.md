# 5분 단타왕 / Scalping King — Google Play 출시 차단점 및 검증표
기준일: 2026-11-13. 상태 구분: [x] 저장소 파일 확인, [ ] 실제 검증 미완료. **체크 표시를 테스트 성공으로 해석하지 말 것.**
패키지: `com.dailyfoodfighter.scalpingking` / Android Capacitor / versionCode 2 / versionName 1.1 (현재 소스 기준).

## 출시 차단(P0): 코드 변경·배포 전에 해결
- [ ] **안전한 랭킹 서버로 전환**: `main/functions/api/scalping/rankings.js`는 POST 본문 `nickname/rate/profit`을 직접 수락한다. 변조 점수 등록이 가능하므로 출시 전에 서버가 세션·주문·경과시간·최종 성적을 계산/검증하는 구조로 변경. `codex/scalping-king-release-v5`의 `functions/_shared/scalping.js`, `functions/api/scalping/{session,rankings,admob,retention}.js`, `functions/api/scalping/migrations/0002_verified_rounds.sql` 검토. **별도 브랜치 코드를 그대로 복사하거나 기존 D1 테이블에 바로 migration 실행하지 말 것.** 스키마/세션/클라이언트/테스트가 한 세트로 동작해야 한다.
- [ ] 클라이언트 및 서버에서 하루 무료 5판, 광고 추가 판수, 세션 재시작, 다중 기기, 닉네임 중복, 중복 점수 제출, 요청 재전송, 시간 조작에 대한 서버 검증.
- [ ] AdMob 보상은 클라이언트 `onReward`만 신뢰하지 않음. 운영 광고 단위별 SSV 서명검증, nonce/transaction 중복 금지, 만료, 광고 취소/실패, 시청 완료/지급 검증. 테스트 ID로 발행 금지.
- [ ] D1 바인딩, 실제 배포 라우트, 마이그레이션 및 rollback/backup 경로 확인. 프로덕션 데이터 삭제 주의. 서버 과금/요청량/쿼리 인덱스 확인.
- [ ] `main`과 `codex/scalping-king-release-v5`는 diverged 상태. 최신 UI 및 Android 수정 보존하며 별도 통합 PR 구성, CI/브라우저/Android 실기기 통과 전 배포 금지.

## 빌드·스토어(P0)
- [x] Android Capacitor 소스와 `.github/workflows/scalping-android.yml` 존재.
- [ ] GitHub Actions 최신 `main` run **실제 성공** 확인. ZIP artifact에서 debug APK/unsigned AAB 확인. 워크플로 존재만으로 빌드 성공 단정 금지.
- [ ] 고유 업로드 키 생성 및 **오프라인/비밀 보관**. 키스토어/비밀번호를 repo에 넣지 말 것. Play App Signing 설정과 최종 release 서명 AAB 확인.
- [ ] 실제 Android 디바이스(최소 1대)에 설치, 최신 패키지명/설치 아이콘/업데이트 설치/뒤로가기/키보드/상태바/노치/폴더블/오프라인/광고 동의 테스트.
- [ ] 앱 이름 `5분 단타왕`, 영문 `Scalping King`; **SCALPING ARENA** 및 구형 명칭 잔존 검색. 웹과 Android 내장 www 동기화.
- [ ] 확정된 01번 디자인으로 launcher icon, adaptive icon foreground/background, Google Play 512x512 icon 일치 여부 **실제 이미지 비교**.
- [ ] Store feature graphic 1024x500 PNG/JPEG, 휴대폰 스크린샷 최소 2장. 프로젝트 목표는 1080x1920 5장; 이미지의 실제 게임 화면·텍스트·비율 검수. 이미지가 Git에 있다는 사실만으로 디자인 일치 단정 금지.
- [ ] Play Console 앱 생성, 패키지 및 버전 코드·앱 카테고리/연락 이메일/국가별 배포 범위 확인.

## Play 정책(P0)
- [ ] 앱 전용 개인정보처리방침을 인증 없는 HTTPS HTML 페이지에 공개하고 스토어 및 **앱 내부**에 접근 링크 제공. `PLAY_PRIVACY_DRAFT.md`는 게시 전 확인용 초안.
- [ ] 실 배포 변형 기준 Google Play Data safety: 실제 수집/공유/보관/삭제, 암호화, 삭제 요청 기능, 타사 SDK, AdMob/UMP 확인. 거짓으로 '데이터 수집 없음' 선언 금지.
- [ ] 광고 포함(AdMob 운영 변형) 및 연령 대상, 콘텐츠 등급 설문, 광고/결제/금융 기능 신고 실제 기능대로 작성.
- [ ] 실거래, 현금 지급, 예측 수익 보장, 실제 증권사/거래소와의 제휴로 오인되지 않게 표현. '모든 자금·주가·뉴스·결과는 게임 내 가상' 명시.
- [ ] 앱 내 개인정보 옵션/동의 철회(해당 지역/SDK 정책 기준), 보상형 광고 취소해도 불이익/오작동 없도록 점검.
- [ ] 신규 개인 개발자 계정에 요구된다면 12명 이상 14일 연속 참여 비공개 테스트, 생산 액세스 신청. 콘솔에서 계정별 요구사항 확인.

## 기능 테스트(P0/P1)
- [ ] 5분 타이머: 중단/복귀/백그라운드, 광고 도중 일시정지, 종료 00:00, 시각 조작 검증.
- [ ] 거래: 시장/지정가/취소/정정/체결수량/호가잔량/거래대금, 10초 VI, 상·하한가 및 랜덤 해제.
- [ ] 신용매수: 입력 범위/최대 한도/담보비율 150%/반대매매 30초/경고 10·5·3초/긴급자금 5천만원과 매도 즉시 상환.
- [ ] 보상 기능: 신용매수·긴급자금·손절·추가 판수의 광고 배치와 실제 적용 범위 정합성. **광고 보상은 현금/투자수익 제공 아님**.
- [ ] 랭킹: KST 날짜 경계, TOP5 수익률/수익금, 닉네임 2~12자, 동점·다중 세션·조작 점수·중복 제출, 2일 보관 정책.
- [ ] 무료 D1 운영: 별도 스케줄러의 cleanup 필요 여부 확인. 현재 main API는 POST 시에만 만료 데이터 삭제함.
- [ ] 최신 웹 빌드와 APK 내장 www의 스크립트/아이콘/문구가 일치하는지 검사.
- [ ] 모바일 QA: 320/360/390/412/430px, 실제 터치/스크롤/차트/주문창 가독성 및 TalkBack 기본 접근성.

## 단계별 배포 게이트
G0 코드 통합 PR + 회귀 테스트 → G1 보안/서버/광고 샌드박스 → G2 Android CI+실기기 → G3 법적/스토어 신고 및 이미지 → G4 내부 테스트 → G5 해당 시 비공개 테스트 → G6 프로덕션 출시.

## 공식 도움말
- https://support.google.com/googleplay/android-developer/answer/14151465
- https://support.google.com/googleplay/android-developer/answer/9866151
- https://support.google.com/googleplay/android-developer/answer/9859455
- https://support.google.com/googleplay/android-developer/answer/9845334
