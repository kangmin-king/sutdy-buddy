package com.studybuddy.app.distraction.service

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.view.accessibility.AccessibilityEvent
import com.studybuddy.app.distraction.BlockedApp
import com.studybuddy.app.distraction.ExitAction
import com.studybuddy.app.distraction.ExitHandler
import com.studybuddy.app.distraction.TimerStateStore
import com.studybuddy.app.distraction.notification.WarningNotificationManager
import com.studybuddy.app.distraction.ui.BlockScreenActivity
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class ForegroundAppAccessibilityService : AccessibilityService() {

    private val store by lazy { TimerStateStore.getInstance(applicationContext) }
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
