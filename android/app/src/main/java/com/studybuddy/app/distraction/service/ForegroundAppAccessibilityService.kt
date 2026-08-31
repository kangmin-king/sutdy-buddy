package com.studybuddy.app.distraction.service

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.media.AudioManager
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

        // 통화 중에는 아무것도 하지 않는다. PassThroughPackages의 통화 관련 패키지 목록이
        // 1차 방어지만, 걸려온 전화 화면의 패키지명은 OEM마다 다르고 새 기기에서 또 달라진다.
        // AudioManager.mode는 권한 없이 읽을 수 있고 모든 OEM에서 동일하게 동작해서, 어떤
        // 패키지가 화면에 있든 통화 중이면 차단 자체가 일어나지 않게 한다 — 벨이 울리는 동안
        // goHome()이 수신 화면을 치워버리거나 차단 화면이 응답 UI를 덮는 사고를 막는다.
        // 다만 열려 있던 허용앱 구간은 닫고 나간다. 통화 중에는 아래 구간 기록이 아예 돌지
        // 않으므로, 그냥 빠져나오면 음악을 듣다 전화를 받았을 때 통화가 끝나고 학생이 음악에서
        // 나올 때까지 구간이 열린 채 남고, 통화 시간이 통째로 "허용앱 사용"으로 기록된다.
        if (isCallActive()) {
            scope.launch { store.closeOpenAllowedAppInterval(System.currentTimeMillis()) }
            return
        }

        scope.launch {
            val state = store.observeState().first()
            val now = System.currentTimeMillis()

            // 허용앱 사용 구간 기록. 차단 판정보다 앞에 있어야 하는 이유: 허용앱은 차단되지
            // 않으므로 차단 경로 뒤에 두면 기록될 기회가 없다.
            // 조건은 shouldBlock과 일부러 다르다 — 이유는 shouldRecordAllowedAppUsage 주석에 있다.
            if (state.shouldRecordAllowedAppUsage(now)) {
                store.updateForegroundPackage(packageName, now)
            }

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

    // 조회가 실패하면 false로 떨어져 평소대로 차단한다 — 이 안전장치가 차단 기능 자체를
    // 망가뜨리지는 않게 한다.
    private fun isCallActive(): Boolean = runCatching {
        val audioManager = applicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        when (audioManager.mode) {
            AudioManager.MODE_RINGTONE,
            AudioManager.MODE_IN_CALL,
            AudioManager.MODE_IN_COMMUNICATION -> true
            else -> false
        }
    }.getOrDefault(false)

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
