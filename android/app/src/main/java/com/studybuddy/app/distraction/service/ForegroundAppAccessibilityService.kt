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

            // Study-session allow-list deviation detection: independent of the break-timer
            // blocking logic below. Only flips a flag — no forced navigation — so the web
            // layer notices via the state Flow and stops the timer on its own.
            if (state.sessionActive && packageName != applicationContext.packageName && packageName !in state.allowedApps) {
                store.setSessionActive(false)
                return@launch
            }

            val blockedApp = BlockedApp.fromPackageName(packageName) ?: return@launch
            if (!state.featureEnabled) return@launch
            if (blockedApp !in state.enabledApps) return@launch
            if (state.isBreakActive(System.currentTimeMillis())) return@launch
            // Outside the lockout window (break ended a while ago and nobody re-armed
            // it), stop auto-blocking — the lockout is meant to prevent immediately
            // re-opening a just-blocked app, not to block forever.
            if (!state.isWithinLockout(System.currentTimeMillis())) return@launch

            val now = System.currentTimeMillis()
            val inCooldown = blockedApp.packageName == lastBlockedPackage &&
                now - lastBlockedAtMillis < BLOCK_COOLDOWN_MILLIS
            if (inCooldown) return@launch

            lastBlockedPackage = blockedApp.packageName
            lastBlockedAtMillis = now

            val action = exitHandler.decide(state.exitMode, state.gracePeriodSeconds)
            handleExitAction(action)
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
