# 딴짓 멈춰 — 공부 중에는 허용앱만

**이 문서는 [2026-08-27-distraction-stop-deviation-split-design.md](2026-08-27-distraction-stop-deviation-split-design.md)(스펙 A)를 대체한다.** 그 스펙은 "차단할 앱 목록"을 유지한 채 이탈 감지 신호를 분리하는 설계였다. 검토 중에 방향이 바뀌어 차단 목록 자체를 허용 목록으로 뒤집기로 했고, 그 결과 이탈 감지가 필요 없어져 A의 설계 대부분이 무효가 되었다. A는 배경과 문제 진단 기록으로 남긴다.

## 배경

학생이 딴짓 멈춰가 "실행이 안 된다"고 신고했다. 두 번의 조사에서 두 개의 층이 드러났다.

**1차 (스펙 없이 즉시 수정, 커밋 `efe553f`~`c1d6058`).** 차단이 "쉬는 시간 종료 직후 lockout 창" 안에서만 작동했다. 학생이 쉬는 시간 타이머를 돌리지 않으면 차단이 아예 발동하지 않았다. 조건을 학습 세션(`sessionActive`) 기반으로 옮겼다.

**2차 (브랜치 전체 리뷰).** 그 수정도 실제로는 동작하지 않았다. `accessibility_service_config.xml`에 `packageNames` 제한이 없어 서비스가 모든 앱의 화면 전환을 받고, 같은 서비스의 이탈 감지 분기가 "우리 앱도 허용앱도 아닌" 모든 패키지에 대해 `sessionActive`를 내린다 — **런처를 포함해서**. 허용앱 기본값은 빈 목록이다.

```
학생: 공부 시작    → sessionActive ON  (차단 무장)
학생: 홈 버튼      → 런처 이벤트 → 이탈 감지 → sessionActive OFF
학생: 인스타 열기  → 차단 안 됨
```

인스타에 도달하려면 홈을 거쳐야 하므로 차단은 발동 기회를 얻기 전에 스스로 꺼졌다. 하나의 필드가 "차단 무장 신호"와 "이탈을 웹에 알리는 통신 수단"을 겸한 것이 근본 원인이었다.

같은 리뷰가 함께 찾은 것: 3초 차단 쿨다운이 이탈 분기로 흘러내려 차단을 우회할 수 있다(C3); 딴짓멈춰 오버레이가 `StudentHomeScreen`을 언마운트해 쉬는 시간 시작을 관측할 컴포넌트가 사라진다(C4); 차단 화면과 경고 알림 문구가 아직 쉬는 시간을 전제한다(I1); 갇혔을 때 딴짓멈춰 화면에 탈출 컨트롤이 없다(I2).

## 결정: 차단 목록을 허용 목록으로 뒤집는다

> **공부 중에는 허용앱이 아닌 앱에 들어갈 수 없다.**

빠져나오는 길은 세 가지뿐이다: **허용앱을 미리 설정**하거나, **쉬는 시간**을 쓰거나, **공부 끝내기**를 누른다.

이것은 강도를 높이는 동시에 설계를 단순하게 만든다. 비허용앱은 애초에 진입이 막히므로 "공부 중에 딴 앱을 쓰고 있다"는 상황이 발생하지 않고, **이탈 감지 기능 자체가 필요 없어진다.** 그러면 `sessionActive`를 두 기능이 다투는 구조가 사라져 2차 원인이 근본에서 소멸한다. `BlockedApp` enum(인스타/유튜브/틱톡)과 "차단할 앱 선택" UI도 함께 사라진다.

허용앱 선택 UI가 이 설계에서는 **선택이 아니라 필수**다. 목록이 비어 있으면 학생이 공부 중에 음악조차 못 켠다. 그래서 원래 별도 스펙(B)으로 미뤘던 앱 선택 화면을 이 스펙에 합쳐 한 번에 배포한다.

**대안으로 검토했다가 버린 것:**

- *차단 목록 유지 + 이탈 신호만 분리* — 이전 스펙 A. 동작은 하지만 "공부 켜두고 카톡" 같은 경로가 그대로 열려 있고, 막을 앱을 계속 추가해야 하는 구조다.
- *이탈 감지를 남기고 허용 목록을 추가* — 두 메커니즘이 같은 일을 두 방식으로 하게 되어 상호작용을 계속 추론해야 한다. 차단이 진입을 막으면 이탈은 정의상 발생하지 않으므로 남길 이유가 없다.

