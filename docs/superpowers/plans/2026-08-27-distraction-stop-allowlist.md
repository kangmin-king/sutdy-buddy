# 딴짓 멈춰 — 공부 중에는 허용앱만 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공부 중에는 학생이 미리 고른 허용앱과 생활 필수 앱 외에는 어떤 앱도 열 수 없게 하고, 그 허용앱을 아이콘과 이름으로 골라 설정할 수 있는 화면을 제공한다.

**Architecture:** 차단 판정을 "차단할 앱 목록"에서 "허용 목록"으로 뒤집는다. 그러면 비허용앱은 진입 자체가 막히므로 이탈 감지가 필요 없어지고, `sessionActive`를 차단과 이탈 감지가 다투던 구조가 사라진다. 통과 대상(런처·시스템UI·키보드·전화·시계·설정)은 하드코딩하지 않고 시스템에 조회한다. 쉬는 시간은 공부 모드를 끄지 않고 차단만 풀어, 끝나면 차단이 자동 복귀한다.

**Tech Stack:** Kotlin(Capacitor 네이티브 플러그인, AccessibilityService, SharedPreferences+JSON, PackageManager) / React 18 + TypeScript / JUnit4(순수 함수만) / Vitest

**Spec:** `docs/superpowers/specs/2026-08-27-distraction-stop-allowlist-design.md`

## Global Constraints

- UI 문구는 한국어, 코드·커밋 메시지는 영어. 이 저장소의 주석은 한국어와 영어가 섞여 있다 — **수정하는 파일의 주변 주석 언어를 따른다.**
- 새 의존성 추가 금지. Robolectric도 추가하지 않는다 — `Context`가 필요한 클래스(`TimerStateStore`, 알림, 서비스, `PassThroughPackages`)는 단위 테스트하지 않고, 테스트 가능한 로직은 전부 `TimerState`의 순수 함수로 옮긴다.
- 불변 패턴 유지: `TimerState`는 `data class` + `copy()`로만 변경한다.
- 학습 세션 자동 만료는 3시간. Kotlin `SESSION_MAX_MILLIS = 3 * 60 * 60 * 1000L`, TS `SESSION_MAX_MILLIS = 3 * 60 * 60 * 1000`.
- **`QUERY_ALL_PACKAGES` 권한을 추가하지 않는다.** 앱 목록은 `<queries>` + `MAIN`/`LAUNCHER` 인텐트로만 조회한다.
- **`fromJson`은 `runCatching { }.getOrDefault(TimerState.DEFAULT)`로 감싸여 있다.** 예외 하나가 학생의 설정(허용앱·exitMode)을 전부 날린다. 새 JSON 키는 반드시 `has`/`isNull` 검사 후 읽는다.
- gradle은 **JDK 21**로 돌린다. 기본 `JAVA_HOME`은 JDK 17이라 `invalid source release: 21`로 실패하고, Android Studio 내장 JBR은 JDK 25라 Gradle 8.14.3이 settings 스크립트를 컴파일할 때 `Unsupported class file major version 69`로 죽는다.

```bash
cd android && JAVA_HOME="C:/Users/DELL/.jdks/jbr-21.0.11" ./gradlew :app:testDebugUnitTest --console=plain
```

- gradle은 테스트 실패를 콘솔에 요약하지 않는다. 결과는 `android/app/build/test-results/testDebugUnitTest/*.xml`의 `failures`/`errors` 속성으로 확인한다.
- **작업트리에 이 계획과 무관한 미커밋 작업이 있다.** `src/App.tsx`, `src/primitives.tsx`, `src/screens/shared/HomeBanner.tsx`, `src/screens/student/LinkedManagerChips.tsx`, `src/screens/student/StudentHome.tsx`, `src/screens/student/studentHomeModel.ts(.test.ts)`, `dev/active/student-home-redesign/`. 각 태스크의 `git add`에 적힌 파일만 스테이징한다. **`git add -A` / `git add .` 금지.**

## 스펙에서 한 가지 교정

스펙 §4는 `withSessionStarted`와 `withSessionStopped`가 `pendingPauseAtMillis`를 해제한다고 적었다. **이 계획은 그렇게 하지 않는다.** 아직 처리되지 않은 표식을 해제하면 그 표식이 닫아야 했던 열린 학습 세션이 영구히 `ended_at = null`로 남는다.

대신 표식은 `withBreakUntil`만 세우고 처리 훅만 해제한다(쓰는 쪽이 한 곳, 지우는 쪽이 한 곳). 표식이 남아 있는 동안 학생이 새로 공부를 시작하는 경우를 위해, 처리 훅은 **표식 시각 이전에 시작된 세션만** 닫는다(`findOpenStudySessionsBefore`). 새 세션은 건드리지 않는다. 표식이 낡아 해당하는 세션이 없으면 훅은 표식만 해제한다.

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `android/.../distraction/TimerState.kt` | 딴짓 멈춰의 모든 판단 로직(순수 함수) | 수정 |
| `android/app/src/test/.../TimerStateTest.kt` | 위 순수 함수의 단위 테스트 | 수정 |
| `android/.../distraction/BlockedApp.kt` | 인스타/유튜브/틱톡 enum | **삭제** |
| `android/app/src/test/.../ExitHandlerTest.kt` | 기존 테스트 | 변경 없음 |
| `android/.../distraction/PassThroughPackages.kt` | 통과 대상 패키지를 시스템에 조회 | **신규** |
| `android/.../distraction/TimerStateStore.kt` | 상태 영속화, 판단은 `TimerState`에 위임 | 수정 |
| `android/.../distraction/service/ForegroundAppAccessibilityService.kt` | 앱 전환 감지 → 차단 | 수정 |
| `android/.../distraction/DistractionStopPlugin.kt` | 웹↔네이티브 브리지 | 수정 |
| `android/.../distraction/InstalledApps.kt` | 런처 앱 목록 + 아이콘 조회 | **신규** |
| `android/.../distraction/notification/WarningNotificationManager.kt` | 차단 시 경고 알림 | 수정(문구) |
| `android/.../distraction/notification/QuickControlNotificationManager.kt` | 상단 퀵컨트롤 알림 | 수정(문구·티커) |
| `android/app/src/main/res/layout/activity_block_screen.xml` | 차단 전체화면 | 수정(문구) |
| `android/app/src/main/AndroidManifest.xml` | `<queries>` 선언 | 수정 |
| `src/types/distraction.ts` | 브리지 상태 타입 | 수정 |
| `src/screens/distractionStopModel.ts` | 표시·판정 순수 함수 | 수정 |
| `src/screens/distractionStopModel.test.ts` | 위 테스트 | 수정 |
| `src/screens/student/pendingPauseModel.ts` | 열린 세션 유도·경과초 계산(순수) | **신규** |
| `src/screens/student/pendingPauseModel.test.ts` | 위 테스트 | **신규** |
| `src/screens/student/usePendingStudyPause.ts` | 표식 처리 훅 | **신규** |
| `src/screens/AllowedAppsScreen.tsx` | 허용앱 선택 화면 | **신규** |
| `src/native/distractionStop.ts` | 플러그인 인터페이스 | 수정 |
| `src/screens/DistractionStop.tsx` | 딴짓멈춰 설정 화면 | 수정 |
| `src/screens/student/StudentHome.tsx` | 학습 타이머 화면 | 수정(삭제만) |
| `src/App.tsx` | 셸·오버레이 라우팅 | 수정 |

---

### Task 1: 네이티브 차단 판정을 허용 목록으로

여섯 파일이 함께여야 컴파일된다(`BlockedApp` 삭제가 나머지를 깨뜨린다). 한 커밋으로 마무리한다.

**Files:**
- Modify: `android/app/src/main/java/com/studybuddy/app/distraction/TimerState.kt`
- Delete: `android/app/src/main/java/com/studybuddy/app/distraction/BlockedApp.kt`
- Create: `android/app/src/main/java/com/studybuddy/app/distraction/PassThroughPackages.kt`
- Modify: `android/app/src/main/java/com/studybuddy/app/distraction/TimerStateStore.kt`
- Modify: `android/app/src/main/java/com/studybuddy/app/distraction/DistractionStopPlugin.kt`
- Modify: `android/app/src/main/java/com/studybuddy/app/distraction/service/ForegroundAppAccessibilityService.kt`
- Test: `android/app/src/test/java/com/studybuddy/app/distraction/TimerStateTest.kt`

**Interfaces:**
- Consumes: `ExitMode`(enum: `IMMEDIATE`/`CONFIRM`/`GRACE_PERIOD`), `ExitHandler.decide(mode, gracePeriodSeconds)` — 둘 다 이미 있고 변경 없음
- Produces:
  - `TimerState`에서 `enabledApps: Set<BlockedApp>` **삭제**, `pendingPauseAtMillis: Long? = null` **추가**
  - `fun shouldBlock(packageName: String, passThrough: Set<String>, nowMillis: Long): Boolean`
  - `fun hasPendingPause(): Boolean`
  - `fun withSessionStarted(nowMillis: Long): TimerState`
  - `fun withSessionStopped(): TimerState`
  - `fun withBreakUntil(endTimeMillis: Long, nowMillis: Long): TimerState`
  - `fun withPendingPauseCleared(): TimerState`
  - 유지: `isBreakActive(nowMillis)`, `extendedEndTime(extraMillis, nowMillis)`, `isSessionActive(nowMillis)`, `SESSION_MAX_MILLIS`, `DEFAULT`
  - `class PassThroughPackages(context: Context)` with `fun packages(nowMillis: Long = System.currentTimeMillis()): Set<String>`
  - `TimerStateStore.setSessionActive(active, nowMillis)`, `markPendingPauseCleared()`, `extendTimer(extraMillis, nowMillis)`, `startTimer(durationMillis, nowMillis)` — `setAppEnabled` **삭제**
  - 브리지 JSON: `enabledApps` **삭제**, `pendingPauseAtMillis` **추가**. 플러그인 메서드 `setAppEnabled` **삭제**, `clearPendingPause` **추가**

- [ ] **Step 1: `TimerStateTest.kt`를 새 구조로 다시 쓴다**

