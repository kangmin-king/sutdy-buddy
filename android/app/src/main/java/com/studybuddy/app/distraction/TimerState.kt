package com.studybuddy.app.distraction

data class TimerState(
    val endTimeMillis: Long?,
    val exitMode: ExitMode,
    val gracePeriodSeconds: Int,
    val enabledApps: Set<BlockedApp>,
    val lockoutDurationMillis: Long,
    val featureEnabled: Boolean,
    val allowedApps: Set<String> = emptySet(),
    val sessionActive: Boolean = false
) {
    fun isBreakActive(nowMillis: Long): Boolean =
        endTimeMillis != null && nowMillis < endTimeMillis

    // 쉬는 시간 종료 직후에도 lockoutDurationMillis 동안은 계속 차단 대상으로 본다 —
    // 타이머가 끝나자마자 바로 다시 여는 것을 막기 위한 유예 없는 재차단 창구.
    fun isWithinLockout(nowMillis: Long): Boolean =
        endTimeMillis != null && nowMillis < endTimeMillis + lockoutDurationMillis

    companion object {
        val DEFAULT = TimerState(
            endTimeMillis = null,
            exitMode = ExitMode.GRACE_PERIOD,
            gracePeriodSeconds = 10,
            enabledApps = setOf(BlockedApp.INSTAGRAM, BlockedApp.YOUTUBE, BlockedApp.TIKTOK),
            lockoutDurationMillis = 10 * 60_000L,
            featureEnabled = true,
            allowedApps = emptySet(),
            sessionActive = false
        )
    }
}
