# Context — 딴짓 멈춰

**Last Updated**: 2026-08-28

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
- **차단 조건(2026-08-27)**: reels-stop에서 이식한 "쉬는 시간 종료 후 lockout 창" 조건을 버리고 `sessionActive`(학습 타이머) 기반으로 전환. lockout 개념과 설정 UI 삭제. 쉬는 시간 시작 = 학습 일시정지. 앱 강제 종료 대비 3시간 자동 만료 + 알림 `공부 끝내기` 버튼. 스펙: `docs/superpowers/specs/2026-08-27-distraction-stop-session-gated-blocking-design.md`
- **허용 목록 전환(2026-08-27)**: 차단할 앱 목록(인스타/유튜브/틱톡)을 버리고 허용 목록으로 뒤집었다 — 공부 중에는 학생이 고른 허용앱과 생활 필수 앱(전화·시계·설정·런처·시스템UI·키보드, 시스템 조회) 외에 열리지 않는다. 그 결과 이탈 감지 기능이 필요 없어져 삭제했고, `sessionActive`를 차단과 이탈 감지가 다투던 구조(홈 버튼만 눌러도 차단이 스스로 꺼지던 버그)가 근본에서 사라졌다. `BlockedApp` enum, `setAppEnabled`, `classifySessionStop`, `selfInitiatedStop` ref도 함께 삭제. 쉬는 시간은 공부 모드를 끄지 않아 끝나면 차단이 자동 복귀한다. 허용앱 선택 UI는 `<queries>` + `queryIntentActivities`로 런처 앱만 조회하므로 `QUERY_ALL_PACKAGES`가 필요 없다. 스펙: `docs/superpowers/specs/2026-08-27-distraction-stop-allowlist-design.md`
- **허용앱 사용 노출(2026-08-28)**: 공부 중 허용앱에 머문 구간을 `sb_allowed_app_intervals`에 기록해 매니저에게 보여준다. **패키지명은 저장하지 않는다** — 필요한 신호는 "얼마나 오래"이고, 저장하지 않으면 새어 나갈 것도 없다. 감지는 접근성 서비스가 `TimerState`에 구간을 쌓고 셸 레벨 훅이 서버로 비우는 방식(`pendingPauseAtMillis`와 같은 패턴). Supabase Realtime은 도입하지 않았다 — 학생이 허용앱을 쓰는 동안 앱이 백그라운드라 쓰기 자체가 늦고, 늦은 값을 실시간처럼 보이면 매니저가 잘못 믿는다. 대신 문구가 `N분 전까지`로 지연을 드러낸다. 죽어 있던 `sb_study_sessions.deviated`도 함께 삭제(마이그레이션 `0021`, 새 앱 배포 뒤 적용). 스펙: `docs/superpowers/specs/2026-08-28-allowed-app-usage-visibility-design.md`

## 알려진 제약
- 이 환경에 Android SDK가 있고 `./gradlew`로 빌드·단위 테스트가 실제로 가능하다. 기본 `JAVA_HOME`은 JDK 17이라 `invalid source release: 21`로 실패한다. Android Studio 내장 JBR도 대안이 아니다 — 지금은 JDK 25라서 Gradle 8.14.3이 settings 스크립트를 컴파일하는 순간 `Unsupported class file major version 69`로 죽는다. 컴파일된 스크립트가 캐시돼 있을 때만 잠시 성공하는 것처럼 보이니 속지 말 것. 실제로 써야 하는 JDK는 `C:/Users/DELL/.jdks/jbr-21.0.11`(JDK 21)이고, 단위 테스트와 APK 빌드 양쪽에 같은 값을 쓴다: `JAVA_HOME="C:/Users/DELL/.jdks/jbr-21.0.11" ./gradlew :app:testDebugUnitTest`, `JAVA_HOME="C:/Users/DELL/.jdks/jbr-21.0.11" ./gradlew :app:assembleDebug`. 실기기 차단 동작 검증은 여전히 사용자가 수행해야 한다.
- 웹(TS/React) 쪽은 기존처럼 `npx tsc -b` / `npx vitest run` / 브라우저로 직접 검증 가능.

## 의존 관계
- `ForegroundAppAccessibilityService`, `QuickActionReceiver`, `WarningActionReceiver`, `DistractionStopPlugin`은 모두 `TimerStateStore`(단일 상태 소스)를 통해 읽고 씀.
- `DistractionStopPlugin`은 JS의 `distractionStop.ts` 래퍼가 유일한 진입점이며, `notifyListeners`로 상태 변경을 React UI에 실시간 반영.
