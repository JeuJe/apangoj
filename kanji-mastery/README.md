# 상용한자 2136 Android 앱

일본 상용한자 2,136자를 JLPT 순서로 학습하고 시험으로 현재 수준을 확인하는 완전 오프라인 앱입니다.

## 포함 기능

- N5 103자, N4 181자, N3 324자, N2 415자, N1 1,113자
- 한자·한국 훈음·일본 음독·훈독 검색
- 획수, 부수 번호, 구성 요소, 사용 빈도 표시
- 한자 상세 화면의 관련 단어, 읽기, 한국어 뜻, 예문·해석, 일본어 음성 듣기
- N5 103자는 실전 어휘·예문을 제공하고 나머지 한자는 독음 기반 학습 예문을 자동 제공
- 즐겨찾기, 학습/숙달 상태, 복습 주기, 오답 집중 복습
- 급수별 10/20/30/50문항 연습 시험
- N5~N1 각 5문항을 이용한 25문항 수준진단
- 급수별 진도, 연속 학습일, 취약 한자, 최근 시험 통계
- 네트워크 연결 없이 동작하며 학습 기록은 기기 내부에만 저장

## 바로 설치

`dist/app.apk`를 Android 기기로 옮겨 설치합니다. Google Play 배포용 서명이 아닌 설치 테스트용 서명 APK입니다.

## 실행 및 다시 빌드

Node.js 18 이상과 Java 8 이상이 필요합니다. Android Studio, Android SDK, Gradle은 필요하지 않습니다.

```bash
npm install
npm run validate
npm run dev
npm run build:apk
```

APK는 `dist/app.apk`에 생성됩니다.

## 데이터 갱신

```bash
npm run generate:data
npm run validate
```

데이터 생성기는 JLPT 학습 순서 일람을 읽고 공개 사전 데이터를 결합합니다. 생성된 앱 데이터는 `web/data/kanji-data.js`입니다.

## 데이터 범위와 저작권

학습 범위·순서·JLPT 구간은 [일본어 한자 공부방](https://nihongokanji.com/)의 공개 일람을 참고했습니다. 해당 사이트의 고유 해설, 예문, 시험 문구, 이미지는 복제하지 않았습니다.

상세 독음·의미·획수·부수는 KANJIDIC2, 구성 요소는 KanjiVG, 한국 훈음은 HanjaDict를 사용했습니다. 자세한 고지는 `legal/THIRD_PARTY_NOTICES.md`를 확인하세요.