## 범위

- 차단 판정을 허용 목록 방식으로 전환, `BlockedApp`/`enabledApps` 제거
- 이탈 감지 제거
- 시스템 화면 및 생활 필수 앱 자동 통과
- 쉬는 시간을 "차단 해제 + 집계 정지"로 재정의, 종료 시 차단 자동 복귀
- 설치된 앱 목록 조회 + 허용앱 선택 화면
- 공부 끝내기 탈출구(딴짓멈춰 화면 + 알림)
- C3, C4, I1, I2 및 앞선 리뷰가 남긴 소소한 정리

**범위 밖:**

- **허용앱 사용을 매니저에게 노출** — 스펙 C. 기록 스키마와 실시간 배지가 필요하고, 실시간 구독은 이 앱에 아직 없는 기능이다. 이 스펙에서 허용앱 사용은 학생 폰 안에서만 일어난다.
- **학습 타이머의 백그라운드 유지(포그라운드 서비스)** — 별개 요청.
- **iOS** — 이 기능은 애초에 안드로이드 전용이다.
- **student-home-redesign** — 진행 중인 별개 작업. 아래 "충돌 관리" 참고.

## 설계

### 1. 차단 판정

```kotlin
fun shouldBlock(packageName: String, passThrough: Set<String>, nowMillis: Long): Boolean =
    featureEnabled &&
        isSessionActive(nowMillis) &&
        !isBreakActive(nowMillis) &&
        packageName !in passThrough &&
        packageName !in allowedApps
```

`passThrough`는 아래 2절이 시스템에서 조회해 넘긴다. `TimerState`에서 `enabledApps: Set<BlockedApp>`을 삭제하고 `BlockedApp.kt`도 삭제한다.

`!isBreakActive`가 여기 있는 이유: 쉬는 시간은 이제 공부 모드를 끄지 않는다(4절). 쉬는 시간 중 차단을 푸는 유일한 경로가 이 조건이며, 쉬는 시간이 끝나면 **학생이 아무것도 누르지 않아도 차단이 복귀한다.**

`sessionActive`의 소유자는 이제 하나뿐이다: 학생의 시작/정지/완료, 알림과 화면의 `공부 끝내기`, 3시간 자동 만료. 네이티브가 스스로 내리는 경로는 없다.

### 2. 자동 통과 대상

하드코딩하지 않고 시스템에 물어본다. 새 클래스 `PassThroughPackages`가 담당한다.

| 대상 | 조회 방법 |
|---|---|
| 우리 앱 | `context.packageName` |
| 런처 | `resolveActivity(Intent(ACTION_MAIN).addCategory(CATEGORY_HOME), MATCH_DEFAULT_ONLY)` — 제조사 런처도 잡힌다 |
| 시스템 UI | `com.android.systemui` (알림창·잠금화면·최근 앱) |
| 키보드 | `Settings.Secure.getString(DEFAULT_INPUT_METHOD)`의 `/` 앞부분 |
| 전화 | `TelecomManager.defaultDialerPackage` |
| 시계·알람 | `resolveActivity(Intent(AlarmClock.ACTION_SHOW_ALARMS))` |
| 설정 | `resolveActivity(Intent(Settings.ACTION_SETTINGS))` |

**전화를 통과시키는 것은 안전 요구사항이다.** 공부 중이라는 이유로 학생이 전화를 받거나 걸지 못하면 안 된다. 시계·알람을 넣는 이유는 알람을 못 듣거나 다시 못 맞추는 상황을 막기 위해서다.

**설정을 통과시키면 학생이 접근성 권한을 직접 끌 수 있다.** 그럼에도 통과시킨다 — 마음먹은 학생은 앱을 지우면 되므로 완전한 잠금은 애초에 불가능하고, 목표도 아니다. 제품 철학은 "물리적으로 못 하게" 가 아니라 "안 하면 티가 난다"다. 권한이 꺼진 사실을 학생 홈에 드러내는 쪽이 차단보다 이 철학에 맞고, 그 노출은 후속 작업으로 남긴다.

이 목록은 매 이벤트마다 조회하면 낭비지만 기본 런처·키보드·전화 앱은 학생이 바꿀 수 있으므로 영구 캐시도 안 된다. 서비스가 살아 있는 동안 **60초 TTL**로 캐시한다.