`enabledApps`가 사라지고 생성자가 바뀌므로 파일 전체를 아래로 교체한다.

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
        featureEnabled = true
    )

    private fun studying(startedAt: Long = 0L) = base.withSessionStarted(nowMillis = startedAt)

    private val passThrough = setOf("com.android.launcher", "com.studybuddy.app")

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

    // 회귀: 이미 끝난 쉬는 시간에 +5분을 더하면 과거 + 5분이라 여전히 과거였고, 화면이
    // '종료됨'에서 벗어나지 못해 버튼이 죽은 것처럼 보였다.
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
    fun `withSessionStarted records the start time and ends any break`() {
        val started = base.copy(endTimeMillis = 99_000L).withSessionStarted(nowMillis = 1_000L)
        assertTrue(started.sessionActive)
        assertEquals(1_000L, started.sessionStartedAtMillis)
        assertNull(started.endTimeMillis)
    }

    @Test
    fun `withSessionStopped clears both the flag and the start time`() {
        val stopped = studying(1_000L).withSessionStopped()
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
        assertFalse(base.copy(sessionActive = true, sessionStartedAtMillis = null).isSessionActive(1_000L))
    }

    // --- 차단 판정 (허용 목록) ---

    // 이번 변경의 본질: 공부 중이면 허용앱이 아닌 모든 앱이 막힌다. 쉬는 시간을 한 번도
    // 돌리지 않았어도(endTimeMillis == null) 막힌다.
    @Test
    fun `shouldBlock blocks any app outside the allow-list while studying`() {
        val state = studying()
        assertNull(state.endTimeMillis)
        assertTrue(state.shouldBlock("com.kakao.talk", passThrough, nowMillis = 1_000L))
    }

    @Test
    fun `shouldBlock lets an allowed app through`() {
        val state = studying().copy(allowedApps = setOf("com.spotify.music"))
        assertFalse(state.shouldBlock("com.spotify.music", passThrough, nowMillis = 1_000L))
    }

    // 런처를 막으면 학생이 홈 화면조차 못 보게 된다. 전화를 막으면 위험하다.
    @Test
    fun `shouldBlock lets a pass-through package through`() {
        assertFalse(studying().shouldBlock("com.android.launcher", passThrough, nowMillis = 1_000L))
    }

    @Test
    fun `shouldBlock does not block when the student is not studying`() {
        assertFalse(base.shouldBlock("com.kakao.talk", passThrough, nowMillis = 1_000L))
    }

    @Test
    fun `shouldBlock does not block when the feature is off`() {
        val state = base.copy(featureEnabled = false).withSessionStarted(nowMillis = 0L)
        assertFalse(state.shouldBlock("com.kakao.talk", passThrough, nowMillis = 1_000L))
    }

    @Test
    fun `shouldBlock does not block once the session has expired`() {
        assertFalse(studying().shouldBlock("com.kakao.talk", passThrough, TimerState.SESSION_MAX_MILLIS))
    }

    // --- 쉬는 시간과 차단·집계의 관계 ---

    // 쉬는 시간은 공부 모드를 끄지 않는다. 차단만 풀린다.
    @Test
    fun `withBreakUntil keeps study mode on and releases blocking`() {
        val onBreak = studying().withBreakUntil(endTimeMillis = 60_000L, nowMillis = 1_000L)
        assertTrue(onBreak.sessionActive)
        assertFalse(onBreak.shouldBlock("com.kakao.talk", passThrough, nowMillis = 2_000L))
    }

    // 그래서 쉬는 시간이 끝나면 학생이 아무것도 누르지 않아도 차단이 복귀한다.
    @Test
    fun `blocking returns by itself once the break ends`() {
        val onBreak = studying().withBreakUntil(endTimeMillis = 60_000L, nowMillis = 1_000L)
        assertTrue(onBreak.shouldBlock("com.kakao.talk", passThrough, nowMillis = 60_000L))
    }

    @Test
    fun `withBreakUntil marks a pending pause while studying`() {
        val onBreak = studying().withBreakUntil(endTimeMillis = 60_000L, nowMillis = 1_000L)
        assertEquals(1_000L, onBreak.pendingPauseAtMillis)
        assertTrue(onBreak.hasPendingPause())
    }

    @Test
    fun `withBreakUntil marks nothing when the student is not studying`() {
        val onBreak = base.withBreakUntil(endTimeMillis = 60_000L, nowMillis = 1_000L)
        assertNull(onBreak.pendingPauseAtMillis)
        assertFalse(onBreak.hasPendingPause())
    }

    // 첫 표식 시각이 실제로 공부를 멈춘 순간이다. 연장할 때마다 덮어쓰면 그만큼 쉬는 시간이
    // 학습 시간으로 들어간다.
    @Test
    fun `withBreakUntil does not overwrite an unprocessed pending pause`() {
        val onBreak = studying()
            .withBreakUntil(endTimeMillis = 60_000L, nowMillis = 1_000L)
            .withBreakUntil(endTimeMillis = 120_000L, nowMillis = 50_000L)
        assertEquals(1_000L, onBreak.pendingPauseAtMillis)
        assertEquals(120_000L, onBreak.endTimeMillis)
    }

    @Test
    fun `withPendingPauseCleared clears only the mark`() {
        val cleared = studying().withBreakUntil(60_000L, 1_000L).withPendingPauseCleared()
        assertNull(cleared.pendingPauseAtMillis)
        assertTrue(cleared.sessionActive)
        assertEquals(60_000L, cleared.endTimeMillis)
    }

    // --- 기본값 ---

    @Test
    fun `DEFAULT starts with no session, no break and no allowed apps`() {
        assertNull(TimerState.DEFAULT.endTimeMillis)
        assertFalse(TimerState.DEFAULT.sessionActive)
        assertNull(TimerState.DEFAULT.sessionStartedAtMillis)
        assertNull(TimerState.DEFAULT.pendingPauseAtMillis)
        assertEquals(emptySet<String>(), TimerState.DEFAULT.allowedApps)
    }
}
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

```bash
cd android && JAVA_HOME="C:/Users/DELL/.jdks/jbr-21.0.11" ./gradlew :app:testDebugUnitTest --console=plain
```

Expected: 컴파일 실패. `TimerState`에 `shouldBlock(String, Set, Long)`, `hasPendingPause`, `withBreakUntil(Long, Long)`, `withPendingPauseCleared`, `pendingPauseAtMillis`가 없고 생성자에 `enabledApps`가 아직 필수 인자로 남아 있다.

- [ ] **Step 3: `TimerState.kt`를 아래로 교체한다**

```kotlin
package com.studybuddy.app.distraction

data class TimerState(
    val endTimeMillis: Long?,
    val exitMode: ExitMode,
    val gracePeriodSeconds: Int,
    val featureEnabled: Boolean,
    // 학생이 직접 고른, 공부 중에도 열 수 있는 앱들.
    val allowedApps: Set<String> = emptySet(),
    // 공부 모드. 차단을 무장시키는 유일한 신호이며, 웹(학생의 시작/정지/완료)과 알림·화면의
    // '공부 끝내기'만 바꾼다 — 네이티브가 스스로 내리는 경로는 없다.
    val sessionActive: Boolean = false,
    // sessionActive를 켠 시각. 앱이 강제 종료되면 네이티브는 세션이 죽은 걸 알 수 없어
    // sessionActive가 영구히 참으로 남는데, 이 값이 있으면 자동 만료로 빠져나올 수 있다.
    val sessionStartedAtMillis: Long? = null,
    // "이 시각 기준으로 학습 시간 집계를 멈춰야 한다"는 표식. 쉬는 시간 시작이 세우고, 웹이
    // 처리한 뒤 지운다. 이벤트가 아니라 상태인 이유: 딴짓멈춰 화면을 열면 학생 홈이
    // 언마운트되어 그 순간의 이벤트를 받을 컴포넌트가 없지만, 표식은 남아 다음에 처리된다.
    val pendingPauseAtMillis: Long? = null
) {
    fun isBreakActive(nowMillis: Long): Boolean =
        endTimeMillis != null && nowMillis < endTimeMillis

    // 연장의 기준점은 "쉬는 시간이 아직 남아 있으면 그 끝, 이미 지났으면 지금"이다. 과거
    // endTime을 기준으로 더하면 결과가 여전히 과거로 남아 화면이 '종료됨'에서 벗어나지 못한다.
    fun extendedEndTime(extraMillis: Long, nowMillis: Long): Long =
        maxOf(endTimeMillis ?: nowMillis, nowMillis) + extraMillis

    fun isSessionActive(nowMillis: Long): Boolean {
        val startedAt = sessionStartedAtMillis ?: return false
        return sessionActive && nowMillis - startedAt < SESSION_MAX_MILLIS
    }

    // 공부 중에는 허용앱이 아닌 앱에 들어갈 수 없다. passThrough는 시스템에서 조회한 통과
    // 대상(런처·시스템UI·키보드·전화·시계·설정·우리 앱)이며 PassThroughPackages가 넘긴다.
    // !isBreakActive가 쉬는 시간 중 차단을 푸는 유일한 경로다 — 쉬는 시간이 공부 모드를 끄지
    // 않으므로, 쉬는 시간이 끝나면 학생이 아무것도 누르지 않아도 차단이 복귀한다.
    fun shouldBlock(packageName: String, passThrough: Set<String>, nowMillis: Long): Boolean =
        featureEnabled &&
            isSessionActive(nowMillis) &&
            !isBreakActive(nowMillis) &&
            packageName !in passThrough &&
            packageName !in allowedApps

    fun hasPendingPause(): Boolean = pendingPauseAtMillis != null

    fun withSessionStarted(nowMillis: Long): TimerState =
        copy(sessionActive = true, sessionStartedAtMillis = nowMillis, endTimeMillis = null)

    fun withSessionStopped(): TimerState =
        copy(sessionActive = false, sessionStartedAtMillis = null)

    // 쉬는 시간은 endTimeMillis만 세우고 공부 모드는 그대로 둔다. 공부 중이었다면 집계를
    // 멈추라는 표식을 남기되, 이미 처리 안 된 표식이 있으면 덮어쓰지 않는다 — 첫 표식 시각이
    // 실제로 공부를 멈춘 순간이고, 덮어쓰면 그만큼 쉬는 시간이 학습 시간으로 들어간다.
    fun withBreakUntil(endTimeMillis: Long, nowMillis: Long): TimerState {
        val next = copy(endTimeMillis = endTimeMillis)
        return if (sessionActive && pendingPauseAtMillis == null) {
            next.copy(pendingPauseAtMillis = nowMillis)
        } else {
            next
        }
    }

    fun withPendingPauseCleared(): TimerState = copy(pendingPauseAtMillis = null)

    companion object {
        // 한 항목을 3시간 연속 공부하는 경우는 사실상 없다. 넘으면 방치된 세션으로 보고 차단을
        // 푼다 — 학생이 화면에서 다시 시작을 누르면 시작 시각이 갱신된다.
        const val SESSION_MAX_MILLIS = 3 * 60 * 60 * 1000L

        val DEFAULT = TimerState(
            endTimeMillis = null,
            exitMode = ExitMode.GRACE_PERIOD,
            gracePeriodSeconds = 10,
            featureEnabled = true,
            allowedApps = emptySet(),
            sessionActive = false,
            sessionStartedAtMillis = null,
            pendingPauseAtMillis = null
        )
    }
}
```

