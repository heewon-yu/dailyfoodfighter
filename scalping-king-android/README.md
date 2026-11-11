# 5분단타왕 Android 인계

Capacitor 8.6.0 프로젝트이며 패키지명은 `com.dailyfoodfighter.scalpingking`입니다. Android 최소 API는 24이고 컴파일 및 대상 API는 36입니다. `www`에는 웹게임 커밋 `b346345b85ec9c72c9833ef341cf7374802eef08`의 정적 실행 파일 10개가 들어 있습니다. 스토어에 올릴 512px 차트 아이콘과 1024 × 500 배너는 `store-assets/`에 있습니다.

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
- 이전 PC의 SDK 설치는 Google SDK 라이선스 동의 단계에서 중단됐습니다. Gradle 빌드, Android 실기기 검증, 서명된 AAB 생성은 다음 작업입니다.
- 첫 출시는 한국어입니다. Android 실기기에서 오프라인 실행, 노치·시스템 바 여백, 회전·폴더블 전환, 뒤로가기와 숫자 키보드를 확인합니다.
- AdMob 연결은 아직 개발 전입니다. 시작·성적표 배너, 세 번째 판 종료 후 다음 판 전환 시 닫을 수 있는 전면형 광고, 신용매수·긴급자금대출·로스컷 보상형 광고를 연동합니다. 전체 화면 광고 중 게임 타이머와 장세를 멈추고 종료 후 재개합니다. 현재 `www/index.html`의 공개 테스트용 `data-test-tools`는 광고 연결과 검증이 끝난 Android 출시 빌드에서 제거합니다.
- 이후 스토어 스크린샷 5장, 개인정보처리방침, 데이터 보안 및 등급 양식을 준비하고, 업로드 키로 서명한 AAB를 Play Console 테스트 트랙에 등록합니다.