조회는 `Context`가 필요해 단위 테스트할 수 없다. 그래서 `PassThroughPackages`는 조회만 하고, 판정은 1절의 `shouldBlock` 순수 함수가 집합을 인자로 받아 수행한다.

### 3. 서비스 흐름

```kotlin
override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event?.eventType != TYPE_WINDOW_STATE_CHANGED) return
    val packageName = event.packageName?.toString() ?: return

    scope.launch {
        val state = store.observeState().first()
        val now = System.currentTimeMillis()

        if (!state.shouldBlock(packageName, passThrough.packages(), now)) return@launch

        // 같은 앱에 대해 연속 이벤트가 여러 번 오므로 차단 화면이 겹쳐 뜨지 않게 묶는다.
        // 쿨다운은 "이번엔 넘긴다"로 끝난다 — 예전에는 여기서 이탈 분기로 흘러내려,
        // 3초 안에 다시 열면 차단이 세션 내내 풀리는 우회 경로가 됐다(C3).
        if (packageName == lastBlockedPackage && now - lastBlockedAtMillis < BLOCK_COOLDOWN_MILLIS) return@launch
        lastBlockedPackage = packageName
        lastBlockedAtMillis = now

        handleExitAction(exitHandler.decide(state.exitMode, state.gracePeriodSeconds))
    }
}
```

이탈 감지 분기는 통째로 삭제된다. `store.setSessionActive`를 서비스가 호출하는 곳은 남지 않는다.

### 4. 쉬는 시간 = 차단 해제 + 집계 정지

`sessionActive`는 유지하고 `endTimeMillis`만 세운다. 차단은 1절의 `!isBreakActive`로 풀리고, 학습 시간 집계는 웹이 멈춘다.

집계를 멈추라는 신호는 상태에 남기는 표식으로 전달한다. 이벤트가 아니라 표식인 이유는 C4다 — 딴짓멈춰 화면을 열면 `StudentHomeScreen`이 언마운트되어 그 순간의 이벤트를 받을 컴포넌트가 없지만, 표식은 상태에 남아 다음 기회에 처리된다.

```kotlin
val pendingPauseAtMillis: Long? = null   // 이 시각 기준으로 학습 집계를 멈춰야 한다
```

전이 함수:

| 함수 | 하는 일 |
|---|---|
| `withSessionStarted(now)` | `sessionActive = true`, `sessionStartedAtMillis = now`, `endTimeMillis = null`(공부를 시작하면 쉬는 시간은 끝난다), 표식 해제 |
| `withSessionStopped()` | `sessionActive = false`, `sessionStartedAtMillis = null`, 표식 해제 |
| `withBreakUntil(end, now)` | `endTimeMillis = end`. `sessionActive`는 그대로. 공부 중이었고 표식이 없으면 `pendingPauseAtMillis = now` |
| `withPendingPauseCleared()` | 표식만 해제 |

`withBreakUntil`이 표식을 덮어쓰지 않는 이유: 첫 표식 시각이 실제로 공부를 멈춘 순간이고, 그 시각까지의 시간만 저장해야 정확하다.

### 5. 웹 — 표식 처리를 화면 밖으로

처리를 `StudentAppShell` 레벨(오버레이가 떠도 마운트를 유지한다)로 올리고, 열린 세션은 `AppStateContext`의 `studySessions`에서 유도한다. `StudentHome`의 지역 상태(`runningSessionId`)는 프로세스 재시작을 넘기지 못하므로 쓰지 않는다.

새 파일:

- `src/screens/student/pendingPauseModel.ts` — 순수 함수
  - `findOpenStudySessions(studySessions): { itemId, sessionId, startedAt }[]` — `durationSeconds == null`인 행이 열린 세션이다
  - `secondsUntil(startedAt: string, atMillis: number): number` — 표식 시각까지의 초, 음수는 0으로 클램프
- `src/screens/student/usePendingStudyPause.ts` — 위 함수들과 `AppStateContext`를 엮는 훅

훅의 동작: 표식이 있으면 열린 세션 전부를 `deviated: false`로 닫고, 저장할 초는 `secondsUntil(startedAt, pendingPauseAtMillis)`. 그다음 `clearPendingPause()`.