- [ ] **Step 4: `BlockedApp.kt`를 삭제한다**

```bash
git rm android/app/src/main/java/com/studybuddy/app/distraction/BlockedApp.kt
```

- [ ] **Step 5: `PassThroughPackages.kt`를 만든다**

```kotlin
package com.studybuddy.app.distraction

import android.content.Context
import android.content.Intent
import android.provider.AlarmClock
import android.provider.Settings
import android.telecom.TelecomManager

// 공부 중에도 통과시켜야 하는 패키지를 시스템에 조회한다. 하드코딩하지 않는 이유는 런처와
// 키보드와 전화 앱이 기기·학생마다 다르기 때문이다.
//
// 전화를 통과시키는 것은 안전 요구사항이다 — 공부 중이라는 이유로 전화를 받거나 걸지 못하면
// 안 된다. 시계·알람은 알람을 못 듣거나 다시 못 맞추는 상황을 막는다. 설정은 통과시킨다:
// 마음먹은 학생은 앱을 지우면 되므로 완전한 잠금은 애초에 불가능하고, 제품 철학은 "물리적으로
// 못 하게"가 아니라 "안 하면 티가 난다"다.
class PassThroughPackages(context: Context) {
    private val appContext = context.applicationContext

    private var cached: Set<String>? = null
    private var cachedAtMillis = 0L

    fun packages(nowMillis: Long = System.currentTimeMillis()): Set<String> {
        val current = cached
        if (current != null && nowMillis - cachedAtMillis < CACHE_TTL_MILLIS) return current

        val resolved = buildSet {
            add(appContext.packageName)
            add(SYSTEM_UI_PACKAGE)
            resolvePackage(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME))?.let { add(it) }
            resolvePackage(Intent(AlarmClock.ACTION_SHOW_ALARMS))?.let { add(it) }
            resolvePackage(Intent(Settings.ACTION_SETTINGS))?.let { add(it) }
            defaultDialerPackage()?.let { add(it) }
            currentInputMethodPackage()?.let { add(it) }
        }

        cached = resolved
        cachedAtMillis = nowMillis
        return resolved
    }

    private fun resolvePackage(intent: Intent): String? = runCatching {
        appContext.packageManager
            .resolveActivity(intent, android.content.pm.PackageManager.MATCH_DEFAULT_ONLY)
            ?.activityInfo
            ?.packageName
    }.getOrNull()

    private fun defaultDialerPackage(): String? = runCatching {
        (appContext.getSystemService(Context.TELECOM_SERVICE) as TelecomManager).defaultDialerPackage
    }.getOrNull()

    // DEFAULT_INPUT_METHOD는 "패키지명/서비스명" 형식이다.
    private fun currentInputMethodPackage(): String? = runCatching {
        Settings.Secure.getString(appContext.contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD)
            ?.substringBefore('/')
            ?.takeIf { it.isNotBlank() }
    }.getOrNull()

    companion object {
        private const val SYSTEM_UI_PACKAGE = "com.android.systemui"

        // 기본 런처·키보드·전화 앱은 학생이 바꿀 수 있으므로 영구 캐시는 안 되고,
        // 매 이벤트마다 조회하는 것도 낭비다.
        private const val CACHE_TTL_MILLIS = 60_000L
    }
}
```

모든 조회를 `runCatching`으로 감싸는 이유: 제조사 롬에서 특정 인텐트가 해석되지 않거나 `TelecomManager`가 없을 수 있다. 하나가 실패해도 나머지 통과 대상은 유지되어야 한다.

- [ ] **Step 6: `TimerStateStore.kt`를 고친다**

`setAppEnabled` 메서드를 **삭제**하고, 타이머·세션 메서드와 JSON을 아래로 교체한다.

```kotlin
    suspend fun startTimer(durationMillis: Long, nowMillis: Long) {
        save(currentState().withBreakUntil(nowMillis + durationMillis, nowMillis))
    }

    suspend fun extendTimer(extraMillis: Long, nowMillis: Long = System.currentTimeMillis()) {
        val current = currentState()
        save(current.withBreakUntil(current.extendedEndTime(extraMillis, nowMillis), nowMillis))
    }

    suspend fun stopTimer() {
        save(currentState().copy(endTimeMillis = null))
    }

    suspend fun setSessionActive(active: Boolean, nowMillis: Long = System.currentTimeMillis()) {
        val current = currentState()
        save(if (active) current.withSessionStarted(nowMillis) else current.withSessionStopped())
    }

    suspend fun clearPendingPause() {
        save(currentState().withPendingPauseCleared())
    }
```

`startTimerUntil`은 호출부가 없으므로 삭제한다.

`toJson`을 아래로 교체한다. `enabledApps` 줄이 사라지고 `pendingPauseAtMillis`가 들어간다.

```kotlin
    private fun toJson(state: TimerState): String {
        val json = JSONObject()
        json.put("endTimeMillis", state.endTimeMillis ?: JSONObject.NULL)
        json.put("exitMode", state.exitMode.name)
        json.put("gracePeriodSeconds", state.gracePeriodSeconds)
        json.put("featureEnabled", state.featureEnabled)
        json.put("allowedApps", JSONArray(state.allowedApps.toList()))
        json.put("sessionActive", state.sessionActive)
        json.put("sessionStartedAtMillis", state.sessionStartedAtMillis ?: JSONObject.NULL)
        json.put("pendingPauseAtMillis", state.pendingPauseAtMillis ?: JSONObject.NULL)
        return json.toString()
    }
```

`fromJson`을 아래로 교체한다. `enabledApps`를 읽던 블록(`appsArray` 루프)을 지운다. **새 키는 반드시 `has`/`isNull` 검사를 거친다** — `getLong`을 그냥 부르면 예외가 나고 `runCatching`이 상태를 `DEFAULT`로 되돌려 학생의 허용앱과 exitMode가 날아간다.

```kotlin
    private fun fromJson(raw: String): TimerState {
        val json = JSONObject(raw)
        val allowedApps = mutableSetOf<String>()
        if (json.has("allowedApps")) {
            val allowedArray = json.getJSONArray("allowedApps")
            for (i in 0 until allowedArray.length()) {
                allowedApps.add(allowedArray.getString(i))
            }
        }
        return TimerState(
            endTimeMillis = if (json.isNull("endTimeMillis")) null else json.getLong("endTimeMillis"),
            exitMode = runCatching { ExitMode.valueOf(json.getString("exitMode")) }.getOrDefault(ExitMode.GRACE_PERIOD),
            gracePeriodSeconds = json.getInt("gracePeriodSeconds"),
            featureEnabled = json.getBoolean("featureEnabled"),
            allowedApps = allowedApps,
            sessionActive = json.optBoolean("sessionActive", false),
            sessionStartedAtMillis = optLongOrNull(json, "sessionStartedAtMillis"),
            pendingPauseAtMillis = optLongOrNull(json, "pendingPauseAtMillis")
        )
    }

    private fun optLongOrNull(json: JSONObject, key: String): Long? =
        if (!json.has(key) || json.isNull(key)) null else json.getLong(key)
```

기존 기기 JSON에 남은 `enabledApps`는 읽지 않으므로 무시된다. 예전 `sessionActive = true`가 남아 있어도 `sessionStartedAtMillis`가 없으면 `isSessionActive`가 false다.

- [ ] **Step 7: `DistractionStopPlugin.kt`를 고친다**

`setAppEnabled` `@PluginMethod` 블록 전체를 **삭제**하고, 아래 메서드를 추가한다.

```kotlin
    @PluginMethod
    fun clearPendingPause(call: PluginCall) {
        scope.launch {
            store.clearPendingPause()
            call.resolve(store.observeState().value.toJSObject())
        }
    }
```

`toJSObject`를 아래로 교체한다.

```kotlin
    private fun TimerState.toJSObject(): JSObject {
        val obj = JSObject()
        obj.put("endTimeMillis", endTimeMillis ?: JSObject.NULL)
        obj.put("exitMode", exitMode.name)
        obj.put("gracePeriodSeconds", gracePeriodSeconds)
        obj.put("featureEnabled", featureEnabled)
        obj.put("allowedApps", com.getcapacitor.JSArray(allowedApps.toList()))
        obj.put("sessionActive", sessionActive)
        obj.put("sessionStartedAtMillis", sessionStartedAtMillis ?: JSObject.NULL)
        obj.put("pendingPauseAtMillis", pendingPauseAtMillis ?: JSObject.NULL)
        return obj
    }
```

`import com.studybuddy.app.distraction.BlockedApp`가 있으면 지운다.

- [ ] **Step 8: `ForegroundAppAccessibilityService.kt`를 고친다**

이탈 감지 분기가 통째로 사라진다. 파일을 아래로 교체한다.

