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
    val pendingPauseAtMillis: Long? = null,
    // 아직 진행 중인 허용앱 구간의 시작 시각. 허용앱에 들어간 순간 세우고 나오는 순간 지운다.
    val allowedAppEnteredAtMillis: Long? = null,
    // 닫힌 구간들. 웹이 서버로 보낸 뒤 비운다. 이벤트가 아니라 상태인 이유는
    // pendingPauseAtMillis와 같다 — 학생이 허용앱을 쓰는 동안 우리 앱은 백그라운드다.
    val allowedAppIntervals: List<AllowedAppInterval> = emptyList()
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

    // 세션 경계에서는 표식도 함께 지운다. 어떤 이유로든 처리되지 않고 남은 표식은 withBreakUntil의
    // "덮어쓰지 않는다" 규칙 때문에 다음 쉬는 시간의 표식을 통째로 막아버려, 그 쉬는 시간이
    // 고스란히 학습 시간으로 들어간다. 세션이 새로 시작하거나 끝나면 이전 표식은 더 이상
    // 처리할 대상이 없으므로 버리는 것이 맞다.
    fun withSessionStarted(nowMillis: Long): TimerState =
        copy(
            sessionActive = true,
            sessionStartedAtMillis = nowMillis,
            endTimeMillis = null,
            pendingPauseAtMillis = null,
            allowedAppEnteredAtMillis = null
        )

    fun withSessionStopped(nowMillis: Long): TimerState =
        closeOpenAllowedAppInterval(nowMillis)
            .copy(sessionActive = false, sessionStartedAtMillis = null, pendingPauseAtMillis = null)

    // 쉬는 시간은 endTimeMillis만 세우고 공부 모드는 그대로 둔다. 공부 중이었다면 집계를
    // 멈추라는 표식을 남기되, 이미 처리 안 된 표식이 있으면 덮어쓰지 않는다 — 첫 표식 시각이
    // 실제로 공부를 멈춘 순간이고, 덮어쓰면 그만큼 쉬는 시간이 학습 시간으로 들어간다.
    fun withBreakUntil(endTimeMillis: Long, nowMillis: Long): TimerState {
        val next = closeOpenAllowedAppInterval(nowMillis).copy(endTimeMillis = endTimeMillis)
        return if (sessionActive && pendingPauseAtMillis == null) {
            next.copy(pendingPauseAtMillis = nowMillis)
        } else {
            next
        }
    }

    fun withPendingPauseCleared(): TimerState = copy(pendingPauseAtMillis = null)

    // 화면 전환마다 불린다. 허용앱이면 구간을 열고(이미 열려 있으면 그대로), 아니면 열린
    // 구간을 닫는다. 자동 통과 앱(전화·시계·설정 등)은 allowedApps에 없으므로 여기서
    // 구간을 닫는 쪽으로 처리된다 — 전화를 받은 것을 딴짓으로 세면 안 된다.
    fun withForegroundPackage(packageName: String, nowMillis: Long): TimerState =
        if (packageName in allowedApps) {
            if (allowedAppEnteredAtMillis != null) this else copy(allowedAppEnteredAtMillis = nowMillis)
        } else {
            closeOpenAllowedAppInterval(nowMillis)
        }

    fun withAllowedAppIntervalsCleared(): TimerState = copy(allowedAppIntervals = emptyList())

    // 학습 세션이 3시간에 만료되므로 정직한 구간이 그보다 길 수 없다. 상한을 두면 기기
    // 시각이 앞으로 당겨진 경우도 함께 막힌다.
    private fun closeOpenAllowedAppInterval(nowMillis: Long): TimerState {
        val startedAt = allowedAppEnteredAtMillis ?: return this
        val endedAt = minOf(nowMillis, startedAt + SESSION_MAX_MILLIS)
        return copy(
            allowedAppEnteredAtMillis = null,
            allowedAppIntervals = allowedAppIntervals + AllowedAppInterval(startedAt, endedAt)
        )
    }

    companion object {
        // 한 항목을 3시간 연속 공부하는 경우는 사실상 없다. 넘으면 방치된 세션으로 보고 차단을
        // 푼다 — 학생이 화면에서 다시 시작을 누르면 시작 시각이 갱신된다.
        const val SESSION_MAX_MILLIS = 3 * 60 * 60 * 1000L

        // 기본값이 IMMEDIATE인 이유: PRD가 약속하는 "공부 중에는 허용앱이 아닌 앱에 들어갈 수
        // 없다"를 실제로 지키는 것은 IMMEDIATE뿐이다. GRACE_PERIOD는 10초를 준 뒤 홈으로
        // 보내는데 그때는 3초 쿨다운이 이미 끝나 바로 다시 들어갈 수 있고, CONFIRM은 알림만
        // 띄운다. 둘 다 학생이 고를 수 있는 선택지로 그대로 남는다.
        // 이 값은 새로 설치한 기기에만 적용된다 — 이미 쓰던 학생의 exitMode는 JSON에서 읽는다.
        val DEFAULT = TimerState(
            endTimeMillis = null,
            exitMode = ExitMode.IMMEDIATE,
            gracePeriodSeconds = 10,
            featureEnabled = true,
            allowedApps = emptySet(),
            sessionActive = false,
            sessionStartedAtMillis = null,
            pendingPauseAtMillis = null,
            allowedAppEnteredAtMillis = null,
            allowedAppIntervals = emptyList()
        )
    }
}
