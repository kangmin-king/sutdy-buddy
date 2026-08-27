# 딴짓 멈춰 — 학습 세션 기반 차단 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 딴짓 멈춰의 차단 조건을 "쉬는 시간 종료 직후"에서 "학습 타이머가 도는 동안"으로 옮겨, 학생이 기능을 켜고 공부를 시작하면 실제로 차단이 걸리게 한다.

**Architecture:** 차단을 무장시키는 신호를 `lockoutDurationMillis` 창에서 `sessionActive`(학습 타이머가 이미 네이티브로 보내는 값)로 교체한다. 쉬는 시간을 시작하면 학습 세션이 멈추므로 차단이 자연스럽게 해제되고 학습 시간도 쌓이지 않는다. 앱이 강제 종료돼 `sessionActive`가 영구히 참으로 남는 사고를 막기 위해 3시간 자동 만료와 알림 해제 버튼을 둔다.

**Tech Stack:** Kotlin(Capacitor 네이티브 플러그인, AccessibilityService, SharedPreferences+JSON) / React 18 + TypeScript / JUnit4(순수 함수만) / Vitest

**Spec:** `docs/superpowers/specs/2026-08-27-distraction-stop-session-gated-blocking-design.md`

## Global Constraints

- UI 문구는 한국어, 코드·커밋 메시지는 영어. 이 저장소의 기존 주석은 한국어와 영어가 섞여 있다 — **수정하는 파일의 주변 주석 언어를 따른다.**
- 새 의존성 추가 금지. Robolectric도 추가하지 않는다 — 안드로이드 `Context`가 필요한 클래스(`TimerStateStore`, 알림, 서비스)는 단위 테스트하지 않고, 테스트 가능한 로직은 전부 `TimerState`의 순수 함수로 옮긴다.
- 불변 패턴 유지: `TimerState`는 `data class` + `copy()`로만 변경한다.
- 학습 세션 자동 만료는 **3시간**. Kotlin은 `SESSION_MAX_MILLIS = 3 * 60 * 60 * 1000L`, TS는 `SESSION_MAX_MILLIS = 3 * 60 * 60 * 1000`.
- 이 개발 환경의 `JAVA_HOME`은 JDK 17이라 그대로 `./gradlew`를 돌리면 `invalid source release: 21`로 실패한다. **모든 gradle 명령에 JDK를 지정한다.**

```bash
cd android && JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew :app:testDebugUnitTest --console=plain
```

- gradle은 테스트 실패를 콘솔에 요약해주지 않는다. 결과는 `android/app/build/test-results/testDebugUnitTest/*.xml`의 `failures`/`errors` 속성으로 확인한다.
- 네이티브 변경이므로 최종 동작 확인에는 APK 재빌드·재설치가 필요하다. Task 1~5는 컴파일 + 단위 테스트까지만 자체 검증하고, 실기기 검증은 Task 6에 모아둔다.

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `android/app/src/main/java/com/studybuddy/app/distraction/TimerState.kt` | 딴짓 멈춰의 모든 판단 로직(순수 함수) | 수정 — lockout 제거, 세션 함수 추가 |
| `android/app/src/test/java/com/studybuddy/app/distraction/TimerStateTest.kt` | 위 순수 함수의 단위 테스트 | 수정 |
| `.../distraction/TimerStateStore.kt` | 상태 영속화(SharedPreferences+JSON), 판단은 `TimerState`에 위임 | 수정 |
| `.../distraction/service/ForegroundAppAccessibilityService.kt` | 앱 전환 감지 → 차단/이탈 처리 | 수정 — 조건식을 `shouldBlock`으로 교체 |
| `.../distraction/DistractionStopPlugin.kt` | 웹↔네이티브 브리지 | 수정 — lockout 메서드 제거, JSON 필드 교체 |
| `.../distraction/notification/QuickActionReceiver.kt` | 알림 버튼 처리 | 수정 — `ACTION_END_SESSION` 추가 |
| `.../distraction/notification/QuickControlNotificationManager.kt` | 상단 퀵컨트롤 알림 구성 | 수정 — 문구·버튼 구성 |
| `android/app/src/main/AndroidManifest.xml` | 리시버 액션 등록 | 수정 |
| `src/types/distraction.ts` | 브리지 상태 타입 | 수정 |
| `src/screens/distractionStopModel.ts` | 웹 쪽 표시·분류 판단(순수 함수) | 수정 — 상태 판별·정지 사유 분류 추가 |
| `src/screens/distractionStopModel.test.ts` | 위 순수 함수의 단위 테스트 | 수정 |
| `src/native/distractionStop.ts` | 플러그인 인터페이스 선언 | 수정 — lockout 메서드 제거 |
| `src/screens/DistractionStop.tsx` | 딴짓 멈춰 설정 화면 | 수정 — 상태 배너, 라벨, lockout UI 제거 |
| `src/screens/student/StudentHome.tsx` | 학습 타이머 화면 | 수정 — 정지 사유 분류 적용 |

---

### Task 1: `TimerState` — 차단 판단과 세션 수명을 순수 함수로

**Files:**
- Modify: `android/app/src/main/java/com/studybuddy/app/distraction/TimerState.kt`
- Test: `android/app/src/test/java/com/studybuddy/app/distraction/TimerStateTest.kt`

**Interfaces:**
- Consumes: `BlockedApp`(enum: `INSTAGRAM`/`YOUTUBE`/`TIKTOK`), `ExitMode`(enum: `IMMEDIATE`/`CONFIRM`/`GRACE_PERIOD`) — 둘 다 이미 있음
- Produces:
  - `TimerState`의 필드에서 `lockoutDurationMillis: Long` **삭제**, `sessionStartedAtMillis: Long? = null` **추가**
  - `fun isSessionActive(nowMillis: Long): Boolean`
  - `fun shouldBlock(app: BlockedApp, nowMillis: Long): Boolean`
  - `fun withSessionStarted(nowMillis: Long): TimerState`
  - `fun withSessionStopped(): TimerState`
  - `fun withBreakUntil(endTimeMillis: Long): TimerState`
  - `fun isWithinLockout(nowMillis: Long): Boolean` **삭제**
  - 기존 유지: `isBreakActive(nowMillis)`, `extendedEndTime(extraMillis, nowMillis)`, `companion object DEFAULT`
  - `companion object`에 `const val SESSION_MAX_MILLIS = 3 * 60 * 60 * 1000L`

- [ ] **Step 1: 테스트 파일을 새 구조로 다시 쓴다**

`lockoutDurationMillis`가 사라지므로 기존 테스트의 생성자 호출이 전부 컴파일되지 않는다. `TimerStateTest.kt` 전체를 아래로 교체한다.