```kotlin
package com.studybuddy.app.distraction.service

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.view.accessibility.AccessibilityEvent
import com.studybuddy.app.distraction.ExitAction
import com.studybuddy.app.distraction.ExitHandler
import com.studybuddy.app.distraction.PassThroughPackages
import com.studybuddy.app.distraction.TimerStateStore
import com.studybuddy.app.distraction.notification.WarningNotificationManager
import com.studybuddy.app.distraction.ui.BlockScreenActivity
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class ForegroundAppAccessibilityService : AccessibilityService() {

    private val store by lazy { TimerStateStore.getInstance(applicationContext) }
    private val passThrough by lazy { PassThroughPackages(applicationContext) }
    private val exitHandler = ExitHandler()
    private val warningManager = WarningNotificationManager()
    private val scope = kotlinx.coroutines.MainScope()

    // onAccessibilityEvent can fire several times for the same package before the
    // block screen has a chance to come up, which would stack duplicate launches.
    // A short cooldown per package collapses those into a single block.
    private var lastBlockedPackage: String? = null
    private var lastBlockedAtMillis: Long = 0L

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val packageName = event.packageName?.toString() ?: return

        scope.launch {
            val state = store.observeState().first()
            val now = System.currentTimeMillis()

            // 공부 중에는 허용앱과 통과 대상 외에는 열 수 없다. 통과 대상이면 여기서 끝이다 —
            // 예전에는 이 아래에 이탈 감지 분기가 있어서, 홈 버튼을 누르면 런처가 이탈로
            // 잡혀 차단이 스스로 꺼졌다.
            if (!state.shouldBlock(packageName, passThrough.packages(now), now)) return@launch

            // 쿨다운은 "이번 이벤트를 넘긴다"로 끝난다. 예전에는 여기서 이탈 분기로 흘러내려,
            // 3초 안에 다시 열면 차단이 세션 내내 풀리는 우회 경로가 됐다.
            if (packageName == lastBlockedPackage && now - lastBlockedAtMillis < BLOCK_COOLDOWN_MILLIS) {
                return@launch
            }
            lastBlockedPackage = packageName
            lastBlockedAtMillis = now

            handleExitAction(exitHandler.decide(state.exitMode, state.gracePeriodSeconds))
        }
    }

    private fun handleExitAction(action: ExitAction) {
        when (action) {
            ExitAction.BlockNow -> launchBlockScreen()
            ExitAction.AskConfirmation -> warningManager.showConfirmation(applicationContext)
            is ExitAction.WarnThenBlockAfter -> {
                warningManager.showGraceWarning(applicationContext, action.delaySeconds)
                // If the user taps "지금 나가기" early, WarningActionReceiver sends them
                // home immediately; this delayed job then does the same thing again once
                // the grace period elapses, which is harmless if they're already home.
                scope.launch {
                    delay(action.delaySeconds * 1_000L)
                    goHome()
                }
            }
        }
    }

    private fun launchBlockScreen() {
        val intent = Intent(this, BlockScreenActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        startActivity(intent)
    }

    private fun goHome() {
        val homeIntent = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        startActivity(homeIntent)
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }

    override fun onInterrupt() {}

    companion object {
        private const val BLOCK_COOLDOWN_MILLIS = 3_000L
    }
}
```

- [ ] **Step 9: 테스트를 돌려 전부 통과하는지 확인한다**

```bash
cd android && JAVA_HOME="C:/Users/DELL/.jdks/jbr-21.0.11" ./gradlew :app:testDebugUnitTest --console=plain
```

Expected: `BUILD SUCCESSFUL`. 개수를 확인한다.

```bash
cd android && grep -o 'name="com[^"]*" tests="[0-9]*" skipped="[0-9]*" failures="[0-9]*" errors="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml
```

Expected: `TimerStateTest` 24개, `ExitHandlerTest` 3개, `ExampleUnitTest` 1개, 전부 `failures="0" errors="0"`.

- [ ] **Step 10: 커밋**

```bash
git add android/app/src/main/java/com/studybuddy/app/distraction/TimerState.kt android/app/src/main/java/com/studybuddy/app/distraction/PassThroughPackages.kt android/app/src/main/java/com/studybuddy/app/distraction/TimerStateStore.kt android/app/src/main/java/com/studybuddy/app/distraction/DistractionStopPlugin.kt android/app/src/main/java/com/studybuddy/app/distraction/service/ForegroundAppAccessibilityService.kt android/app/src/test/java/com/studybuddy/app/distraction/TimerStateTest.kt
git commit -m "feat: block everything outside the allow-list while studying"
```

`git rm`한 `BlockedApp.kt`는 이미 스테이징되어 있으므로 따로 add하지 않는다.

---

### Task 2: 설치된 앱 목록 조회

**Files:**
- Create: `android/app/src/main/java/com/studybuddy/app/distraction/InstalledApps.kt`
- Modify: `android/app/src/main/java/com/studybuddy/app/distraction/DistractionStopPlugin.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `src/native/distractionStop.ts`

**Interfaces:**
- Consumes: Task 1의 `PassThroughPackages.packages(nowMillis)`
- Produces:
  - `class InstalledApps(context: Context)` with `fun list(excluded: Set<String>): List<InstalledApp>`, `data class InstalledApp(val packageName: String, val label: String, val iconPng: String)`
  - 플러그인 메서드 `listInstalledApps()` → `{ apps: { packageName, label, iconPng }[] }`
  - TS 인터페이스에 `listInstalledApps(): Promise<{ apps: InstalledAppInfo[] }>`, `clearPendingPause(): Promise<DistractionState>` 선언, `setAppEnabled` 삭제
  - `src/types/distraction.ts`에 `export interface InstalledAppInfo { packageName: string; label: string; iconPng: string }`

- [ ] **Step 1: 매니페스트에 `<queries>`를 선언한다**

`AndroidManifest.xml`의 `</application>` 다음, `<!-- Permissions -->` 앞에 넣는다. `QUERY_ALL_PACKAGES`는 추가하지 않는다 — 플레이스토어 심사 대상 민감 권한이고, 런처 앱만 필요하므로 불필요하다.

```xml
    <!-- 허용앱 선택 화면에 보여줄 "런처에 아이콘이 있는 앱" 목록만 조회한다.
         QUERY_ALL_PACKAGES 없이 이 선언만으로 queryIntentActivities가 동작한다. -->
    <queries>
        <intent>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LAUNCHER" />
        </intent>
    </queries>
```

- [ ] **Step 2: `InstalledApps.kt`를 만든다**

```kotlin
package com.studybuddy.app.distraction

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.util.Base64
import java.io.ByteArrayOutputStream

data class InstalledApp(val packageName: String, val label: String, val iconPng: String)

// 허용앱 선택 화면에 보여줄 목록. 매니페스트의 <queries> 선언 덕분에 QUERY_ALL_PACKAGES 없이
// 런처에 아이콘이 있는 앱만 조회할 수 있고, 학생에게 보여줄 범위도 정확히 그것이다.
class InstalledApps(context: Context) {
    private val appContext = context.applicationContext

    fun list(excluded: Set<String>): List<InstalledApp> {
        val pm = appContext.packageManager
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)

        return pm.queryIntentActivities(intent, 0)
            .asSequence()
            .map { it.activityInfo.packageName }
            .distinct()
            // 통과 대상과 우리 앱은 이미 항상 열리므로 허용앱으로 고를 필요가 없다.
            .filter { it !in excluded }
            .mapNotNull { packageName ->
                runCatching {
                    val info = pm.getApplicationInfo(packageName, 0)
                    InstalledApp(
                        packageName = packageName,
                        label = pm.getApplicationLabel(info).toString(),
                        iconPng = encodeIcon(pm.getApplicationIcon(info))
                    )
                }.getOrNull()
            }
            .sortedBy { it.label }
            .toList()
    }

    // 아이콘 하나가 3~6KB가 되도록 64dp로 줄여 base64 PNG로 싣는다. 앱 80개면 400KB 남짓이고,
    // 화면을 열 때 한 번만 부르므로 한 번의 브리지 왕복으로 감당할 수 있다.
    private fun encodeIcon(drawable: Drawable): String {
        val bitmap = Bitmap.createBitmap(ICON_PX, ICON_PX, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        drawable.setBounds(0, 0, ICON_PX, ICON_PX)
        drawable.draw(canvas)

        val stream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
        bitmap.recycle()
        return Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
    }

    companion object {
        private const val ICON_PX = 64
    }
}
```

`BitmapDrawable` import는 쓰지 않으면 지운다 — 위 구현은 모든 `Drawable`을 캔버스에 그리므로 어댑티브 아이콘도 처리된다.

- [ ] **Step 3: 플러그인에 `listInstalledApps`를 추가한다**

`DistractionStopPlugin.kt`에 추가한다. `installedApps`와 `passThrough`를 `by lazy`로 둔다.

```kotlin
    private val installedApps by lazy { InstalledApps(context) }
    private val passThrough by lazy { PassThroughPackages(context) }

    @PluginMethod
    fun listInstalledApps(call: PluginCall) {
        scope.launch {
            val apps = installedApps.list(excluded = passThrough.packages())
            val array = com.getcapacitor.JSArray()
            apps.forEach { app ->
                array.put(
                    JSObject().apply {
                        put("packageName", app.packageName)
                        put("label", app.label)
                        put("iconPng", app.iconPng)
                    }
                )
            }
            call.resolve(JSObject().apply { put("apps", array) })
        }
    }
```

- [ ] **Step 4: TS 인터페이스를 맞춘다**

`src/types/distraction.ts`에 추가한다.

```ts
export interface InstalledAppInfo {
  packageName: string;
  label: string;
  // base64로 인코딩된 64x64 PNG. data URI 접두사는 붙어 있지 않다.
  iconPng: string;
}
```

`src/native/distractionStop.ts`의 인터페이스에서 아래 줄을 **삭제**한다.

```ts
  setAppEnabled(opts: { app: BlockedAppId; enabled: boolean }): Promise<DistractionState>;
```

그리고 아래 두 줄을 추가한다.

```ts
  clearPendingPause(): Promise<DistractionState>;
  listInstalledApps(): Promise<{ apps: InstalledAppInfo[] }>;
