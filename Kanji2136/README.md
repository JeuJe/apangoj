# 상용한자 2136 Premium Android v2.0.0

서버 없이 Google Play 일회성 구매와 AdMob 광고로 수익화하는 Android 앱 소스입니다.

## 수익 구조

### 무료
- JLPT N5 103자 + N4 181자 = 284자 학습
- 한자/훈음/음독/훈독 검색
- 10문항 연습시험
- 오늘 복습
- 기본 학습 통계
- AdMob 하단 배너 광고
- 시험 2회 완료마다 전면광고 1회

### 프리미엄: 12,000원 1회 구매
- N3~N1 포함 상용한자 2,136자 전체
- 20/30/50문항 시험
- N5~N1 25문항 JLPT 수준진단
- 오답 집중시험
- 취약 한자/최근 시험 상세 통계
- 광고 완전 제거
- 같은 Google Play 계정으로 구매 복원

## 기술 구조

- Android WebView + HTML/CSS/JavaScript 학습 UI
- Google Play Billing Library 9.1.0
- Google Mobile Ads SDK 25.4.0
- User Messaging Platform SDK 4.0.0
- 자체 서버/회원 DB 없음
- 한자 2,136자 데이터는 APK assets에 내장
- 학습 기록은 WebView localStorage에 기기 로컬 저장
- 프리미엄 구매 권한은 Google Play의 비소비성 일회성 상품으로 확인

## 중요: Google Play Console 설정

1. 앱 패키지명은 `com.juhyeok.kanji2136`입니다.
2. Google Play Console에서 일회성 상품을 생성합니다.
   - 상품 ID: `premium_lifetime`
   - 상품 유형: 비소비성 일회성 상품
   - 대한민국 가격: 12,000원
3. 상품을 활성화합니다.
4. 내부 테스트 트랙에 앱을 올리고 라이선스 테스터 계정으로 결제를 테스트합니다.
5. 앱을 단순 APK 사이드로드한 상태에서는 실제 Play 결제 테스트가 정상 동작하지 않을 수 있으므로 Play 테스트 트랙 설치본으로 확인합니다.

## 중요: AdMob 설정

현재 `app/src/main/res/values/strings.xml`에는 Google 공식 테스트 광고 ID가 들어 있습니다.
출시 전에 아래 3개를 실제 AdMob ID로 교체해야 합니다.

- `admob_app_id`
- `admob_banner_id`
- `admob_interstitial_id`

테스트 ID를 그대로 출시하면 실제 광고 수익이 발생하지 않습니다.

## 빌드

Android Studio에서 프로젝트 루트를 열고 Sync 후 실행합니다.

요구사항:
- JDK 17 이상
- Android SDK 35
- 인터넷 연결: 최초 Gradle 의존성 다운로드에 필요

디버그 APK:

```bash
gradle assembleDebug
```

생성 위치:

```text
app/build/outputs/apk/debug/app-debug.apk
```

Play Store 배포는 Android Studio에서 서명된 AAB를 생성하는 방식을 권장합니다.

## 웹 UI 검증

Node.js 18 이상:

```bash
npm ci
npm run validate
```

검증 항목:
- 한자 2,136자 및 JLPT 분포
- 홈/검색/상세/학습 기록
- 시험/수준진단
- 무료 N3~N1 잠금
- 프리미엄 화면 이동

## 핵심 파일

```text
app/src/main/java/com/juhyeok/kanji2136/MainActivity.java
  - Google Play Billing
  - 구매 복원
  - 프리미엄 권한 확인
  - AdMob 배너/전면광고
  - UMP 광고 개인정보 동의
  - WebView JavaScript Bridge

app/src/main/assets/web/main.js
  - 무료/프리미엄 기능 분기
  - 잠금 UI
  - 프리미엄 구매 화면
  - AndroidStore 브리지 호출

app/src/main/assets/web/data/kanji-data.js
  - 상용한자 2,136자 로컬 데이터
```

## 서버 없는 구조의 주의점

구매 상태는 앱 실행/복원 시 Google Play Billing에서 조회하며, 최근 확인된 프리미엄 상태를 기기에 캐시합니다. 별도 백엔드 검증이 없는 구조이므로 서버 검증 방식보다 변조 방어 수준은 낮습니다. 초기 1인 앱/소규모 출시용으로 단순하게 구성했습니다.