```kotlin
package com.studybuddy.app.distraction

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TimerStateTest {

    private val base = TimerState(
        endTimeMillis = null,
        exitMode = ExitMode.IMMEDIATE,
        gracePeriodSeconds = 0,
        enabledApps = setOf(BlockedApp.INSTAGRAM),
        featureEnabled = true
    )

    private fun studying(startedAt: Long = 0L) = base.withSessionStarted(nowMillis = startedAt)

    // --- 쉬는 시간 ---

    @Test
    fun `isBreakActive is true when now is before endTime`() {
        assertTrue(base.copy(endTimeMillis = 10_000L).isBreakActive(nowMillis = 5_000L))
    }

    @Test
    fun `isBreakActive is false when now is at or after endTime`() {
        assertFalse(base.copy(endTimeMillis = 10_000L).isBreakActive(nowMillis = 10_000L))
    }

    @Test
    fun `isBreakActive is false when endTimeMillis is null`() {
        assertFalse(base.isBreakActive(nowMillis = 5_000L))
    }

    // 회귀: 쉬는 시간이 이미 끝난 뒤(endTime이 과거) +5분을 눌러도 "종료됨"에서 벗어나지
    // 못하던 버그. 연장 기준점이 과거 endTime이라 과거 + 5분 = 여전히 과거였다.
    @Test
    fun `extendedEndTime extends from the existing end while the break is still running`() {
        assertEquals(15_000L, base.copy(endTimeMillis = 10_000L).extendedEndTime(5_000L, nowMillis = 8_000L))
    }

    @Test
    fun `extendedEndTime extends from now when the break already ended`() {
        assertEquals(105_000L, base.copy(endTimeMillis = 10_000L).extendedEndTime(5_000L, nowMillis = 100_000L))
    }

    @Test
    fun `extendedEndTime extends from now when there is no break at all`() {
        assertEquals(105_000L, base.extendedEndTime(5_000L, nowMillis = 100_000L))
    }

    // --- 학습 세션 수명 ---

    @Test
    fun `withSessionStarted records the start time`() {
        val started = studying(startedAt = 1_000L)
        assertTrue(started.sessionActive)
        assertEquals(1_000L, started.sessionStartedAtMillis)
    }

    @Test
    fun `withSessionStopped clears both the flag and the start time`() {
        val stopped = studying(startedAt = 1_000L).withSessionStopped()
        assertFalse(stopped.sessionActive)
        assertNull(stopped.sessionStartedAtMillis)
    }

    @Test
    fun `isSessionActive is true within the three hour window`() {
        assertTrue(studying().isSessionActive(nowMillis = TimerState.SESSION_MAX_MILLIS - 1))
    }

    // 앱이 강제 종료되면 sessionActive=true가 영구히 남아 차단이 풀리지 않는다. 자동 만료가
    // 그 사고를 막는 안전장치다.
    @Test
    fun `isSessionActive expires once the three hour window has elapsed`() {
        assertFalse(studying().isSessionActive(nowMillis = TimerState.SESSION_MAX_MILLIS))
    }

    @Test
    fun `isSessionActive is false when the flag is set but the start time is missing`() {
        val legacy = base.copy(sessionActive = true, sessionStartedAtMillis = null)
        assertFalse(legacy.isSessionActive(nowMillis = 1_000L))
    }

    // --- 차단 조건 ---

    // 이번 변경의 본질: 쉬는 시간을 한 번도 돌리지 않았어도(endTimeMillis == null) 공부 중이면
    // 차단된다. 예전 조건은 isWithinLockout 때문에 이 경우 항상 차단하지 않았다.
    @Test
    fun `shouldBlock blocks a selected app while studying even with no break history`() {
        val state = studying()
        assertNull(state.endTimeMillis)
        assertTrue(state.shouldBlock(BlockedApp.INSTAGRAM, nowMillis = 1_000L))
    }

    @Test
    fun `shouldBlock does not block when the student is not studying`() {
        assertFalse(base.shouldBlock(BlockedApp.INSTAGRAM, nowMillis = 1_000L))
    }

    @Test
    fun `shouldBlock does not block when the feature is off`() {
        val state = base.copy(featureEnabled = false).withSessionStarted(nowMillis = 0L)
        assertFalse(state.shouldBlock(BlockedApp.INSTAGRAM, nowMillis = 1_000L))
    }

    @Test
    fun `shouldBlock does not block an app the student did not select`() {
        assertFalse(studying().shouldBlock(BlockedApp.YOUTUBE, nowMillis = 1_000L))
    }

    @Test
    fun `shouldBlock does not block once the session has expired`() {
        assertFalse(studying().shouldBlock(BlockedApp.INSTAGRAM, nowMillis = TimerState.SESSION_MAX_MILLIS))
    }

    // --- 쉬는 시간과 학습 세션의 관계 ---

    // 쉬는 동안 공부 시간이 쌓이면 안 되고, 차단도 풀려야 한다. 두 요구를 한 전이로 처리한다.
    @Test
    fun `withBreakUntil stops the study session`() {
        val onBreak = studying().withBreakUntil(endTimeMillis = 60_000L)
        assertEquals(60_000L, onBreak.endTimeMillis)
        assertFalse(onBreak.sessionActive)
        assertNull(onBreak.sessionStartedAtMillis)
    }

    @Test
    fun `withBreakUntil leaves nothing blocked`() {
        val onBreak = studying().withBreakUntil(endTimeMillis = 60_000L)
        assertFalse(onBreak.shouldBlock(BlockedApp.INSTAGRAM, nowMillis = 1_000L))
    }

    // --- 기본값 ---

    @Test
    fun `DEFAULT starts with no session and no break`() {
        assertNull(TimerState.DEFAULT.endTimeMillis)
        assertFalse(TimerState.DEFAULT.sessionActive)
        assertNull(TimerState.DEFAULT.sessionStartedAtMillis)
        assertEquals(emptySet<String>(), TimerState.DEFAULT.allowedApps)
    }
}
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

```bash
cd android && JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew :app:testDebugUnitTest --console=plain
```

Expected: 컴파일 실패. `TimerState`에 `SESSION_MAX_MILLIS`, `isSessionActive`, `shouldBlock`, `withSessionStarted`, `withSessionStopped`, `withBreakUntil`가 없고 생성자에 `lockoutDurationMillis`가 아직 필수 인자로 남아 있다.

- [ ] **Step 3: `TimerState.kt`를 아래 내용으로 교체한다**

```kotlin
package com.studybuddy.app.distraction