```

import를 맞춘다 — `BlockedAppId`는 더 이상 쓰지 않으므로 지우고 `InstalledAppInfo`를 넣는다.

```ts
import type { DistractionState, ExitModeId, InstalledAppInfo } from '../types/distraction';
```

- [ ] **Step 5: 컴파일과 기존 테스트를 확인한다**

```bash
cd android && JAVA_HOME="C:/Users/DELL/.jdks/jbr-21.0.11" ./gradlew :app:testDebugUnitTest --console=plain
```

Expected: `BUILD SUCCESSFUL`, 실패 0개. `Context`가 필요한 코드라 단위 테스트를 추가하지 않는다 — 동작 확인은 Task 7의 실기기 항목 2번이다.

`npx tsc --noEmit`은 아직 실패한다(`DistractionStop.tsx`가 `enabledApps`와 `BlockedAppId`를 참조). Task 6이 해결한다. 지금은 실패 내용이 그 파일에 한정되는지만 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add android/app/src/main/java/com/studybuddy/app/distraction/InstalledApps.kt android/app/src/main/java/com/studybuddy/app/distraction/DistractionStopPlugin.kt android/app/src/main/AndroidManifest.xml src/native/distractionStop.ts src/types/distraction.ts
git commit -m "feat: list launcher apps with icons for the allow-list picker"
```

---

### Task 3: 차단 시 문구를 공부 중 기준으로 고친다

**Files:**
- Modify: `android/app/src/main/res/layout/activity_block_screen.xml`
- Modify: `android/app/src/main/java/com/studybuddy/app/distraction/notification/WarningNotificationManager.kt`
- Modify: `android/app/src/main/java/com/studybuddy/app/distraction/notification/QuickControlNotificationManager.kt`

**Interfaces:**
- Consumes: Task 1의 `TimerState.isSessionActive(now)`, `isBreakActive(now)`
- Produces: 없음

이 화면들은 이제 쉬는 시간이 끝날 때가 아니라 **공부 중 다른 앱을 열 때** 뜬다. 기본 `exitMode`가 `GRACE_PERIOD`라 대부분의 학생이 지금의 틀린 문구를 본다.

- [ ] **Step 1: 차단 화면 문구를 고친다**

`activity_block_screen.xml`의 `TextView`의 `android:text`를 바꾼다.

```xml
        android:text="공부 중에는 열 수 없어요"
```

- [ ] **Step 2: 경고 알림 문구를 고친다**

`WarningNotificationManager.kt`에서 아래 문자열을 바꾼다. 함수 구조는 건드리지 않는다.

| 현재 | 변경 |
|---|---|
| `"쉬는 시간이 끝났어요"` | `"공부 중이에요"` |
| `"계속 쉴까요?"` | `"5분 쉬고 올까요?"` |
| `"그만 쉬기"` | `"공부 계속하기"` |
| `"쉬는 시간이 곧 끝나요"` | `"공부 중이에요"` |
| `"${delaySeconds}초 후 자동으로 종료됩니다"` | `"${delaySeconds}초 후 자동으로 닫혀요"` |

`"5분 더 쉬기"` 액션 라벨은 `"5분 쉬기"`로 바꾼다. 이 액션은 `extendTimer`를 호출해 쉬는 시간을 시작하므로 차단이 풀리고 집계가 멈춘다 — 라벨과 동작이 일치한다.

알림 채널 이름 `"쉬는 시간 경고"`는 그대로 둔다. 채널 이름은 생성 시점에 고정되어 기존 사용자 기기에서는 바뀌지 않으므로, 코드만 바꾸면 기기별로 달라져 오히려 혼란스럽다.

- [ ] **Step 3: 퀵컨트롤 알림 문구를 허용 목록 모델에 맞게 고친다**

`QuickControlNotificationManager.show`의 `content` 분기를 바꾼다.

```kotlin
        val content = when {
            state.isBreakActive(now) && remainingMinutes != null ->
                "쉬는 시간 ${remainingMinutes}분 남음 — 이 동안은 공부 시간이 쌓이지 않아요"
            studying -> "공부 중 — 허용앱 외에는 열리지 않아요"
            else -> "공부를 시작하면 허용앱 외에는 열리지 않아요"
        }
```

- [ ] **Step 4: 티커 조건을 만료 인식으로 통일한다**

`startObserving`의 `while (true)` 블록에서 원시 `state.sessionActive` 대신 만료를 반영한 판정을 쓴다. 지금은 3시간 만료 후에도 조건이 참이라 알림을 30초마다 영원히 다시 그린다.

```kotlin
        scope.launch {
            while (true) {
                delay(30_000L)
                val state = store.observeState().first()
                // 남은 시간 표시와 세션 만료는 둘 다 시간이 지나면서 저절로 바뀌는 값이라,
                // 상태 변경 이벤트만으로는 알림이 굳는다.
                if (state.endTimeMillis != null || state.isSessionActive(System.currentTimeMillis())) {
                    show(context, state)
                }
            }
        }
```

- [ ] **Step 5: 컴파일과 기존 테스트를 확인한다**

```bash
cd android && JAVA_HOME="C:/Users/DELL/.jdks/jbr-21.0.11" ./gradlew :app:testDebugUnitTest --console=plain
```

Expected: `BUILD SUCCESSFUL`, 실패 0개. 문구와 알림 코드라 단위 테스트를 추가하지 않는다 — 확인은 Task 7의 실기기 항목 4·10번이다.

- [ ] **Step 6: 커밋**

```bash
git add android/app/src/main/res/layout/activity_block_screen.xml android/app/src/main/java/com/studybuddy/app/distraction/notification/WarningNotificationManager.kt android/app/src/main/java/com/studybuddy/app/distraction/notification/QuickControlNotificationManager.kt
git commit -m "fix: word the block screen and warnings for studying, not for breaks"
```

---

### Task 4: 웹 모델 — 상태 배너와 열린 세션 유도

**Files:**
- Modify: `src/types/distraction.ts`
- Modify: `src/screens/distractionStopModel.ts`
- Modify: `src/screens/distractionStopModel.test.ts`
- Create: `src/screens/student/pendingPauseModel.ts`
- Create: `src/screens/student/pendingPauseModel.test.ts`

**Interfaces:**
- Consumes: `DistractionState`, `StudySession`(`src/types/index.ts`: `{ id, plannerItemId, startedAt, endedAt, durationSeconds, deviated }`)
- Produces:
  - `DistractionState`에서 `enabledApps: BlockedAppId[]` **삭제**, `pendingPauseAtMillis: number | null` **추가**. `BlockedAppId` 타입 자체도 삭제
  - `distractionStopModel.ts`: `type DistractionStatus = 'off' | 'break' | 'blocking' | 'noAllowedApps' | 'idle'`, `distractionStatus(state, nowMillis)`, `statusMessage(state, nowMillis)`. `classifySessionStop`과 `SessionStopCause` **삭제**
  - `pendingPauseModel.ts`: `findOpenStudySessionsBefore(studySessions, atMillis)`, `secondsUntil(startedAt, atMillis)`

- [ ] **Step 1: 타입을 고친다**

`src/types/distraction.ts`에서 `BlockedAppId` 선언을 삭제하고 `DistractionState`를 아래로 교체한다. `ExitModeId`와 Task 2에서 추가한 `InstalledAppInfo`는 그대로 둔다.

```ts
export interface DistractionState {
  endTimeMillis: number | null;
  exitMode: ExitModeId;
  gracePeriodSeconds: number;
  featureEnabled: boolean;
  // 학생이 직접 고른, 공부 중에도 열 수 있는 앱들.
  allowedApps: string[];
  // 공부 모드. 차단을 무장시키는 유일한 신호다.
  sessionActive: boolean;
  // sessionActive를 켠 시각. 앱이 강제 종료돼 이 값이 남으면 3시간 뒤 만료로 취급한다.
  sessionStartedAtMillis: number | null;
  // "이 시각 기준으로 학습 시간 집계를 멈춰야 한다"는 표식. 쉬는 시간 시작이 세우고,
  // 웹이 처리한 뒤 clearPendingPause로 지운다.
  pendingPauseAtMillis: number | null;
}
```

- [ ] **Step 2: 실패하는 테스트를 쓴다 — 상태 배너**

`src/screens/distractionStopModel.test.ts`에서 `classifySessionStop` describe 블록을 삭제하고, `BASE` 상수와 `distractionStatus`/`statusMessage` 블록을 아래로 교체한다. `isBreakActive`/`extendedEndTime`/`formatRemaining`/`isSessionActive` 블록은 그대로 둔다.

```ts
const BASE: DistractionState = {
  endTimeMillis: null,
  exitMode: 'IMMEDIATE',
  gracePeriodSeconds: 0,
  featureEnabled: true,
  allowedApps: ['com.spotify.music'],
  sessionActive: false,
  sessionStartedAtMillis: null,
  pendingPauseAtMillis: null,
};

const studying = (startedAt = 0): DistractionState => ({
  ...BASE,
  sessionActive: true,
  sessionStartedAtMillis: startedAt,
});

describe('distractionStatus', () => {
  it('is off when the feature is disabled', () => {
    expect(distractionStatus({ ...studying(0), featureEnabled: false }, 1_000)).toBe('off');
  });

  // 쉬는 시간이 공부 중보다 먼저다 — 지금 차단이 풀려 있다는 사실이 더 급하다.
  it('is break while a break is running, even during study mode', () => {
    expect(distractionStatus({ ...studying(0), endTimeMillis: 60_000 }, 1_000)).toBe('break');
  });

  it('is blocking while studying', () => {
    expect(distractionStatus(studying(0), 1_000)).toBe('blocking');
  });

  // 이미 차단이 걸린 상태에서는 준비 안내보다 지금 벌어지는 일이 급하다.
  it('prefers blocking over the no-allowed-apps hint while studying', () => {
    expect(distractionStatus({ ...studying(0), allowedApps: [] }, 1_000)).toBe('blocking');
  });

  it('is noAllowedApps when not studying and nothing is allowed yet', () => {
    expect(distractionStatus({ ...BASE, allowedApps: [] }, 1_000)).toBe('noAllowedApps');
  });

  it('is idle when not studying but apps are already allowed', () => {
    expect(distractionStatus(BASE, 1_000)).toBe('idle');
  });

  it('is idle once the session has expired', () => {
    expect(distractionStatus(studying(0), SESSION_MAX_MILLIS)).toBe('idle');
  });
});

describe('statusMessage', () => {
  it('says the feature is off', () => {
    expect(statusMessage({ ...BASE, featureEnabled: false }, 1_000)).toBe('딴짓 멈춰가 꺼져 있어요');
  });

  it('shows the remaining break time and that study time is not counting', () => {
    expect(statusMessage({ ...BASE, endTimeMillis: 5 * 60_000 }, 0)).toBe(
      '쉬는 시간 5분 남음 — 이 동안은 공부 시간이 쌓이지 않아요'
    );
  });

  it('says only allowed apps open while studying', () => {
    expect(statusMessage(studying(0), 1_000)).toBe('차단 중 — 허용앱 외에는 열리지 않아요');
  });

  it('nudges the student to pick apps before studying', () => {
    expect(statusMessage({ ...BASE, allowedApps: [] }, 1_000)).toBe(
      '공부 중에 쓸 앱을 미리 골라두세요 — 지금은 전화·시계·설정만 열려요'
    );
  });

  it('explains that studying turns blocking on', () => {
    expect(statusMessage(BASE, 1_000)).toBe('차단 대기 중 — 공부를 시작하면 허용앱 외에는 열리지 않아요');
  });
});
```

