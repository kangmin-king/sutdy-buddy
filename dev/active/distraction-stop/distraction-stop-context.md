# Context — 딴짓 멈춰

**Last Updated**: 2026-08-04

## 핵심 파일 위치
- 포팅 원본 (읽기 전용 참고): `C:\Users\DELL\Desktop\reels-stop\app\src\main\java\com\reelsstop\app\{data,exit,notification,service,ui}`
- 신규 안드로이드 소스: `study-buddy-수정본/android/app/src/main/java/com/studybuddy/app/distraction/` (Capacitor `cap add android` 실행 후 생성)
- 신규 웹 소스: `study-buddy-수정본/src/native/distractionStop.ts`, `study-buddy-수정본/src/screens/DistractionStop.tsx`
- 기존 재사용 패턴: `src/App.tsx`(Overlay 라우팅), `src/screens/Home.tsx`(카드 진입점), `src/primitives.tsx`

## 의사결정 로그
- **패키징**: Capacitor로 study-buddy-web을 감싸 Android APK 생성. appId `com.studybuddy.app`.
- **상태 저장**: Room 대신 SharedPreferences+JSON (`TimerStateStore`) — 빌드 리스크 감소 목적, 공개 API는 원본 TimerRepository와 동일 형태 유지.
- **알림**: 커스텀 RemoteViews 대신 표준 NotificationCompat + addAction — 동일 기능(+5/+10/+30분 퀵컨트롤), 레이아웃 XML 없음.
- **차단 화면**: Compose 대신 단순 XML 레이아웃 — Compose 의존성 추가 회피.
- **네비게이션**: 기존 5탭 BottomNav 유지, 6번째 탭 추가 안 함. 기존 Overlay 패턴(`condition`/`studyLog`/`aiRecommendation`)에 `distractionStop` 추가.
- **웹 배포 호환**: 모든 진입점 `Capacitor.isNativePlatform()` 가드 — 브라우저(Vercel 배포)에서는 안내 문구만.
- **팀 모드 제외**: `dev/active/reels-stop-team-mode/`는 reels-stop 자체의 별도 기능, 이번 포팅 대상 아님.

## 알려진 제약
- 이 개발 환경에는 Android SDK/Kotlin 컴파일러가 없어 `./gradlew` 빌드/테스트를 직접 실행할 수 없음. Kotlin 코드는 패턴을 최대한 안전하게 작성하되, 실제 컴파일/온디바이스 검증은 사용자가 Android Studio에서 수행해야 함 (reels-stop-team-mode와 동일한 제약).
- 웹(TS/React) 쪽은 기존처럼 `npx tsc -b` / `npx vitest run` / 브라우저로 직접 검증 가능.

## 의존 관계
- `ForegroundAppAccessibilityService`, `QuickActionReceiver`, `WarningActionReceiver`, `DistractionStopPlugin`은 모두 `TimerStateStore`(단일 상태 소스)를 통해 읽고 씀.
- `DistractionStopPlugin`은 JS의 `distractionStop.ts` 래퍼가 유일한 진입점이며, `notifyListeners`로 상태 변경을 React UI에 실시간 반영.
