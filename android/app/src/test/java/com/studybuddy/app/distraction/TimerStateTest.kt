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

    // 회귀: 어떤 이유로든 처리되지 않고 남은 표식은 withBreakUntil의 "덮어쓰지 않는다" 규칙
    // 때문에 다음 쉬는 시간의 표식을 통째로 막아, 그 쉬는 시간이 학습 시간으로 들어간다.
    @Test
    fun `withSessionStarted drops a stale pending pause from the previous session`() {
        val stale = studying(1_000L).withBreakUntil(endTimeMillis = 60_000L, nowMillis = 2_000L)
        assertEquals(2_000L, stale.pendingPauseAtMillis)

        val restarted = stale.withSessionStarted(nowMillis = 500_000L)
        assertNull(restarted.pendingPauseAtMillis)

        // 그래서 새 세션의 첫 쉬는 시간이 다시 표식을 세울 수 있다.
        val nextBreak = restarted.withBreakUntil(endTimeMillis = 600_000L, nowMillis = 560_000L)
        assertEquals(560_000L, nextBreak.pendingPauseAtMillis)
    }

    @Test
    fun `withSessionStopped drops a stale pending pause`() {
        val stale = studying(1_000L).withBreakUntil(endTimeMillis = 60_000L, nowMillis = 2_000L)
        assertNull(stale.withSessionStopped().pendingPauseAtMillis)
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

    // PRD가 약속하는 "공부 중에는 허용앱이 아닌 앱에 들어갈 수 없다"를 실제로 지키는 것은
    // IMMEDIATE뿐이다. GRACE_PERIOD는 10초 뒤 홈으로 보내는데 그때는 3초 쿨다운이 끝나 바로
    // 다시 들어갈 수 있고, CONFIRM은 알림만 띄운다.
    @Test
    fun `DEFAULT blocks immediately`() {
        assertEquals(ExitMode.IMMEDIATE, TimerState.DEFAULT.exitMode)
    }
}