data class TimerState(
    val endTimeMillis: Long?,
    val exitMode: ExitMode,
    val gracePeriodSeconds: Int,
    val enabledApps: Set<BlockedApp>,
    val featureEnabled: Boolean,
    val allowedApps: Set<String> = emptySet(),
    // 학습 타이머가 도는 중인지. 차단은 이 값으로만 무장한다 — 공부 중이 아니면 차단하지 않는다.
    val sessionActive: Boolean = false,
    // sessionActive를 켠 시각. 앱이 강제 종료되면 네이티브는 세션이 죽은 걸 알 수 없어
    // sessionActive가 영구히 참으로 남는데, 이 값이 있으면 자동 만료로 빠져나올 수 있다.
    val sessionStartedAtMillis: Long? = null
) {
    fun isBreakActive(nowMillis: Long): Boolean =
        endTimeMillis != null && nowMillis < endTimeMillis

    // 연장의 기준점은 "쉬는 시간이 아직 남아 있으면 그 끝, 이미 지났으면 지금"이다. 과거
    // endTime을 기준으로 더하면 결과가 여전히 과거로 남아 화면이 '종료됨'에서 벗어나지
    // 못하고, +5분을 눌러도 아무 반응이 없는 것처럼 보인다.
    fun extendedEndTime(extraMillis: Long, nowMillis: Long): Long =
        maxOf(endTimeMillis ?: nowMillis, nowMillis) + extraMillis

    fun isSessionActive(nowMillis: Long): Boolean {
        val startedAt = sessionStartedAtMillis ?: return false
        return sessionActive && nowMillis - startedAt < SESSION_MAX_MILLIS
    }

    fun shouldBlock(app: BlockedApp, nowMillis: Long): Boolean =
        featureEnabled && app in enabledApps && isSessionActive(nowMillis)

    fun withSessionStarted(nowMillis: Long): TimerState =
        copy(sessionActive = true, sessionStartedAtMillis = nowMillis)

    fun withSessionStopped(): TimerState =
        copy(sessionActive = false, sessionStartedAtMillis = null)

    // 쉬는 시간을 시작/연장하면 공부는 멈춘 것으로 본다 — 차단이 풀리는 것과 학습 시간이
    // 쌓이지 않는 것이 같은 전이여야 둘이 어긋나지 않는다.
    fun withBreakUntil(endTimeMillis: Long): TimerState =
        copy(endTimeMillis = endTimeMillis).withSessionStopped()

    companion object {
        // 한 항목을 3시간 연속 공부하는 경우는 사실상 없다. 넘으면 방치된 세션으로 보고 차단을
        // 푼다 — 학생이 화면에서 다시 시작을 누르면 시작 시각이 갱신된다.
        const val SESSION_MAX_MILLIS = 3 * 60 * 60 * 1000L

        val DEFAULT = TimerState(
            endTimeMillis = null,
            exitMode = ExitMode.GRACE_PERIOD,
            gracePeriodSeconds = 10,
            enabledApps = setOf(BlockedApp.INSTAGRAM, BlockedApp.YOUTUBE, BlockedApp.TIKTOK),
            featureEnabled = true,
            allowedApps = emptySet(),
            sessionActive = false,
            sessionStartedAtMillis = null
        )
    }
}
```

- [ ] **Step 4: 테스트를 돌린다 — 아직 실패하는 것이 정상이다**

```bash
cd android && JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew :app:testDebugUnitTest --console=plain
```

`TimerStateStore`, `DistractionStopPlugin`, `ForegroundAppAccessibilityService`가 아직 `lockoutDurationMillis`와 `isWithinLockout`을 참조하므로 컴파일되지 않는다. **확인할 것: 실패 메시지가 그 세 파일의 참조 오류이고 `TimerStateTest.kt` 자체의 오류가 아니라는 점.** `TimerStateTest.kt`에 오류가 있으면 Step 1로 돌아간다.

- [ ] **Step 5: 커밋하지 않고 Task 2로 넘어간다**

Task 1과 Task 2는 함께여야 컴파일된다. Task 2의 마지막 단계에서 한 번에 커밋한다.

---

### Task 2: 저장소·서비스·브리지를 새 판단 함수로 배선

**Files:**
- Modify: `android/app/src/main/java/com/studybuddy/app/distraction/TimerStateStore.kt`
- Modify: `android/app/src/main/java/com/studybuddy/app/distraction/service/ForegroundAppAccessibilityService.kt`
- Modify: `android/app/src/main/java/com/studybuddy/app/distraction/DistractionStopPlugin.kt`

**Interfaces:**
- Consumes: Task 1의 `TimerState.withBreakUntil`, `withSessionStarted`, `withSessionStopped`, `shouldBlock`, `isSessionActive`, `extendedEndTime`
- Produces:
  - `TimerStateStore.setSessionActive(active: Boolean, nowMillis: Long = System.currentTimeMillis())` — 두 번째 인자 추가
  - `TimerStateStore.setLockoutDurationMillis` **삭제**
  - `DistractionStopPlugin`의 `setLockoutDurationMillis` `@PluginMethod` **삭제**
  - 브리지 JSON에서 `lockoutDurationMillis` **삭제**, `sessionStartedAtMillis` **추가**(없으면 `JSObject.NULL`)

- [ ] **Step 1: `TimerStateStore`의 타이머·세션 메서드를 `TimerState` 함수에 위임하게 바꾼다**

아래 네 메서드를 교체하고 `setLockoutDurationMillis` 메서드는 삭제한다.

```kotlin
    suspend fun startTimer(durationMillis: Long, nowMillis: Long) {
        save(currentState().withBreakUntil(nowMillis + durationMillis))
    }

    suspend fun startTimerUntil(endTimeMillis: Long) {
        save(currentState().withBreakUntil(endTimeMillis))
    }

    suspend fun extendTimer(extraMillis: Long, nowMillis: Long = System.currentTimeMillis()) {
        val current = currentState()
        save(current.withBreakUntil(current.extendedEndTime(extraMillis, nowMillis)))
    }

    suspend fun setSessionActive(active: Boolean, nowMillis: Long = System.currentTimeMillis()) {
        val current = currentState()
        save(if (active) current.withSessionStarted(nowMillis) else current.withSessionStopped())
    }
```

- [ ] **Step 2: `TimerStateStore`의 JSON 직렬화를 새 필드로 바꾼다**

`toJson`에서 `lockoutDurationMillis` 줄을 지우고 `sessionStartedAtMillis`를 넣는다.

```kotlin
    private fun toJson(state: TimerState): String {
        val json = JSONObject()
        json.put("endTimeMillis", state.endTimeMillis ?: JSONObject.NULL)
        json.put("exitMode", state.exitMode.name)
        json.put("gracePeriodSeconds", state.gracePeriodSeconds)
        json.put("enabledApps", JSONArray(state.enabledApps.map { it.name }))
        json.put("featureEnabled", state.featureEnabled)
        json.put("allowedApps", JSONArray(state.allowedApps.toList()))
        json.put("sessionActive", state.sessionActive)
        json.put("sessionStartedAtMillis", state.sessionStartedAtMillis ?: JSONObject.NULL)
        return json.toString()
    }