- [ ] **Step 3: 실패하는 테스트를 쓴다 — 열린 세션 유도**

`src/screens/student/pendingPauseModel.test.ts`를 만든다.

```ts
import { describe, expect, it } from 'vitest';
import { findOpenStudySessionsBefore, secondsUntil } from './pendingPauseModel';
import type { StudySession } from '../../types';

const session = (over: Partial<StudySession> & { id: string; startedAt: string }): StudySession => ({
  plannerItemId: 'item-1',
  endedAt: null,
  durationSeconds: null,
  deviated: false,
  ...over,
});

describe('findOpenStudySessionsBefore', () => {
  const at = Date.parse('2026-08-27T10:00:00.000Z');

  it('finds a session that is still open', () => {
    const sessions = { 'item-1': [session({ id: 's1', startedAt: '2026-08-27T09:50:00.000Z' })] };
    expect(findOpenStudySessionsBefore(sessions, at)).toEqual([
      { itemId: 'item-1', sessionId: 's1', startedAt: '2026-08-27T09:50:00.000Z' },
    ]);
  });

  it('ignores a session that already has a duration', () => {
    const sessions = {
      'item-1': [session({ id: 's1', startedAt: '2026-08-27T09:50:00.000Z', durationSeconds: 600 })],
    };
    expect(findOpenStudySessionsBefore(sessions, at)).toEqual([]);
  });

  // 표식이 남아 있는 동안 학생이 새로 공부를 시작하면, 그 새 세션은 이 표식이 닫아야 할
  // 대상이 아니다. 닫으면 방금 시작한 공부가 0초로 기록된다.
  it('ignores a session that started after the mark', () => {
    const sessions = { 'item-1': [session({ id: 's2', startedAt: '2026-08-27T10:05:00.000Z' })] };
    expect(findOpenStudySessionsBefore(sessions, at)).toEqual([]);
  });

  it('finds open sessions across several planner items', () => {
    const sessions = {
      'item-1': [session({ id: 's1', startedAt: '2026-08-27T09:50:00.000Z' })],
      'item-2': [session({ id: 's2', plannerItemId: 'item-2', startedAt: '2026-08-27T09:55:00.000Z' })],
    };
    expect(findOpenStudySessionsBefore(sessions, at).map((s) => s.sessionId)).toEqual(['s1', 's2']);
  });

  it('returns nothing when there are no sessions at all', () => {
    expect(findOpenStudySessionsBefore({}, at)).toEqual([]);
  });
});

describe('secondsUntil', () => {
  it('counts the whole seconds up to the mark', () => {
    expect(secondsUntil('2026-08-27T09:50:00.000Z', Date.parse('2026-08-27T10:00:00.000Z'))).toBe(600);
  });

  it('clamps to zero when the mark is earlier than the start', () => {
    expect(secondsUntil('2026-08-27T10:00:00.000Z', Date.parse('2026-08-27T09:50:00.000Z'))).toBe(0);
  });
});
```

- [ ] **Step 4: 두 테스트를 돌려 실패를 확인한다**

```bash
npx vitest run src/screens/distractionStopModel.test.ts src/screens/student/pendingPauseModel.test.ts
```

Expected: FAIL. `pendingPauseModel`을 찾을 수 없고, `distractionStatus`가 `noAllowedApps`를 모른다.

- [ ] **Step 5: `distractionStopModel.ts`를 고친다**

`classifySessionStop`과 `SessionStopCause`를 **삭제**하고, `DistractionStatus`와 두 함수를 아래로 교체한다. `isBreakActive`/`extendedEndTime`/`formatRemaining`/`isSessionActive`/`SESSION_MAX_MILLIS`는 그대로 둔다.

```ts
export type DistractionStatus = 'off' | 'break' | 'blocking' | 'noAllowedApps' | 'idle';

// 위에서 아래로 먼저 맞는 것을 쓴다. 순서가 곧 우선순위다 — 공부 중이면 준비 안내보다
// 지금 벌어지는 일이 급하고, 쉬는 시간이면 차단이 풀렸다는 사실이 그보다 급하다.
export function distractionStatus(state: DistractionState, nowMillis: number): DistractionStatus {
  if (!state.featureEnabled) return 'off';
  if (isBreakActive(state.endTimeMillis, nowMillis)) return 'break';
  if (isSessionActive(state, nowMillis)) return 'blocking';
  if (state.allowedApps.length === 0) return 'noAllowedApps';
  return 'idle';
}

// 화면이 왜 차단이 걸리지 않는지 알려주지 않아서 학생이 "실행이 안 된다"고 느꼈다.
export function statusMessage(state: DistractionState, nowMillis: number): string {
  switch (distractionStatus(state, nowMillis)) {
    case 'off':
      return '딴짓 멈춰가 꺼져 있어요';
    case 'break':
      return `쉬는 시간 ${formatRemaining(state.endTimeMillis, nowMillis) ?? ''} — 이 동안은 공부 시간이 쌓이지 않아요`;
    case 'blocking':
      return '차단 중 — 허용앱 외에는 열리지 않아요';
    case 'noAllowedApps':
      return '공부 중에 쓸 앱을 미리 골라두세요 — 지금은 전화·시계·설정만 열려요';
    case 'idle':
      return '차단 대기 중 — 공부를 시작하면 허용앱 외에는 열리지 않아요';
  }
}
```

`formatRemaining`에 `?? ''`를 붙인 이유: 반환형이 `string | null`이라 그대로 보간하면 문자열 `"null"`이 화면에 나올 수 있다. `break` 분기는 `isBreakActive`로 걸러져 있어 현재는 도달하지 않지만, 두 판정이 나중에 따로 바뀌면 드러난다.

- [ ] **Step 6: `pendingPauseModel.ts`를 만든다**

```ts
import type { StudySession } from '../../types';

export interface OpenStudySession {
  itemId: string;
  sessionId: string;
  startedAt: string;
}

// 열린 학습 세션 = durationSeconds가 아직 없는 행. 표식 시각보다 나중에 시작된 세션은
// 이 표식이 닫아야 할 대상이 아니므로 제외한다 — 표식이 남아 있는 동안 학생이 새로 공부를
// 시작했다면 그 세션은 계속 돌아야 한다.
export function findOpenStudySessionsBefore(
  studySessions: Record<string, StudySession[]>,
  atMillis: number
): OpenStudySession[] {
  const open: OpenStudySession[] = [];
  for (const [itemId, sessions] of Object.entries(studySessions)) {
    for (const session of sessions) {
      if (session.durationSeconds != null) continue;
      if (Date.parse(session.startedAt) > atMillis) continue;
      open.push({ itemId, sessionId: session.id, startedAt: session.startedAt });
    }
  }
  return open;
}

// 표식 시각까지 실제로 공부한 초. 지금 시각이 아니라 표식 시각을 쓰는 것이 요점이다 —
// 웹이 늦게 알아차린 지연이 학습 시간에 더해지면 쉬는 시간이 공부 시간으로 들어간다.
export function secondsUntil(startedAt: string, atMillis: number): number {
  return Math.max(0, Math.floor((atMillis - Date.parse(startedAt)) / 1000));
}
```

- [ ] **Step 7: 두 테스트를 돌려 통과를 확인한다**

```bash
npx vitest run src/screens/distractionStopModel.test.ts src/screens/student/pendingPauseModel.test.ts
```

Expected: PASS. `distractionStopModel.test.ts` 25개, `pendingPauseModel.test.ts` 7개.

- [ ] **Step 8: 커밋**

```bash
git add src/types/distraction.ts src/screens/distractionStopModel.ts src/screens/distractionStopModel.test.ts src/screens/student/pendingPauseModel.ts src/screens/student/pendingPauseModel.test.ts
git commit -m "feat: model the allow-list status banner and open-session lookup"
```

---

### Task 5: 표식 처리를 셸 레벨로 올린다

**Files:**
- Create: `src/screens/student/usePendingStudyPause.ts`
- Modify: `src/App.tsx`
- Modify: `src/screens/student/StudentHome.tsx`

**Interfaces:**
- Consumes: Task 4의 `findOpenStudySessionsBefore`, `secondsUntil`; Task 2의 `clearPendingPause()`; `useDistractionState()`(`src/native/distractionStop.ts`); `useAppState()`(`src/state/AppStateContext.tsx`)의 `state.studySessions`와 `actions.endStudySession(plannerItemId, sessionId, deviated, displayedSeconds?)`
- Produces: `usePendingStudyPause(): void` — 부수효과만 있는 훅

**왜 셸 레벨인가.** `App.tsx`의 `StudentAppShell`은 딴짓멈춰 오버레이가 떠 있을 때 `if (showDistractionStop) return (...)`로 조기 반환해 `StudentHomeScreen`을 언마운트한다. `+5/+10/+30분` 칩이 바로 그 오버레이에 있으므로, 표식을 관측하는 코드가 `StudentHome` 안에 있으면 쉬는 시간을 시작한 순간 관측자가 사라진다. `StudentAppShell` 함수 본문에서 훅을 부르면 어떤 오버레이가 떠 있어도 계속 돈다.

- [ ] **Step 1: `usePendingStudyPause.ts`를 만든다**

