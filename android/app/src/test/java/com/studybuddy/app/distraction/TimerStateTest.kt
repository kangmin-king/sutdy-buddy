package com.studybuddy.app.distraction

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TimerStateTest {

    @Test
    fun `isBreakActive is true when now is before endTime`() {
        val state = TimerState(
            endTimeMillis = 10_000L,
            exitMode = ExitMode.IMMEDIATE,
            gracePeriodSeconds = 0,
            enabledApps = setOf(BlockedApp.INSTAGRAM),
            lockoutDurationMillis = 0L,
            featureEnabled = true
        )
        assertTrue(state.isBreakActive(nowMillis = 5_000L))
    }

    @Test
    fun `isBreakActive is false when now is at or after endTime`() {
        val state = TimerState(
            endTimeMillis = 10_000L,
            exitMode = ExitMode.IMMEDIATE,
            gracePeriodSeconds = 0,
            enabledApps = setOf(BlockedApp.INSTAGRAM),
            lockoutDurationMillis = 0L,
            featureEnabled = true
        )
        assertFalse(state.isBreakActive(nowMillis = 10_000L))
    }

    @Test
    fun `isBreakActive is false when endTimeMillis is null`() {
        val state = TimerState(
            endTimeMillis = null,
            exitMode = ExitMode.IMMEDIATE,
            gracePeriodSeconds = 0,
            enabledApps = setOf(BlockedApp.INSTAGRAM),
            lockoutDurationMillis = 0L,
            featureEnabled = true
        )
        assertFalse(state.isBreakActive(nowMillis = 5_000L))
    }

    @Test
    fun `isWithinLockout is true during the break itself`() {
        val state = TimerState(
            endTimeMillis = 10_000L,
            exitMode = ExitMode.IMMEDIATE,
            gracePeriodSeconds = 0,
            enabledApps = setOf(BlockedApp.INSTAGRAM),
            lockoutDurationMillis = 5_000L,
            featureEnabled = true
        )
        assertTrue(state.isWithinLockout(nowMillis = 5_000L))
    }

    @Test
    fun `isWithinLockout is true just after the break ends, within the lockout window`() {
        val state = TimerState(
            endTimeMillis = 10_000L,
            exitMode = ExitMode.IMMEDIATE,
            gracePeriodSeconds = 0,
            enabledApps = setOf(BlockedApp.INSTAGRAM),
            lockoutDurationMillis = 5_000L,
            featureEnabled = true
        )
        assertTrue(state.isWithinLockout(nowMillis = 14_000L))
    }

    @Test
    fun `isWithinLockout is false once the lockout window has elapsed`() {
        val state = TimerState(
            endTimeMillis = 10_000L,
            exitMode = ExitMode.IMMEDIATE,
            gracePeriodSeconds = 0,
            enabledApps = setOf(BlockedApp.INSTAGRAM),
            lockoutDurationMillis = 5_000L,
            featureEnabled = true
        )
        assertFalse(state.isWithinLockout(nowMillis = 15_000L))
    }

    @Test
    fun `isWithinLockout is false when endTimeMillis is null`() {
        val state = TimerState(
            endTimeMillis = null,
            exitMode = ExitMode.IMMEDIATE,
            gracePeriodSeconds = 0,
            enabledApps = setOf(BlockedApp.INSTAGRAM),
            lockoutDurationMillis = 5_000L,
            featureEnabled = true
        )
        assertFalse(state.isWithinLockout(nowMillis = 5_000L))
    }

    @Test
    fun `DEFAULT has no allowed apps and inactive session`() {
        assertEquals(emptySet<String>(), TimerState.DEFAULT.allowedApps)
        assertEquals(false, TimerState.DEFAULT.sessionActive)
    }
}
