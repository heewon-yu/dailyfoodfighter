# 5분 단타왕 Android 인계

Capacitor 8.6.0 프로젝트이며 패키지명은 `com.dailyfoodfighter.scalpingking`입니다. Android 최소 API는 24이고 컴파일 및 대상 API는 36입니다. `npm run android:sync`가 실행될 때마다 현재 `games/scalping-king/` 파일과 개인정보처리방침·계정 삭제 페이지를 새로 패키징합니다. 이전 커밋의 정적 `www`가 공식 게임 소스로 남지 않도록 동기화합니다. 스토어에 올릴 512px 차트 아이콘과 1024 × 500 배너는 `store-assets/`에 있습니다.

## 다른 Windows PC에서 실행

Node.js 22 이상과 Android Studio를 설치합니다. Android Studio 초기 설정에서 Android SDK Platform 36, Android SDK Platform-Tools, 필요한 Build-Tools를 설치하고 SDK 약관을 확인합니다.

저장소를 내려받은 뒤 `scalping-king-android`에서 실행합니다.

```powershell
npm ci
npm run android:sync
npm run android:open
```

Android Studio에서 Gradle 동기화 후 에뮬레이터나 휴대폰을 선택해 실행합니다. 터미널에서 테스트 APK를 만들 경우 Android SDK 경로와 Android Studio JDK가 설정된 상태에서 실행합니다.

```powershell
Set-Location android
.\gradlew.bat assembleDebug
```

테스트 APK는 `android/app/build/outputs/apk/debug/app-debug.apk`에 생성됩니다. `www`를 수정한 뒤에는 `npm run android:sync`를 다시 실행합니다.

## 작업 상태

- Capacitor 프로젝트 생성, npm 잠금 파일, Android 런처 아이콘과 시작 화면 설정을 저장했습니다. `cap sync`를 실행했고 복사된 게임 파일 10개가 원본과 일치함을 확인했습니다.
- Chrome에서 320px부터 1024px까지 다섯 화면 크기에 대해 네트워크를 끈 채 첫 실행, 종목 표시, 터치로 게임 시작, 주문 버튼 활성화를 확인했습니다.
- GitHub Actions 디버그 APK를 에뮬레이터에 설치해 오프라인 실행, 2주 매수와 홈 복귀를 확인했습니다. 실기기 검증과 업로드 키 서명은 출시 준비 단계입니다.
- 첫 출시는 한국어입니다. Android 실기기에서 오프라인 실행, 노치·시스템 바 여백, 회전·폴더블 전환, 뒤로가기와 숫자 키보드를 확인합니다.
- Google 공식 보상형 테스트 광고를 디버그 APK에 연결했습니다. 에뮬레이터에서 시청 보상으로 신용거래가 열리고 타이머가 이어지는 것을 확인했습니다. 배너·전면 테스트 광고와 운영 광고 설정은 후속 작업입니다.
- 실제 출시 전에 사용자 승인 스토어 스크린샷 5장·원본 01번 아이콘을 확인하고, 운영 개인정보처리방침과 계정 삭제 URL 공개, 데이터 보안·등급 신고를 완료합니다. 업로드 키로 서명한 AAB는 승인된 `main`의 수동 Actions 빌드로만 제작한 뒤 Play Console 내부 테스트 트랙에 등록합니다.

## GitHub Actions 빌드

Android 브랜치에 변경을 올리면 JDK 21과 SDK 36으로 디버그 앱 및 계측 테스트 APK를 빌드합니다. 실행 결과의 Scalping-King-Android-Debug-APK에서 설치용 APK를 받을 수 있습니다. 빌드는 패키지명, SDK, 디버그 서명과 내장 웹 파일을 검사합니다. 에뮬레이터나 실기기 실행은 별도로 진행합니다.

## Google Play 준비

GitHub Actions에서 서명 전 AAB를 `Scalping-King-Android-Unsigned-AAB` 산출물로 제공합니다. 광고 ID를 입력하지 않은 기본 출시 변형에는 Google 광고 SDK와 샘플 앱 ID가 포함되지 않습니다. 배포 기능을 확정한 뒤 Play 업로드 키로 AAB를 서명하고, 내부 테스트 트랙에서 설치와 업데이트를 검증합니다. 업로드 키와 암호는 저장소에 커밋하지 않습니다.

스토어 등록 전에는 스크린샷, 앱 설명, 개인정보처리방침, 광고 여부, 데이터 보안, 콘텐츠 등급과 대상 연령을 배포본에 맞춥니다. Play Console이 비공개 테스트를 요구하는 계정은 해당 조건을 충족한 뒤 정식 출시 액세스를 신청합니다.

## 운영 보상형 AdMob 준비

AdMob에서 Android 앱 패키지 `com.dailyfoodfighter.scalpingking`을 등록하고 **앱 ID**와 **보상형 광고 단위 ID**를 생성합니다. 운영 빌드는 신용매수·긴급자금대출·로스컷·추가 판수마다 서로 다른 보상형 광고 단위 ID를 사용합니다. 테스트용 디버그 APK는 Google 공식 테스트 광고 단위를 공유할 수 있습니다. 계정의 개인정보 보호 및 메시지에서 실제 배포 지역에 적용할 동의 메시지를 설정합니다.

출시 빌드에 환경변수 `SCALP_ADMOB_APP_ID`와 `SCALP_ADMOB_REWARDED_ID`를 둘 다 설정합니다. 같은 게시자에 속한 ID가 필요하며 Google 샘플 ID는 출시 빌드에서 거부합니다. ID가 없는 CI 산출물은 기본 게임 확인용입니다. 디버그는 Google 공식 테스트 ID를 사용합니다.

운영 변형은 UMP 확인 후에만 광고를 요청합니다. 필요한 경우 가이드에 광고 개인정보 설정을 표시합니다. 실제 계정 ID와 메시지 설정이 적용되면 테스트 기기를 등록해 동의, 광고 취소, 시청 완료 및 게임 재개를 확인한 뒤 개인정보처리방침과 Play 데이터 보안 신고를 확정합니다.

- [Google UMP 설정](https://developers.google.com/admob/android/privacy)
- [AdMob 보상형 광고](https://developers.google.com/admob/android/rewarded)


### Official rewarded placements

Set SCALP_ADMOB_APP_ID and SCALP_ADMOB_REWARDED_ID for credit. Set SCALP_ADMOB_EMERGENCY_ID, SCALP_ADMOB_STOP_ID and SCALP_ADMOB_EXTRA_ID for their respective verified placements. Each production placement uses a distinct ad unit. The Android release bridge requires a server-issued nonce and the game waits for server-side confirmation. Configure each AdMob SSV URL to the deployed /api/scalping/admob route before enabling its ID. The debug APK uses Google’s official sample unit only.

Production AdMob app ID: ca-app-pub-7921440641343288~9202520759. The four placement suffixes are 6576357419 (credit), 5263275745 (emergency), 3638689534 (stop), and 7071482751 (extra round).