```ts
import React from 'react';
import { DistractionStop, isNativePlatform, useDistractionState } from '../../native/distractionStop';
import { useAppState } from '../../state/AppStateContext';
import { findOpenStudySessionsBefore, secondsUntil } from './pendingPauseModel';

// 네이티브가 "이 시각 기준으로 학습 집계를 멈춰라"는 표식을 남기면(쉬는 시간 시작) 열려 있던
// 학습 세션을 그 시각까지로 닫는다. StudentAppShell에서 부르기 때문에 딴짓멈춰 오버레이가
// 떠서 학생 홈이 언마운트돼도 계속 동작한다.
//
// 표식은 상태에 남아 있으므로 앱이 죽었다 살아나도 처리된다. 처리 도중 실패하면 표식이
// 남아 다음 기회에 다시 시도하고, 세션을 닫은 뒤 해제에 실패하면 다음 실행이 열린 세션을
// 찾지 못해 표식만 해제한다 — 중복 종료가 생기지 않는다.
export function usePendingStudyPause(): void {
  const { state: distraction } = useDistractionState();
  const { state, actions } = useAppState();
  const pendingAt = distraction?.pendingPauseAtMillis ?? null;
  const handling = React.useRef(false);

  React.useEffect(() => {
    if (!isNativePlatform() || pendingAt == null) return;
    if (handling.current) return;
    handling.current = true;

    const open = findOpenStudySessionsBefore(state.studySessions, pendingAt);

    void (async () => {
      try {
        for (const { itemId, sessionId, startedAt } of open) {
          await actions.endStudySession(itemId, sessionId, false, secondsUntil(startedAt, pendingAt));
        }
        await DistractionStop.clearPendingPause();
      } finally {
        handling.current = false;
      }
    })();
  }, [pendingAt, state.studySessions, actions]);
}
```

`handling` ref가 필요한 이유: `endStudySession`이 `state.studySessions`를 갱신하므로 이펙트가 다시 돌고, 그러면 같은 세션을 두 번 닫으려 할 수 있다.

- [ ] **Step 2: `App.tsx`의 `StudentAppShell`에서 훅을 부른다**

import를 추가한다.

```ts
import { usePendingStudyPause } from './screens/student/usePendingStudyPause';
```

`StudentAppShell` 본문의 `useOpenDistractionStopRequest(...)` 호출 바로 아래에 넣는다. 조기 반환보다 위여야 한다 — 훅은 모든 렌더에서 같은 순서로 불려야 한다.

```tsx
  // 쉬는 시간이 시작되면 네이티브가 표식을 남긴다. 오버레이가 떠서 학생 홈이 언마운트돼도
  // 처리되어야 하므로 셸에서 부른다.
  usePendingStudyPause();
```

- [ ] **Step 3: `StudentHome.tsx`에서 관측 코드를 삭제한다**

아래를 지운다. `setSessionActive` 호출은 **남긴다** — 공부 모드의 소유자가 여기다.

1. `useDistractionState()`로 얻는 `distraction`과 `nativeSessionActive`, `prevNativeSessionActive`, `selfInitiatedStop` 선언
2. `sessionActive` 하강을 처리하는 `useEffect` 전체
3. `handleStart`의 `selfInitiatedStop.current = false;`
4. `handleStop`의 `selfInitiatedStop.current = true;`와 그 주석

`handleStop`은 아래 형태로 남는다.

```tsx
    actions.endStudySession(itemId, sessionId, false, displayedSeconds);
    if (isNativePlatform()) {
      // 네이티브 호출은 다음 틱으로 미뤄 화면 갱신을 막지 않게 한다.
      setTimeout(() => DistractionStop.setSessionActive({ active: false }), 0);
    }
```

`useDistractionState` import가 이 파일에서 더 이상 쓰이지 않으면 지운다. `DistractionStop`과 `isNativePlatform`은 계속 쓰인다.

- [ ] **Step 4: 타입 검사와 테스트를 돌린다**

```bash
npx tsc --noEmit
```

`DistractionStop.tsx`가 아직 `enabledApps`·`BlockedAppId`·`AllowedAppAdder`를 참조하므로 실패한다. **그 파일에 한정되는지만 확인한다** — Task 6이 해결한다.

```bash
npx vitest run
```

Expected: 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/screens/student/usePendingStudyPause.ts src/App.tsx src/screens/student/StudentHome.tsx
git commit -m "feat: handle the study-pause mark at the shell so overlays cannot skip it"
```

`StudentHome.tsx`에는 이 계획과 무관한 미커밋 리디자인 작업도 함께 들어 있다. 이 태스크는 그 파일에서 **삭제만** 하므로, 커밋하면 리디자인 작업분도 함께 들어간다. **그것이 의도다** — 이 태스크의 삭제와 리디자인을 분리하려면 hunk 단위 스테이징이 필요하고, 같은 함수 안이라 위험하다. 커밋 메시지 본문에 그 사실을 한 줄로 적는다.

```
Note: StudentHome.tsx also carries in-progress student-home-redesign work
that could not be separated from this deletion by file.
```

---

### Task 6: 허용앱 선택 화면과 딴짓멈춰 화면 개편

**Files:**
- Create: `src/screens/AllowedAppsScreen.tsx`
- Modify: `src/screens/DistractionStop.tsx`

**Interfaces:**
- Consumes: Task 2의 `DistractionStop.listInstalledApps()`, `InstalledAppInfo`; Task 4의 `statusMessage`, `distractionStatus`; 기존 `DistractionStop.setAllowedApps({ apps })`, `setSessionActive({ active })`
- Produces: `AllowedAppsScreen({ allowedApps, onChange, onClose })`

`src/primitives.tsx`에서 쓸 수 있는 것: `BackBar`, `Card`, `Button`, `ChipGroup`, `ToggleSwitch`, `SectionTitle`, `Icon`, `TextField`. `Card`는 `{ children, className, tint }`를 받는다.

- [ ] **Step 1: `AllowedAppsScreen.tsx`를 만든다**

```tsx
import React from 'react';
import { BackBar, Card, Icon, TextField, ToggleSwitch } from '../primitives';
import { DistractionStop } from '../native/distractionStop';
import type { InstalledAppInfo } from '../types/distraction';