**표식 시각을 쓰는 것이 정확도 개선이다.** 지금은 `endStudySession`에 초를 넘기지 않아 서버가 쓰는 시점으로 계산한다. 웹이 늦게 알아차리면 그 지연이 학습 시간에 더해진다 — C4에서 쉬는 시간이 학습 시간에 포함되던 경로가 정확히 이것이다.

처리 실패 시 표식이 남아 다음 기회에 재시도한다. 세션을 닫은 뒤 해제에 실패해도 다음 실행은 열린 세션을 찾지 못해 표식만 해제하므로 중복 종료가 없다.

**`StudentHome.tsx`에서는 삭제만 한다.** `sessionActive` 하강 감지 `useEffect`, `prevNativeSessionActive`, `selfInitiatedStop`, 그리고 `handleStart`/`handleStop`의 ref 조작을 지운다. `setSessionActive` 호출은 남긴다 — 공부 모드의 소유자가 여기다. `distractionStopModel.ts`의 `classifySessionStop`과 그 테스트도 죽은 코드가 되어 삭제한다.

### 6. 설치된 앱 목록

매니페스트에 `<queries>`를 선언한다. 이러면 `QUERY_ALL_PACKAGES`(플레이스토어 심사 대상인 민감 권한) 없이 런처에 뜨는 앱만 조회할 수 있고, 학생에게 보여줄 범위도 정확히 그것이다.

```xml
<queries>
    <intent>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent>
</queries>
```

새 플러그인 메서드:

```
listInstalledApps(): { apps: { packageName: string; label: string; iconPng: string }[] }
```

`queryIntentActivities`로 런처 앱을 모으고, 라벨 기준 정렬, 자동 통과 대상과 우리 앱은 제외한다(허용앱으로 고를 필요가 없다). 아이콘은 `getApplicationIcon`의 `Drawable`을 **64×64 PNG**로 축소해 base64로 실어 보낸다 — 아이콘 하나가 대략 3~6KB이므로 앱 80개면 400KB 남짓이다. 한 번의 브리지 왕복으로 감당할 수 있는 크기이며, 화면을 열 때 한 번만 부른다.

### 7. 허용앱 선택 화면

딴짓멈춰 화면의 `허용앱` 섹션을 목록이 아니라 **진입 버튼**으로 바꾼다(`허용앱 3개 · 고르기`). 누르면 전체 화면 오버레이로 앱 선택 화면이 열린다.

- 상단 검색 입력으로 라벨 필터
- 아이콘 + 앱 이름 + 토글의 행 목록
- 이미 허용된 앱을 목록 맨 위로 모아 지금 상태가 바로 보이게 한다
- 목록을 불러오는 동안 `불러오는 중...`, 조회 결과가 비면 `설치된 앱을 불러올 수 없어요`
- 저장은 토글 즉시 반영(기존 낙관적 업데이트 패턴과 동일)

패키지명 직접 입력 UI(`AllowedAppAdder`)는 삭제한다.

**아직 허용앱을 고르지 않은 학생을 위한 안내.** 딴짓멈춰 화면의 상태 배너에 경우를 하나 추가한다: 기능이 켜져 있고 `allowedApps`가 비어 있으면 `공부 중에 쓸 앱을 미리 골라두세요 — 지금은 전화·시계·설정만 열려요`. 처음 공부를 시작했을 때 음악이 막혀 놀라는 상황을 미리 없앤다.

### 8. 상태 배너 문구

판정은 위에서 아래로 먼저 맞는 것을 쓴다. 순서가 곧 우선순위다.

| 순서 | 상태 | 문구 |
|---|---|---|
| 1 | 기능 꺼짐 | 딴짓 멈춰가 꺼져 있어요 |
| 2 | 쉬는 시간 | 쉬는 시간 N분 남음 — 이 동안은 공부 시간이 쌓이지 않아요 |
| 3 | 공부 중 | 차단 중 — 허용앱 외에는 열리지 않아요 |
| 4 | 허용앱 미설정 | 공부 중에 쓸 앱을 미리 골라두세요 — 지금은 전화·시계·설정만 열려요 |
| 5 | 공부 안 함 | 차단 대기 중 — 공부를 시작하면 허용앱 외에는 열리지 않아요 |

공부 중이면 `허용앱 미설정`보다 `차단 중`이 먼저다 — 이미 차단이 걸린 상태에서는 지금 무슨 일이 벌어지고 있는지가 준비 안내보다 급하다. `허용앱 미설정` 안내는 아직 공부를 시작하지 않았을 때만 나온다.

