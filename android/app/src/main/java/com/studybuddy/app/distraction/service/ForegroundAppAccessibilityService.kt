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