```

`fromJson`의 `return TimerState(...)` 블록을 아래로 교체한다. 기존 기기에 저장된 JSON에는 `sessionStartedAtMillis` 키가 없으므로 **반드시 `has`/`isNull` 검사를 거친다** — `getLong`을 그냥 부르면 예외가 나고 `runCatching`이 상태를 전부 `DEFAULT`로 되돌려 학생의 설정(선택한 앱, 허용앱, exitMode)이 날아간다.

```kotlin
        return TimerState(
            endTimeMillis = if (json.isNull("endTimeMillis")) null else json.getLong("endTimeMillis"),
            exitMode = runCatching { ExitMode.valueOf(json.getString("exitMode")) }.getOrDefault(ExitMode.GRACE_PERIOD),
            gracePeriodSeconds = json.getInt("gracePeriodSeconds"),
            enabledApps = apps,
            featureEnabled = json.getBoolean("featureEnabled"),
            allowedApps = allowedApps,
            sessionActive = json.optBoolean("sessionActive", false),
            sessionStartedAtMillis =
                if (!json.has("sessionStartedAtMillis") || json.isNull("sessionStartedAtMillis")) null
                else json.getLong("sessionStartedAtMillis")
        )
```

기존 JSON에 남아 있는 `lockoutDurationMillis` 키는 읽지 않으므로 그대로 무시된다. 예전 `sessionActive = true`가 남아 있어도 `sessionStartedAtMillis`가 `null`이라 `isSessionActive`가 `false`이므로 안전하게 꺼진 상태로 시작한다 — 별도 마이그레이션 코드가 필요 없다.

- [ ] **Step 3: `ForegroundAppAccessibilityService`의 차단 조건을 교체한다**

`onAccessibilityEvent` 안의 `scope.launch { ... }` 블록 전체를 아래로 교체한다.

```kotlin
        scope.launch {
            val state = store.observeState().first()
            val now = System.currentTimeMillis()

            // 차단은 학습 세션으로만 무장한다 — 공부 중에 차단 대상 앱을 열었을 때만 막는다.
            // 예전에는 "쉬는 시간이 끝난 직후 lockout 창" 안에서만 막아서, 기능을 켜고 앱을
            // 골라도 쉬는 시간을 한 번 돌리지 않으면 아무 일도 일어나지 않았다.
            val blockedApp = BlockedApp.fromPackageName(packageName)
            val inCooldown = blockedApp != null &&
                blockedApp.packageName == lastBlockedPackage &&
                now - lastBlockedAtMillis < BLOCK_COOLDOWN_MILLIS

            if (blockedApp != null && state.shouldBlock(blockedApp, now) && !inCooldown) {
                lastBlockedPackage = blockedApp.packageName
                lastBlockedAtMillis = now

                val action = exitHandler.decide(state.exitMode, state.gracePeriodSeconds)
                handleExitAction(action)
                return@launch
            }

            // Study-session allow-list deviation detection: independent of the blocking logic
            // above. Only flips a flag — no forced navigation — so the web layer notices via
            // the state Flow and stops the timer on its own. Only reached when this event did
            // NOT qualify for a block above.
            if (state.isSessionActive(now) &&
                packageName != applicationContext.packageName &&
                packageName !in state.allowedApps
            ) {
                store.setSessionActive(false)
            }
        }
```

- [ ] **Step 4: `DistractionStopPlugin`에서 lockout 메서드를 지우고 JSON을 맞춘다**

`setLockoutDurationMillis` `@PluginMethod` 블록 전체를 삭제하고 `toJSObject`를 아래로 교체한다.

```kotlin
    private fun TimerState.toJSObject(): JSObject {
        val obj = JSObject()
        obj.put("endTimeMillis", endTimeMillis ?: JSObject.NULL)
        obj.put("exitMode", exitMode.name)
        obj.put("gracePeriodSeconds", gracePeriodSeconds)
        obj.put("enabledApps", com.getcapacitor.JSArray(enabledApps.map { it.name }))
        obj.put("featureEnabled", featureEnabled)
        obj.put("allowedApps", com.getcapacitor.JSArray(allowedApps.toList()))
        obj.put("sessionActive", sessionActive)
        obj.put("sessionStartedAtMillis", sessionStartedAtMillis ?: JSObject.NULL)
        return obj
    }
```

- [ ] **Step 5: 테스트를 돌려 전부 통과하는지 확인한다**

```bash
cd android && JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew :app:testDebugUnitTest --console=plain
```

Expected: `BUILD SUCCESSFUL`. 실제 개수를 확인한다.

```bash
cd android && grep -o 'tests="[0-9]*" skipped="[0-9]*" failures="[0-9]*" errors="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml
```

Expected: `TimerStateTest` 19개 + `ExitHandlerTest` 3개, 전부 `failures="0" errors="0"`.

- [ ] **Step 6: 커밋**

```bash
git add android/app/src/main/java/com/studybuddy/app/distraction/TimerState.kt android/app/src/main/java/com/studybuddy/app/distraction/TimerStateStore.kt android/app/src/main/java/com/studybuddy/app/distraction/DistractionStopPlugin.kt android/app/src/main/java/com/studybuddy/app/distraction/service/ForegroundAppAccessibilityService.kt android/app/src/test/java/com/studybuddy/app/distraction/TimerStateTest.kt
git commit -m "feat: gate distraction blocking on the study session instead of a lockout window"
```

---

### Task 3: 알림에서 공부를 끝낼 수 있게 한다

**Files:**
- Modify: `android/app/src/main/java/com/studybuddy/app/distraction/notification/QuickActionReceiver.kt`
- Modify: `android/app/src/main/java/com/studybuddy/app/distraction/notification/QuickControlNotificationManager.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`

**Interfaces:**
- Consumes: Task 1의 `TimerState.isSessionActive`, `isBreakActive`; Task 2의 `TimerStateStore.setSessionActive`
- Produces: `QuickActionReceiver.ACTION_END_SESSION` 상수

앱을 열 수 없는 상황(강제 종료 직후, 차단 화면이 뜬 상태)에서도 학생이 차단을 풀 수 있어야 한다. 자동 만료(3시간)는 최후의 안전장치이고 이 버튼이 평소의 탈출구다.

- [ ] **Step 1: `QuickActionReceiver`에 `ACTION_END_SESSION`을 추가한다**

파일 전체를 아래로 교체한다. 기존 `ACTION_QUICK_SET`은 시간 연장 전용으로 남긴다 — 하나의 액션에 부호로 의미를 섞으면(기존 `extraMillis <= 0` 분기) 읽기 어렵고, 그 분기는 실제로 호출되는 곳이 없는 죽은 코드였다.

```kotlin
package com.studybuddy.app.distraction.notification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.studybuddy.app.distraction.TimerStateStore
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class QuickActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // goAsync() keeps the receiver alive until the state write and the notification
        // re-render finish; without it the process can be killed mid-coroutine.
        val pendingResult = goAsync()
        val store = TimerStateStore.getInstance(context.applicationContext)
        MainScope().launch {
            try {
                when (intent.action) {
                    ACTION_QUICK_SET -> {
                        val extraMillis = intent.getLongExtra(EXTRA_EXTEND_MILLIS, 0L)
                        if (extraMillis > 0) store.extendTimer(extraMillis)
                    }
                    ACTION_END_SESSION -> store.setSessionActive(false)
                }
                // Re-render directly: the app's UI may not be alive to observe this change,
                // which would leave the notification stale.
                QuickControlNotificationManager().show(context, store.observeState().first())
            } finally {
                pendingResult.finish()
            }
        }
    }

    companion object {
        const val ACTION_QUICK_SET = "com.studybuddy.app.distraction.ACTION_QUICK_SET"
        const val ACTION_END_SESSION = "com.studybuddy.app.distraction.ACTION_END_SESSION"
        const val EXTRA_EXTEND_MILLIS = "extra_extend_millis"
    }
}
```

- [ ] **Step 2: 매니페스트의 리시버 intent-filter에 새 액션을 등록한다**

`AndroidManifest.xml`의 `QuickActionReceiver` 블록을 아래로 바꾼다. **이 단계를 빼면 버튼을 눌러도 리시버가 호출되지 않는다.**

```xml
        <receiver android:name=".distraction.notification.QuickActionReceiver" android:exported="false">
            <intent-filter>
                <action android:name="com.studybuddy.app.distraction.ACTION_QUICK_SET" />
                <action android:name="com.studybuddy.app.distraction.ACTION_END_SESSION" />
            </intent-filter>
        </receiver>