### 9. 탈출구(I2)와 문구 정정(I1)

딴짓멈춰 화면에 상태가 `공부 중`일 때 `공부 끝내기` 버튼을 노출하고 `setSessionActive({ active: false })`를 호출한다. 앱을 강제 종료한 뒤 다시 열었을 때 배너는 `차단 중`이라 말하면서 끌 방법이 없던 상황을 없앤다. 알림의 `공부 끝내기`는 이미 있다.

차단 화면과 경고 알림 문구는 이제 공부 중에 뜬다.

| 위치 | 현재 | 변경 |
|---|---|---|
| `activity_block_screen.xml` | 쉬는 시간이 끝났어요 | 공부 중에는 열 수 없어요 |
| 확인 알림 제목 | 계속 쉴까요? | 공부 중이에요 |
| 확인 알림 버튼 | 5분 더 쉬기 / 그만 쉬기 | 5분 쉬기 / 공부 계속하기 |
| 유예 알림 제목 | 쉬는 시간이 곧 끝나요 | 공부 중이에요 |
| 유예 알림 본문 | N초 후 자동으로 종료됩니다 | N초 후 자동으로 닫혀요 |

`5분 쉬기`는 `extendTimer`를 호출해 쉬는 시간을 시작하므로 차단이 풀리고 집계가 멈춘다 — 라벨과 동작이 일치한다.

`exitMode` 설정 섹션 제목은 `공부 중 다른 앱을 열면`으로 바꾼다.

### 10. 소소한 정리

- `TimerStateStore.startTimerUntil` 삭제 — 호출부가 없다
- `QuickControlNotificationManager`의 30초 티커 조건을 `isSessionActive(now)`로 통일. 지금은 원시 `sessionActive`를 읽어 3시간 만료 후에도 영원히 재렌더한다
- 알림 본문 문구를 허용 목록 모델에 맞게 수정(`인스타·유튜브·틱톡` → `허용앱 외`)
- `statusMessage`의 쉬는 시간 분기에서 `formatRemaining`의 `null` 보간 방어
- `dev/active/distraction-stop/distraction-stop-context.md`의 `Last Updated` 갱신

**남는 흔적 하나.** 이탈 감지가 사라지면 `AppStateContext.endStudySession(itemId, sessionId, deviated, ...)`의 `deviated`에 `true`를 넘기는 호출부가 없어진다. 인자와 그 뒤의 DB 컬럼은 **이 스펙에서 건드리지 않는다** — 스키마 변경은 범위 밖이고, 스펙 C(허용앱 사용 기록)가 같은 자리를 다시 쓸 가능성이 있다. 스펙 C를 설계할 때 이 컬럼을 재사용할지 지울지 함께 결정한다.

### 11. 데이터 마이그레이션

`fromJson`은 `runCatching { }.getOrDefault(TimerState.DEFAULT)`로 감싸여 있어 예외 하나가 학생의 설정을 전부 날린다. 그래서 새 키 `pendingPauseAtMillis`는 반드시 `has`/`isNull` 검사 후 읽는다.

삭제되는 `enabledApps`는 읽지 않으면 기존 JSON에 남은 채 무시된다. 예전 `sessionActive = true`가 남아 있어도 `sessionStartedAtMillis`가 없으면 `isSessionActive`가 false다. `allowedApps`는 기존 키를 그대로 쓴다 — 패키지명 직접 입력으로 넣어둔 값이 있다면 그대로 유효하다.

별도 마이그레이션 코드는 필요 없다.

## 충돌 관리

`student-home-redesign`이 `StudentHome.tsx`(미커밋 423줄)와 `studentHomeModel.ts`를 진행 중이다. 이 스펙을 먼저 넣고 리디자인을 그 위로 리베이스한다.

충돌 표면을 줄이기 위해:

- **새 로직은 전부 새 파일에 둔다** — `pendingPauseModel.ts`, `usePendingStudyPause.ts`, 앱 선택 화면, Kotlin `PassThroughPackages.kt`. 새 파일은 리베이스에서 충돌하지 않는다.
- **`StudentHome.tsx`에서는 삭제만 한다.** 리디자인은 그 `useEffect`를 원형 그대로 유지했으므로 해소하기 쉬운 충돌이다.
- 리디자인이 만든 `deriveRunningSessionIds`/`findStaleRunningSessions`에 **의존하지 않는다** — 아직 커밋되지 않았다. 같은 유도를 `pendingPauseModel.ts`에 독립적으로 둔다. 리디자인이 랜딩한 뒤 둘을 합치는 것은 후속 정리 대상이다.