// 허용앱 선택. 목록은 화면을 열 때 한 번만 불러온다 — 아이콘까지 실려 오므로 앱 80개면
// 400KB 남짓이고, 매 렌더마다 부를 값이 아니다.
export default function AllowedAppsScreen({
  allowedApps,
  onChange,
  onClose,
}: {
  allowedApps: string[];
  onChange: (apps: string[]) => void;
  onClose: () => void;
}) {
  const [apps, setApps] = React.useState<InstalledAppInfo[] | null>(null);
  const [query, setQuery] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    DistractionStop.listInstalledApps()
      .then((r) => !cancelled && setApps(r.apps))
      .catch(() => !cancelled && setApps([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (packageName: string, enabled: boolean) => {
    onChange(enabled ? [...allowedApps, packageName] : allowedApps.filter((p) => p !== packageName));
  };

  // 이미 허용된 앱을 위로 모아 지금 상태가 바로 보이게 한다. 그 안에서는 이름 순서를 유지한다.
  const visible = React.useMemo(() => {
    if (!apps) return [];
    const trimmed = query.trim().toLowerCase();
    const matched = trimmed ? apps.filter((a) => a.label.toLowerCase().includes(trimmed)) : apps;
    const allowed = new Set(allowedApps);
    return [...matched].sort((a, b) => {
      const aAllowed = allowed.has(a.packageName) ? 0 : 1;
      const bAllowed = allowed.has(b.packageName) ? 0 : 1;
      return aAllowed - bAllowed;
    });
  }, [apps, query, allowedApps]);

  return (
    <div className="px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <BackBar title="허용앱 고르기" onBack={onClose} />
      <div className="pt-2 space-y-4">
        <Card>
          <p className="text-xs text-on-surface-variant">
            공부 중에도 열 수 있는 앱이에요. 전화·시계·설정은 고르지 않아도 항상 열려요.
          </p>
        </Card>

        <TextField value={query} onChange={setQuery} placeholder="앱 이름 검색" />

        {apps === null && <p className="text-center text-sm text-on-surface-variant py-6">불러오는 중...</p>}

        {apps !== null && apps.length === 0 && (
          <Card className="text-center">
            <Icon name="apps" className="!text-[32px] text-on-surface-variant mb-2" />
            <p className="text-sm text-on-surface-variant">설치된 앱을 불러올 수 없어요</p>
          </Card>
        )}

        {apps !== null && apps.length > 0 && visible.length === 0 && (
          <p className="text-center text-sm text-on-surface-variant py-6">검색 결과가 없어요</p>
        )}

        {visible.length > 0 && (
          <Card className="space-y-3">
            {visible.map((app) => (
              <div key={app.packageName} className="flex items-center gap-3">
                <img
                  src={`data:image/png;base64,${app.iconPng}`}
                  alt=""
                  className="w-8 h-8 rounded-lg shrink-0"
                />
                <span className="flex-1 text-sm truncate">{app.label}</span>
                <ToggleSwitch
                  checked={allowedApps.includes(app.packageName)}
                  onChange={(enabled) => toggle(app.packageName, enabled)}
                />
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `DistractionStop.tsx`에서 죽은 UI를 지운다**

아래를 삭제한다.

1. `BLOCKED_APP_OPTIONS` 상수
2. `AllowedAppAdder` 함수 전체
3. `차단할 앱` 섹션(`BLOCKED_APP_OPTIONS.map`으로 `ToggleSwitch`를 그리는 `<div>` 블록) 전체
4. `허용앱 (학습 실행 중 이탈 감지 예외)` 섹션 전체

import에서 `BlockedAppId`를 지운다.

- [ ] **Step 3: 허용앱 진입 버튼과 선택 화면 라우팅을 넣는다**

`DistractionStopScreen`에 상태를 추가한다.

```tsx
  const [showAllowedApps, setShowAllowedApps] = React.useState(false);
```

`if (!isNativePlatform())` 블록과 `if (!state)` 블록 **다음**, 본문 `return` **앞**에 아래를 넣는다. 상태가 없는 동안에는 열 수 없어야 한다.

```tsx
  if (showAllowedApps) {
    return (
      <AllowedAppsScreen
        allowedApps={state.allowedApps}
        onChange={(apps) => {
          setLocal((s) => s && { ...s, allowedApps: apps });
          DistractionStop.setAllowedApps({ apps });
        }}
        onClose={() => setShowAllowedApps(false)}
      />
    );
  }
```

import를 추가한다.

```ts
import AllowedAppsScreen from './AllowedAppsScreen';
```

지운 허용앱 섹션 자리에 진입 버튼을 넣는다.

```tsx
        <div>
          <SectionTitle>허용앱</SectionTitle>
          <Card>
            <button className="w-full flex items-center justify-between" onClick={() => setShowAllowedApps(true)}>
              <span className="text-sm">
                {state.allowedApps.length === 0 ? '아직 고른 앱이 없어요' : `${state.allowedApps.length}개 허용 중`}
              </span>
              <span className="flex items-center gap-1 text-sm text-primary">
                고르기
                <Icon name="chevron_right" className="!text-[18px]" />
              </span>
            </button>
          </Card>
        </div>
```

- [ ] **Step 4: 배너, 탈출구, 라벨을 넣는다**

import를 맞춘다.

```ts
import { distractionStatus, extendedEndTime, formatRemaining, isBreakActive, statusMessage } from './distractionStopModel';
```

토글 카드의 부제를 바꾼다.

```tsx
            <p className="text-xs text-on-surface-variant mt-0.5">공부하는 동안 허용앱 외에는 열리지 않아요</p>
```

토글 `</Card>` 바로 다음, 권한 경고 카드보다 **위에** 상태 배너와 탈출구를 넣는다.

```tsx
        <Card className="text-center space-y-3">
          <p className="text-sm text-on-surface-variant">{statusMessage(state, now)}</p>
          {distractionStatus(state, now) === 'blocking' && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setLocal((s) => s && { ...s, sessionActive: false, sessionStartedAtMillis: null });
                DistractionStop.setSessionActive({ active: false });
              }}
            >
              공부 끝내기
            </Button>
          )}
        </Card>
```

앱을 강제 종료한 뒤 다시 열었을 때, 배너는 `차단 중`이라 말하면서 끌 방법이 없던 상황을 이 버튼이 없앤다.

exitMode 섹션 제목을 바꾼다.

```tsx
          <SectionTitle>공부 중 다른 앱을 열면</SectionTitle>
```

- [ ] **Step 5: 세 관문을 모두 통과시킨다**

```bash
npx tsc --noEmit
```

Expected: 출력 없음. 여기서 처음으로 깨끗해진다 — Task 4가 타입에서 `enabledApps`를 지운 뒤 이 파일만 남아 있었다.

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
git add src/screens/AllowedAppsScreen.tsx src/screens/DistractionStop.tsx
git commit -m "feat: pick allowed apps by icon and name, and end study from the screen"
```

---

### Task 7: APK 빌드와 문서

**Files:**
- Modify: `docs/PRD.md`
- Modify: `dev/active/distraction-stop/distraction-stop-context.md`

실기기 검증(Step 3)은 실제 안드로이드 기기가 필요하므로 사람이 수행한다. 구현자는 Step 1·2·4·5·6만 한다.

- [ ] **Step 1: 웹 자산을 빌드하고 안드로이드로 동기화한다**

```bash
npx vite build && npx cap sync android
```

`cap sync`가 `android/` 아래 추적되는 생성 파일을 바꾸면 커밋하지 말고 어떤 파일이 바뀌었는지 보고한다.

- [ ] **Step 2: 디버그 APK를 빌드한다**

```bash
cd android && JAVA_HOME="C:/Users/DELL/.jdks/jbr-21.0.11" ./gradlew :app:assembleDebug --console=plain
```

산출물: `android/app/build/outputs/apk/debug/app-debug.apk`. 절대경로와 MB 단위 크기를 보고한다.

빌드가 실패하면 덮지 말고 `BLOCKED`으로 실제 gradle 오류를 보고한다.

- [ ] **Step 3: (사람이 수행) 실기기 검증**

구현자는 이 단계를 건너뛴다. 아래는 사람이 확인할 목록이다.

1. 접근성·오버레이 권한 허용
2. 허용앱 화면을 열어 목록이 아이콘과 함께 뜨는지 확인, 음악 앱 하나를 허용
3. 학습 타이머 시작 → 배너 `차단 중 — 허용앱 외에는 열리지 않아요`
4. **홈 버튼을 눌러 홈 화면으로 나간 뒤** 인스타그램 아이콘을 누른다 → 차단된다
5. 4번 직후 3초 안에 인스타그램을 다시 연다 → 또 차단된다
6. 허용한 음악 앱을 연다 → 열린다. 학습 타이머는 계속 돌고 있다
7. 카카오톡을 연다 → 차단된다
8. 전화 앱을 연다 → 열린다. 다른 기기에서 전화를 걸어 수신 화면이 뜨는지도 확인
9. 시계 앱과 설정 앱을 연다 → 열린다
10. 딴짓멈춰에서 `+5분` → 아무 앱이나 열린다 + 학습 타이머가 멈춰 있다 + 쉬는 동안 누적 시간이 늘지 않는다
11. 쉬는 시간이 끝나기를 기다린다 → 다시 시작을 누르지 않아도 카카오톡이 차단된다
12. 딴짓멈춰의 `공부 끝내기` → 카카오톡이 열린다
13. 공부 중 앱 강제 종료 → 카카오톡은 여전히 차단됨 → 앱을 다시 열어 `공부 끝내기`로 해제된다

- [ ] **Step 4: PRD의 §5.11을 교체한다**

`docs/PRD.md`의 `### 5.11 딴짓 멈춰 (안드로이드 전용)` 섹션 본문을 아래로 교체한다. §5.10과 §5.12는 건드리지 않는다.

```markdown
### 5.11 딴짓 멈춰 (안드로이드 전용)
- 학생 앱 우측 하단 원형 버튼(자물쇠 아이콘). 누르면 오버레이로 진입.
- **공부 중에는 허용앱이 아닌 앱에 들어갈 수 없다.** 학습 타이머가 도는 동안 학생이 미리 고른 허용앱과 생활 필수 앱만 열린다. 빠져나오는 길은 세 가지다 — 허용앱을 미리 설정하거나, 쉬는 시간을 쓰거나, `공부 끝내기`를 누른다.
- **생활 필수 앱은 고르지 않아도 항상 열린다**: 전화, 시계·알람, 설정, 홈 화면, 알림창, 키보드. 패키지명을 하드코딩하지 않고 시스템에 조회하므로 기기·제조사가 달라도 따라간다. 전화를 통과시키는 것은 안전 요구사항이다.
- **허용앱 고르기**: 홈 화면에 아이콘이 있는 앱을 아이콘·이름과 함께 목록으로 보여주고 토글로 고른다. 검색으로 걸러낼 수 있고, 이미 허용한 앱이 위로 모인다.
- **쉬는 시간**(+5/+10/+30분)을 시작하면 차단이 풀리고 학습 타이머가 멈춘다. 쉬는 동안에는 학습 시간이 쌓이지 않으므로, 길게 쓰면 그만큼 학습 기록이 비어 매니저 화면에 드러난다 — 사용 한도는 두지 않는다. **쉬는 시간이 끝나면 학생이 아무것도 누르지 않아도 차단이 복귀한다.**
- 공부 중 다른 앱을 열었을 때의 동작(즉시 차단/확인 후 종료/유예시간)을 설정할 수 있다.
- 화면 상단 배너가 지금 차단 중인지, 대기 중인지, 쉬는 시간인지, 허용앱을 아직 고르지 않았는지 알려준다.
- 상단 퀵컨트롤 알림에서 쉬는 시간을 시작하거나 `공부 끝내기`로 차단을 풀 수 있다 — 앱을 열 수 없는 상황의 탈출구. 딴짓멈춰 화면에도 같은 버튼이 있다.
- 학습 세션은 3시간이 지나면 자동 만료된다. 앱이 강제 종료돼 세션이 켜진 채 남아도 차단이 영구히 걸리지 않게 하는 안전장치.
- 설정 앱을 통과시키므로 학생이 접근성 권한을 직접 끌 수 있다. 마음먹으면 앱을 지우면 되므로 완전한 잠금은 애초에 불가능하며, 제품 철학은 "물리적으로 못 하게"가 아니라 "안 하면 티가 난다"다.
- 실제 차단은 네이티브(Kotlin, Capacitor 플러그인)에서 동작 — 웹에서는 설정 UI만 제공. iOS에서는 기능 자체가 노출되지 않음.
```

- [ ] **Step 5: dev docs를 갱신한다**

`dev/active/distraction-stop/distraction-stop-context.md`의 `**Last Updated**` 줄을 `2026-08-27`로 바꾸고, `## 의사결정 로그` 맨 아래에 추가한다.

```markdown
- **허용 목록 전환(2026-08-27)**: 차단할 앱 목록(인스타/유튜브/틱톡)을 버리고 허용 목록으로 뒤집었다 — 공부 중에는 학생이 고른 허용앱과 생활 필수 앱(전화·시계·설정·런처·시스템UI·키보드, 시스템 조회) 외에 열리지 않는다. 그 결과 이탈 감지 기능이 필요 없어져 삭제했고, `sessionActive`를 차단과 이탈 감지가 다투던 구조(홈 버튼만 눌러도 차단이 스스로 꺼지던 버그)가 근본에서 사라졌다. `BlockedApp` enum, `setAppEnabled`, `classifySessionStop`, `selfInitiatedStop` ref도 함께 삭제. 쉬는 시간은 공부 모드를 끄지 않아 끝나면 차단이 자동 복귀한다. 허용앱 선택 UI는 `<queries>` + `queryIntentActivities`로 런처 앱만 조회하므로 `QUERY_ALL_PACKAGES`가 필요 없다. 스펙: `docs/superpowers/specs/2026-08-27-distraction-stop-allowlist-design.md`
```

- [ ] **Step 6: 커밋**

```bash
git add docs/PRD.md dev/active/distraction-stop/distraction-stop-context.md
git commit -m "docs: record allow-list blocking in the PRD and dev context"
```
