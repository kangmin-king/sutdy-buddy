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
