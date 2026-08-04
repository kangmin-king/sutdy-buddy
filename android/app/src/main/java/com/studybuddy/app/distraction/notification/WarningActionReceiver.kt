package com.studybuddy.app.distraction.notification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.studybuddy.app.distraction.TimerStateStore
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch

// Handles taps on the heads-up warning notifications from WarningNotificationManager.
class WarningActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pendingResult = goAsync()
        val store = TimerStateStore.getInstance(context.applicationContext)
        MainScope().launch {
            try {
                when (intent.action) {
                    ACTION_CONTINUE_BREAK -> store.extendTimer(FIVE_MINUTES_MILLIS)
                    ACTION_END_BREAK -> {
                        store.stopTimer()
                        goHome(context)
                    }
                    ACTION_EXIT_NOW -> goHome(context)
                }
            } finally {
                pendingResult.finish()
            }
        }
    }

    private fun goHome(context: Context) {
        val homeIntent = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        context.startActivity(homeIntent)
    }

    companion object {
        const val ACTION_CONTINUE_BREAK = "com.studybuddy.app.distraction.ACTION_CONTINUE_BREAK"
        const val ACTION_END_BREAK = "com.studybuddy.app.distraction.ACTION_END_BREAK"
        const val ACTION_EXIT_NOW = "com.studybuddy.app.distraction.ACTION_EXIT_NOW"
        private const val FIVE_MINUTES_MILLIS = 5 * 60_000L
    }
}