```

- [ ] **Step 3: 알림 문구와 버튼 구성을 바꾼다**

`QuickControlNotificationManager`의 `show` 메서드를 아래로 교체하고, 그 아래에 `endSessionPendingIntent`를 추가한다.

```kotlin
    fun show(context: Context, state: TimerState) {
        ensureChannel(context)

        val now = System.currentTimeMillis()
        val studying = state.isSessionActive(now)
        val remainingMinutes = state.endTimeMillis
            ?.let { endTime -> ((endTime - now).coerceAtLeast(0) + 59_999L) / 60_000L }

        val title = if (state.featureEnabled) "딴짓 멈춰 On" else "딴짓 멈춰 Off"
        val content = when {
            state.isBreakActive(now) && remainingMinutes != null ->
                "쉬는 시간 ${remainingMinutes}분 남음 — 이 동안은 공부 시간이 쌓이지 않아요"
            studying -> "공부 중 — 지금 인스타·유튜브·틱톡을 열면 막혀요"
            else -> "공부를 시작하면 인스타·유튜브·틱톡이 막혀요"
        }

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(title)
            .setContentText(content)
            .setStyle(NotificationCompat.BigTextStyle().bigText(content))
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openAppPendingIntent(context))

        // 안드로이드 알림은 액션 버튼을 보통 3개까지만 보여준다. 세 번째 자리는 공부 중일 때
        // 탈출구(공부 끝내기)로 쓴다 — 앱을 열 수 없는 상황에서도 차단을 풀 수 있어야 한다.
        // 공부 중이 아니면 그 버튼은 할 일이 없으므로 +10분을 둔다.
        builder.addAction(0, "+5분", quickSetPendingIntent(context, 5 * 60_000L))
        builder.addAction(0, "+30분", quickSetPendingIntent(context, 30 * 60_000L))
        if (studying) {
            builder.addAction(0, "공부 끝내기", endSessionPendingIntent(context))
        } else {
            builder.addAction(0, "+10분", quickSetPendingIntent(context, 10 * 60_000L))
        }

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, builder.build())
    }

    private fun endSessionPendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, QuickActionReceiver::class.java).apply {
            action = QuickActionReceiver.ACTION_END_SESSION
        }
        return PendingIntent.getBroadcast(
            context,
            END_SESSION_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
```

`companion object`에 요청 코드를 추가한다. `quickSetPendingIntent`는 `extraMillis.toInt()`(양수)를 요청 코드로 쓰고 `openAppPendingIntent`는 `-2`를 쓰므로, 겹치지 않는 `-3`을 고른다.

```kotlin
        private const val END_SESSION_REQUEST_CODE = -3
```

- [ ] **Step 4: 30초 티커가 공부 중에도 알림을 갱신하게 한다**

`startObserving`의 티커는 지금 `state.endTimeMillis != null`일 때만 다시 그린다. 공부 중에는 `endTimeMillis`가 없을 수 있고, 그러면 세션이 3시간으로 만료돼도 알림 문구가 `공부 중`에 멈춰 있다. `startObserving` 안의 `scope.launch { while (true) { ... } }` 블록을 아래로 교체한다.

```kotlin
        scope.launch {
            while (true) {
                delay(30_000L)
                val state = store.observeState().first()
                // 남은 시간 표시와 세션 만료는 둘 다 시간이 지나면서 저절로 바뀌는 값이라,
                // 상태 변경 이벤트만으로는 알림이 굳는다.
                if (state.endTimeMillis != null || state.sessionActive) {
                    show(context, state)
                }
            }
        }
```

- [ ] **Step 5: 컴파일과 기존 테스트를 확인한다**

```bash
cd android && JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew :app:testDebugUnitTest --console=plain
```

Expected: `BUILD SUCCESSFUL`, 실패 0개. 이 태스크는 `Context`가 필요한 알림 코드라 단위 테스트를 추가하지 않는다 — 동작 확인은 Task 6 실기기 검증의 7·8번 항목이다.

- [ ] **Step 6: 커밋**

```bash
git add android/app/src/main/java/com/studybuddy/app/distraction/notification/QuickActionReceiver.kt android/app/src/main/java/com/studybuddy/app/distraction/notification/QuickControlNotificationManager.kt android/app/src/main/AndroidManifest.xml
git commit -m "feat: end the study session from the distraction-stop notification"
```

---

### Task 4: 웹 모델 — 상태 판별과 정지 사유 분류

**Files:**
- Modify: `src/types/distraction.ts`
- Modify: `src/screens/distractionStopModel.ts`
- Test: `src/screens/distractionStopModel.test.ts`

**Interfaces:**
- Consumes: `DistractionState`(타입)
- Produces:
  - `DistractionState`에서 `lockoutDurationMillis: number` **삭제**, `sessionStartedAtMillis: number | null` **추가**
  - `SESSION_MAX_MILLIS: number`
  - `isSessionActive(state: DistractionState, nowMillis: number): boolean`
  - `type DistractionStatus = 'off' | 'idle' | 'blocking' | 'break'`
  - `distractionStatus(state: DistractionState, nowMillis: number): DistractionStatus`
  - `statusMessage(state: DistractionState, nowMillis: number): string`
  - `type SessionStopCause = 'self' | 'break' | 'deviation'`
  - `classifySessionStop(state: DistractionState, nowMillis: number, selfInitiated: boolean): SessionStopCause`
  - 기존 유지: `isBreakActive(endTimeMillis, nowMillis)`, `extendedEndTime(endTimeMillis, extraMillis, nowMillis)`, `formatRemaining(endTimeMillis, nowMillis)`

`classifySessionStop`은 스펙의 스케치(`prev`, `next` 두 상태를 받는 형태)보다 단순하다 — 전이 시점의 상태 하나만 보면 "쉬는 시간이 방금 켜졌는가"를 알 수 있으므로 `prev`가 필요 없다.

- [ ] **Step 1: 타입을 먼저 바꾼다**

`src/types/distraction.ts`의 `DistractionState`를 아래로 교체한다. `ExitModeId`, `BlockedAppId` 선언은 그대로 둔다.

```ts
export interface DistractionState {
  endTimeMillis: number | null;
  exitMode: ExitModeId;
  gracePeriodSeconds: number;
  enabledApps: BlockedAppId[];
  featureEnabled: boolean;
  allowedApps: string[];
  // 학습 타이머가 도는 중인지 여부. 차단은 이 값으로만 무장한다 — 공부 중이 아니면 차단하지
  // 않는다. 네이티브가 허용앱 밖 이탈을 감지하면 스스로 false로 내리고 stateChanged로 알린다.
  sessionActive: boolean;
  // sessionActive를 켠 시각. 앱이 강제 종료돼 이 값이 남으면 3시간 뒤 만료로 취급한다.
  sessionStartedAtMillis: number | null;
}
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`src/screens/distractionStopModel.test.ts`의 맨 위 import 줄을 아래로 교체하고, 기존 `describe` 블록들(`isBreakActive`, `extendedEndTime`, `formatRemaining`)은 그대로 둔 채 파일 맨 아래에 새 블록들을 덧붙인다.

```ts
import { describe, expect, it } from 'vitest';
import {
  classifySessionStop,
  distractionStatus,
  extendedEndTime,
  formatRemaining,
  isBreakActive,
  isSessionActive,
  SESSION_MAX_MILLIS,
  statusMessage,
} from './distractionStopModel';
import type { DistractionState } from '../types/distraction';

const BASE: DistractionState = {
  endTimeMillis: null,
  exitMode: 'IMMEDIATE',
  gracePeriodSeconds: 0,
  enabledApps: ['INSTAGRAM'],
  featureEnabled: true,
  allowedApps: [],
  sessionActive: false,
  sessionStartedAtMillis: null,
};

const studying = (startedAt = 0): DistractionState => ({
  ...BASE,
  sessionActive: true,
  sessionStartedAtMillis: startedAt,
});
```

파일 맨 아래에 덧붙일 내용:

```ts
describe('isSessionActive', () => {
  it('is active within the three hour window', () => {
    expect(isSessionActive(studying(0), SESSION_MAX_MILLIS - 1)).toBe(true);
  });

  it('expires once the three hour window has elapsed', () => {
    expect(isSessionActive(studying(0), SESSION_MAX_MILLIS)).toBe(false);
  });

  it('is inactive when the flag is set but the start time is missing', () => {
    expect(isSessionActive({ ...BASE, sessionActive: true }, 1_000)).toBe(false);
  });

  it('is inactive when not studying', () => {
    expect(isSessionActive(BASE, 1_000)).toBe(false);
  });
});

describe('distractionStatus', () => {
  it('is off when the feature is disabled', () => {
    expect(distractionStatus({ ...studying(0), featureEnabled: false }, 1_000)).toBe('off');
  });

  it('is break while a break is running', () => {
    expect(distractionStatus({ ...BASE, endTimeMillis: 60_000 }, 1_000)).toBe('break');
  });

  it('is blocking while studying', () => {
    expect(distractionStatus(studying(0), 1_000)).toBe('blocking');
  });

  it('is idle when not studying', () => {
    expect(distractionStatus(BASE, 1_000)).toBe('idle');
  });

  it('is idle once the session has expired', () => {
    expect(distractionStatus(studying(0), SESSION_MAX_MILLIS)).toBe('idle');
  });
});

describe('statusMessage', () => {
  it('explains that studying turns blocking on', () => {
    expect(statusMessage(BASE, 1_000)).toBe('차단 대기 중 — 공부를 시작하면 인스타·유튜브·틱톡이 막혀요');
  });

  it('says blocking is on while studying', () => {
    expect(statusMessage(studying(0), 1_000)).toBe('차단 중 — 지금 인스타·유튜브·틱톡을 열면 막혀요');
  });

  it('shows the remaining break time and that study time is not counting', () => {
    expect(statusMessage({ ...BASE, endTimeMillis: 5 * 60_000 }, 0)).toBe(
      '쉬는 시간 5분 남음 — 이 동안은 공부 시간이 쌓이지 않아요'
    );
  });

  it('says the feature is off', () => {
    expect(statusMessage({ ...BASE, featureEnabled: false }, 1_000)).toBe('딴짓 멈춰가 꺼져 있어요');
  });
});

describe('classifySessionStop', () => {
  it('is self when the student pressed stop or complete', () => {
    expect(classifySessionStop(BASE, 1_000, true)).toBe('self');
  });

  // 쉬는 시간을 시작하면 네이티브가 세션을 내린다. 그건 이탈이 아니라 정상 일시정지다.
  it('is break when a break became active at the same time', () => {
    expect(classifySessionStop({ ...BASE, endTimeMillis: 60_000 }, 1_000, false)).toBe('break');
  });

  it('is deviation when the session dropped with no break running', () => {
    expect(classifySessionStop(BASE, 1_000, false)).toBe('deviation');
  });

  it('prefers self over break when the student stopped during a break', () => {
    expect(classifySessionStop({ ...BASE, endTimeMillis: 60_000 }, 1_000, true)).toBe('self');
  });
});
```

- [ ] **Step 3: 테스트를 돌려 실패를 확인한다**

```bash
npx vitest run src/screens/distractionStopModel.test.ts
```

Expected: FAIL — `isSessionActive`, `distractionStatus`, `statusMessage`, `classifySessionStop`, `SESSION_MAX_MILLIS`를 `./distractionStopModel`에서 가져올 수 없다.

- [ ] **Step 4: 구현을 추가한다**

`src/screens/distractionStopModel.ts` 맨 위에 타입 import를 넣는다.

```ts
import type { DistractionState } from '../types/distraction';
```

파일 맨 아래에 덧붙인다. 기존 `isBreakActive`, `extendedEndTime`, `formatRemaining`은 그대로 둔다.

```ts
// 네이티브 TimerState.SESSION_MAX_MILLIS와 같은 값이어야 한다. 남은 시간 표시가
// endTimeMillis로 계산되는 것과 같은 방식으로, 만료도 화면이 자기 now로 계산한다.
export const SESSION_MAX_MILLIS = 3 * 60 * 60 * 1000;

export function isSessionActive(state: DistractionState, nowMillis: number): boolean {
  if (!state.sessionActive || state.sessionStartedAtMillis == null) return false;
  return nowMillis - state.sessionStartedAtMillis < SESSION_MAX_MILLIS;
}

export type DistractionStatus = 'off' | 'idle' | 'blocking' | 'break';

export function distractionStatus(state: DistractionState, nowMillis: number): DistractionStatus {
  if (!state.featureEnabled) return 'off';
  if (isBreakActive(state.endTimeMillis, nowMillis)) return 'break';
  return isSessionActive(state, nowMillis) ? 'blocking' : 'idle';
}

// 화면이 왜 차단이 걸리지 않는지 알려주지 않아서 학생이 "실행이 안 된다"고 느꼈다.
export function statusMessage(state: DistractionState, nowMillis: number): string {
  switch (distractionStatus(state, nowMillis)) {
    case 'off':
      return '딴짓 멈춰가 꺼져 있어요';
    case 'break':
      return `쉬는 시간 ${formatRemaining(state.endTimeMillis, nowMillis)} — 이 동안은 공부 시간이 쌓이지 않아요`;
    case 'blocking':
      return '차단 중 — 지금 인스타·유튜브·틱톡을 열면 막혀요';
    case 'idle':
      return '차단 대기 중 — 공부를 시작하면 인스타·유튜브·틱톡이 막혀요';
  }
}

export type SessionStopCause = 'self' | 'break' | 'deviation';

// sessionActive가 true -> false로 떨어졌을 때 그 이유. 쉬는 시간으로 인한 정지를 이탈로
// 기록하면 학생이 하지 않은 이탈이 기록에 남는다.
export function classifySessionStop(
  state: DistractionState,
  nowMillis: number,
  selfInitiated: boolean
): SessionStopCause {
  if (selfInitiated) return 'self';
  return isBreakActive(state.endTimeMillis, nowMillis) ? 'break' : 'deviation';
}
```

`statusMessage`의 `break` 분기는 `formatRemaining`이 `'5분 남음'`을 돌려주는 데 기댄다 — 그래서 결과가 `쉬는 시간 5분 남음 — ...`이 된다.

- [ ] **Step 5: 테스트를 돌려 통과를 확인한다**

```bash
npx vitest run src/screens/distractionStopModel.test.ts
```

Expected: PASS, 26개.

- [ ] **Step 6: 커밋**

```bash
git add src/types/distraction.ts src/screens/distractionStopModel.ts src/screens/distractionStopModel.test.ts
git commit -m "feat: model the distraction-stop status banner and session stop cause"
```

---

### Task 5: 화면 배선 — 상태 배너, 라벨, lockout UI 제거, 정지 사유 반영

**Files:**
- Modify: `src/native/distractionStop.ts`
- Modify: `src/screens/DistractionStop.tsx`
- Modify: `src/screens/student/StudentHome.tsx`

**Interfaces:**
- Consumes: Task 4의 `statusMessage`, `classifySessionStop`, `isBreakActive`, `extendedEndTime`, `formatRemaining`
- Produces: 없음 (최종 소비자)

- [ ] **Step 1: 플러그인 인터페이스에서 lockout 메서드를 지운다**

`src/native/distractionStop.ts`의 `DistractionStopPlugin` 인터페이스에서 아래 줄을 삭제한다.

```ts
  setLockoutDurationMillis(opts: { durationMillis: number }): Promise<DistractionState>;
```

- [ ] **Step 2: `DistractionStop.tsx`에서 lockout UI를 제거한다**

파일 상단의 `LOCKOUT_OPTIONS` 상수 선언 전체를 삭제한다.

```ts
const LOCKOUT_OPTIONS = [
  { id: '60000', label: '1분' },
  { id: '300000', label: '5분' },
  { id: '600000', label: '10분' },
  { id: '1800000', label: '30분' },
];
```

`재차단 유예 시간` 섹션 전체를 삭제한다.

```tsx
        <div>
          <SectionTitle>재차단 유예 시간</SectionTitle>
          <ChipGroup
            options={LOCKOUT_OPTIONS}
            value={String(state.lockoutDurationMillis)}
            onChange={(id) => {
              const durationMillis = Number(id);
              setLocal((s) => s && { ...s, lockoutDurationMillis: durationMillis });
              DistractionStop.setLockoutDurationMillis({ durationMillis });
            }}
          />
        </div>
```

`ChipGroup`은 exitMode 섹션에서 계속 쓰이므로 import는 그대로 둔다.

- [ ] **Step 3: 상태 배너를 넣고 문구를 고친다**

import 줄에 `statusMessage`를 추가한다.

```ts
import { extendedEndTime, formatRemaining, isBreakActive, statusMessage } from './distractionStopModel';
```

토글 카드의 부제를 바꾼다.

```tsx
            <p className="text-xs text-on-surface-variant mt-0.5">공부하는 동안 선택한 앱을 차단해요</p>
```

토글 `</Card>` 바로 다음, 권한 경고 카드보다 **위에** 배너를 추가한다 — 권한이 갖춰진 평상시에도 항상 보여야 하는 정보다.

```tsx
        <Card className="text-center">
          <p className="text-sm text-on-surface-variant">{statusMessage(state, now)}</p>
        </Card>
```

`Card`에 `tint` prop을 쓰지 않는다. 권한 경고 카드가 `tint="error"`를 쓰므로 `Card`가 `tint`를 받는 것은 확실하지만 어떤 값이 허용되는지는 `src/primitives.tsx`를 봐야 하고, 기본 카드로 충분하다.

exitMode 섹션 제목을 바꾼다.

```tsx
          <SectionTitle>공부 중 차단 앱을 열면</SectionTitle>
```

- [ ] **Step 4: `StudentHome.tsx`가 정지 사유를 구분하게 한다**

import를 추가한다.

```ts
import { classifySessionStop } from '../distractionStopModel';
```

`sessionActive` 하강을 처리하는 `useEffect`에서, `if (!wasActive) return;` 줄부터 이펙트 끝까지를 아래로 교체한다. 그 앞의 `prevNativeSessionActive` 갱신과 `if (nativeSessionActive) { ... return }` 블록은 **그대로 둔다** — 그 순서가 자기 정지를 이탈로 오인하지 않게 하는 장치다.

```tsx
    if (!wasActive) return; // true -> false 전환만 처리
    const cause = distraction
      ? classifySessionStop(distraction, Date.now(), selfInitiatedStop.current)
      : 'deviation';
    if (cause === 'self') {
      selfInitiatedStop.current = false;
      return;
    }
    const running = Object.entries(runningSessionId);
    if (running.length === 0) return;
    for (const [itemId, sessionId] of running) {
      // 쉬는 시간으로 멈춘 것은 이탈이 아니다 — 학생이 하지 않은 이탈을 기록에 남기면 안 된다.
      actions.endStudySession(itemId, sessionId, cause === 'deviation');
    }
    setRunningSessionId({});
  }, [nativeSessionActive, runningSessionId, actions, distraction]);
```

의존성 배열에 `distraction`이 추가된 것에 주의한다. `nativeSessionActive`가 `distraction`에서 파생된 값이라 이 이펙트는 이미 상태가 바뀔 때마다 돌고, `wasActive` 검사가 실제 전환만 통과시킨다.

**`nativeSessionActive`는 지금처럼 `distraction?.sessionActive`를 그대로 쓴다.** `isSessionActive`(3시간 만료 적용)로 바꾸지 않는다 — 만료는 네이티브 차단이 영구히 걸리는 사고를 막는 안전장치이고, 웹의 1초 틱이 만료를 관측해 세션을 이탈로 종료하게 만들면 의도하지 않은 기록이 남는다.

- [ ] **Step 5: 타입 검사와 전체 테스트를 돌린다**

```bash
npx tsc --noEmit
```

Expected: 출력 없음. `lockoutDurationMillis`를 참조하는 곳이 남아 있으면 여기서 잡힌다.

```bash
npx vitest run
```

Expected: 전부 PASS.

```bash
npx vite build
```

Expected: `built in ...`.

- [ ] **Step 6: 커밋**

```bash
git add src/native/distractionStop.ts src/screens/DistractionStop.tsx src/screens/student/StudentHome.tsx
git commit -m "feat: show why distraction blocking is or is not armed"
```

---

### Task 6: 실기기 검증과 문서 갱신

**Files:**
- Modify: `docs/PRD.md`
- Modify: `dev/active/distraction-stop/distraction-stop-context.md`

네이티브 변경이라 여기까지의 단위 테스트로는 실제 차단 동작을 증명할 수 없다. APK를 빌드해 실기기에서 확인한다.

- [ ] **Step 1: 웹 자산을 빌드하고 안드로이드로 동기화한다**

```bash
npx vite build && npx cap sync android
```

- [ ] **Step 2: 디버그 APK를 빌드한다**

```bash
cd android && JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew :app:assembleDebug --console=plain
```

산출물: `android/app/build/outputs/apk/debug/app-debug.apk`

- [ ] **Step 3: 실기기에서 아래를 순서대로 확인한다**

각 항목의 결과를 기록한다. 하나라도 실패하면 멈추고 `superpowers:systematic-debugging`으로 원인을 찾는다.

1. 앱 설치 후 딴짓 멈춰 화면 진입 → 접근성·오버레이 권한 허용 → 권한 경고 카드가 사라진다
2. 공부를 시작하지 않은 상태 → 배너가 `차단 대기 중 — 공부를 시작하면 인스타·유튜브·틱톡이 막혀요`
3. 학생 홈에서 학습 타이머 시작 → 딴짓 멈춰 배너가 `차단 중 — 지금 인스타·유튜브·틱톡을 열면 막혀요`
4. 그 상태로 인스타그램 열기 → 차단 화면이 뜬다. **이번 변경의 핵심 — 쉬는 시간을 한 번도 돌리지 않았는데 차단된다**
5. 딴짓 멈춰에서 `+5분` → 배너가 `쉬는 시간 5분 남음 — ...`, 인스타그램이 열린다, 학생 홈의 학습 타이머가 멈춰 있다
6. 쉬는 동안 학습 항목의 누적 시간이 늘지 않는다
7. 학습 타이머 재시작 → 상단 알림 셋째 버튼이 `공부 끝내기`로 바뀐다 → 누르면 인스타그램이 열린다
8. 공부 중 앱을 강제 종료 → 인스타그램이 여전히 차단된다 → 기기 시각을 3시간 이상 앞으로 돌리면 차단이 풀린다

- [ ] **Step 4: PRD의 §5.11을 실제 동작에 맞게 고친다**

`docs/PRD.md`의 `### 5.11 딴짓 멈춰 (안드로이드 전용)` 섹션 본문을 아래로 교체한다. 다른 섹션과 §8.2 백로그는 건드리지 않는다 — 이 변경은 백로그 항목을 해소하지 않는다(차단 조건은 백로그에 없던 문제였다).

```markdown
### 5.11 딴짓 멈춰 (안드로이드 전용)
- 학생 앱 우측 하단 원형 버튼(자물쇠 아이콘). 누르면 오버레이로 진입.
- **차단은 학습 타이머가 도는 동안에만 걸린다.** 공부를 시작하면 선택한 앱(인스타그램/유튜브/틱톡)이 막히고, 공부 중이 아니면 막지 않는다. 화면 상단 배너가 지금 차단 중인지 대기 중인지 알려준다.
- **쉬는 시간**(+5/+10/+30분)을 시작하면 학습 타이머가 멈추고 그 동안 차단이 풀린다. 쉬는 동안에는 학습 시간이 쌓이지 않으므로, 쉬는 시간을 길게 쓰면 그만큼 학습 기록이 비어 매니저 화면에 드러난다 — 사용 한도는 두지 않는다.
- 공부 중 차단 앱을 열었을 때의 동작(즉시 차단/확인 후 종료/유예시간), 허용앱(학습 실행 중 이탈 감지 예외)을 설정할 수 있다.
- 상단 퀵컨트롤 알림에서 쉬는 시간을 시작하거나 `공부 끝내기`로 차단을 풀 수 있다 — 앱을 열 수 없는 상황의 탈출구.
- 학습 세션은 3시간이 지나면 자동 만료된다. 앱이 강제 종료돼 세션이 켜진 채 남아도 차단이 영구히 걸리지 않게 하는 안전장치.
- 실제 차단은 네이티브(Kotlin, Capacitor 플러그인)에서 동작 — 웹에서는 설정 UI만 제공. iOS에서는 기능 자체가 노출되지 않음.
- 학생이 실제로 학습 타이머를 켠 상태에서 허용 안 된 앱으로 이탈하면 네이티브가 감지해 세션을 자동 종료 처리(쉬는 시간으로 인한 정지는 이탈로 기록하지 않음).
```

- [ ] **Step 5: dev docs를 갱신한다**

`dev/active/distraction-stop/distraction-stop-context.md`의 `## 의사결정 로그` 맨 아래에 추가한다.

```markdown
- **차단 조건(2026-08-27)**: reels-stop에서 이식한 "쉬는 시간 종료 후 lockout 창" 조건을 버리고 `sessionActive`(학습 타이머) 기반으로 전환. lockout 개념과 설정 UI 삭제. 쉬는 시간 시작 = 학습 일시정지. 앱 강제 종료 대비 3시간 자동 만료 + 알림 `공부 끝내기` 버튼. 스펙: `docs/superpowers/specs/2026-08-27-distraction-stop-session-gated-blocking-design.md`
```

`## 알려진 제약`의 첫 항목(안드로이드 SDK가 없어 gradle을 못 돌린다는 내용)을 아래로 교체한다 — 사실이 바뀌었다.

```markdown
- 이 환경에 Android SDK가 있고 `./gradlew`로 빌드·단위 테스트가 가능하다. 단 `JAVA_HOME`이 JDK 17이라 `invalid source release: 21`로 실패하므로 Android Studio 내장 JDK를 지정해야 한다: `JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew :app:testDebugUnitTest`. 실기기 차단 동작 검증은 여전히 사용자가 수행해야 한다.
```

- [ ] **Step 6: 커밋**

```bash
git add docs/PRD.md dev/active/distraction-stop/distraction-stop-context.md
git commit -m "docs: record session-gated blocking in the PRD and dev context"
```
