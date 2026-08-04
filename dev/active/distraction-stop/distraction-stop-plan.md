# 딴짓 멈춰 — study-buddy-web에 앱 차단 기능 추가 (승인된 계획)

전문은 `C:\Users\DELL\.claude\plans\magical-squishing-blum.md` 참고. 요약:

## Context
릴스 멈춰(reels-stop) 앱의 핵심 기능(쉬는 시간 종료 후 인스타/유튜브/틱톡 강제 차단)을 study-buddy-web에 "딴짓 멈춰"로 포팅. AccessibilityService가 필요해 순수 웹으로는 불가능 → study-buddy-web을 Capacitor로 감싸 Android APK화하고, 접근성 서비스 부분은 커스텀 Capacitor 네이티브 플러그인(Kotlin)으로 작성.

## 단순화 결정
- Room DB → SharedPreferences+JSON (`TimerStateStore`) — KSP/Room 의존성 제거로 빌드 리스크 감소
- 커스텀 RemoteViews 알림 → 표준 NotificationCompat + addAction 버튼

## 구현 순서
1. Capacitor 스캐폴딩 (`capacitor.config.ts`, `npx cap add android`)
2. 순수 로직 포팅 (TimerState/BlockedApp/ExitMode/ExitAction/ExitHandler/TimerStateStore)
3. AccessibilityService + BlockScreenActivity (XML, Compose 아님)
4. 알림 퀵컨트롤 (표준 NotificationCompat)
5. Capacitor 플러그인 (DistractionStopPlugin.kt)
6. JS 래퍼 (src/native/distractionStop.ts)
7. React UI (DistractionStop.tsx, Home 카드, App.tsx Overlay 라우팅)
8. 타입 (DistractionState 등)

## 검증
- 웹: `tsc -b`, `vitest run`, 브라우저에서 비-네이티브 안내 문구 확인
- 네이티브: 사용자가 Android Studio에서 직접 빌드/실기기 테스트 (이 환경은 Android SDK 없음)
