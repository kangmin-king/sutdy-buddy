# Tasks — 딴짓 멈춰

- [x] 1. Capacitor 스캐폴딩 (`@capacitor/core`, `@capacitor/android`, `capacitor.config.ts`, `npx cap add android`, `.gitignore`, Kotlin 플러그인 추가)
- [x] 2. 순수 로직 포팅 (TimerState/BlockedApp/ExitMode/ExitAction/ExitHandler) + TimerStateStore (SharedPreferences) + JVM 단위 테스트 포팅
- [x] 3. ForegroundAppAccessibilityService + BlockScreenActivity(XML) + accessibility_service_config.xml
- [x] 4. 알림 퀵컨트롤 (QuickControlNotificationManager/QuickActionReceiver/WarningNotificationManager/WarningActionReceiver, 표준 NotificationCompat)
- [x] 5. DistractionStopPlugin.kt + MainActivity 플러그인 등록 + AndroidManifest.xml
- [x] 6. JS 래퍼 (src/native/distractionStop.ts)
- [x] 7. React UI (DistractionStop.tsx, Home 카드, App.tsx Overlay 라우팅) + 타입
- [x] 8. 검증: tsc -b / vitest run(44/44) / 브라우저 비-네이티브 안내 확인 — 전부 통과
- [ ] 9. 사용자에게 안내: Android Studio 빌드 + 실기기 테스트 필요 항목 정리 (아래 요약 참고)