## 테스트

**JVM 단위 테스트** (`TimerStateTest`, Robolectric 없음 — 순수 함수만):

- `shouldBlock`: 공부 중 + 비허용앱 → 차단 / 허용앱 → 통과 / 자동 통과 대상 → 통과 / 쉬는 시간 중 → 통과 / 쉬는 시간 종료 후 → 다시 차단 / 공부 아님 → 통과 / 3시간 만료 → 통과 / 기능 꺼짐 → 통과
- 회귀: 쉬는 시간을 한 번도 돌리지 않았어도 공부 중이면 차단된다(1차 원인)
- 회귀: `withBreakUntil`이 `sessionActive`를 유지한다 — 쉬는 시간 종료 후 차단이 자동 복귀하는 근거
- `withSessionStarted`가 쉬는 시간을 끝내고 표식을 해제한다
- `withBreakUntil`이 공부 중이 아니면 표식을 남기지 않는다 / 이미 표식이 있으면 덮어쓰지 않는다
- `isSessionActive`: 3시간 경계(`SESSION_MAX_MILLIS - 1` 활성 / `SESSION_MAX_MILLIS` 만료), 시작 시각 없으면 비활성

**vitest** (`pendingPauseModel.test.ts`):

- `findOpenStudySessions`: `durationSeconds == null`만 고른다 / 여러 항목에 걸친 열린 세션 / 열린 세션 없음
- `secondsUntil`: 정상 계산 / 표식 시각이 시작보다 이르면 0

**vitest** (`distractionStopModel.test.ts`): 상태 배너 판정에 `허용앱 미설정` 경우를 추가. `classifySessionStop` 테스트는 함수와 함께 삭제.

**실기기 검증** — 앱 전환 경로를 명시한다. 앞선 검증표는 "인스타를 연다"만 적어 2차 원인을 통과시켰다.

1. 접근성·오버레이 권한 허용
2. 허용앱 화면을 열어 목록이 아이콘과 함께 뜨는지 확인, 음악 앱 하나를 허용
3. 학습 타이머 시작 → 배너 `차단 중 — 허용앱 외에는 열리지 않아요`
4. **홈 버튼을 눌러 홈 화면으로 나간 뒤** 인스타그램 아이콘을 누른다 → 차단된다 (2차 원인의 핵심)
5. 4번 직후 3초 안에 인스타그램을 다시 연다 → 또 차단된다 (C3)
6. 허용한 음악 앱을 연다 → 열린다. 학습 타이머는 계속 돌고 있다
7. 카카오톡을 연다 → 차단된다
8. 전화 앱을 연다 → 열린다. 다른 기기에서 전화를 걸어 수신 화면이 뜨는지도 확인
9. 시계 앱과 설정 앱을 연다 → 열린다
10. 딴짓멈춰에서 `+5분` → 아무 앱이나 열린다 + 학습 타이머가 멈춰 있다 + 쉬는 동안 누적 시간이 늘지 않는다
11. 쉬는 시간이 끝나기를 기다린다 → 다시 시작을 누르지 않아도 카카오톡이 차단된다
12. 딴짓멈춰의 `공부 끝내기` → 카카오톡이 열린다
13. 공부 중 앱 강제 종료 → 카카오톡은 여전히 차단됨 → 앱을 다시 열어 `공부 끝내기`로 해제된다

## 배포 주의

네이티브 변경이므로 학생이 새 APK를 설치해야 한다. 이 환경의 gradle은 JDK 21(`C:/Users/DELL/.jdks/jbr-21.0.11`)로 돌려야 한다 — 기본 `JAVA_HOME`은 JDK 17이고, Android Studio 내장 JBR은 JDK 25라 Gradle 8.14.3이 settings 스크립트를 컴파일할 때 죽는다.

이 변경은 학생 입장에서 체감이 크다(공부 중 폰이 대부분 잠긴다). 배포 전에 학생에게 허용앱을 먼저 골라두게 안내하는 것이 좋다.
