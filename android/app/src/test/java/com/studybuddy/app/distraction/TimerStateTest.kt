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
