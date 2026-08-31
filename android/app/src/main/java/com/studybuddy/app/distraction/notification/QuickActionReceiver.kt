package com.studybuddy.app.distraction.notification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.studybuddy.app.distraction.TimerStateStore
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class QuickActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // goAsync() keeps the receiver alive until the state write and the notification
        // re-render finish; without it the process can be killed mid-coroutine.
        val pendingResult = goAsync()
        val store = TimerStateStore.getInstance(context.applicationContext)
        MainScope().launch {
            try {
                when (intent.action) {
                    ACTION_QUICK_SET -> {
                        val extraMillis = intent.getLongExtra(EXTRA_EXTEND_MILLIS, 0L)
                        if (extraMillis > 0) store.extendTimer(extraMillis)
                    }
                    ACTION_END_SESSION -> store.setSessionActive(false)
                    ACTION_TOGGLE_FEATURE -> {
                        // 현재 값을 읽어 뒤집는다. 알약은 상태를 보여주므로 탭은 항상 반대로
                        // 가는 것이 맞다 — 켜라/꺼라를 인텐트에 담으면 알림이 낡았을 때
                        // 학생이 본 것과 반대로 동작한다.
                        val enabled = store.observeState().first().featureEnabled
                        store.setFeatureEnabled(!enabled)
                    }
                }
                // Re-render directly: the app's UI may not be alive to observe this change,
                // which would leave the notification stale.
                QuickControlNotificationManager().show(context, store.observeState().first())
            } finally {
                pendingResult.finish()
            }
        }
    }

    companion object {
        const val ACTION_QUICK_SET = "com.studybuddy.app.distraction.ACTION_QUICK_SET"
        const val ACTION_END_SESSION = "com.studybuddy.app.distraction.ACTION_END_SESSION"
        const val ACTION_TOGGLE_FEATURE = "com.studybuddy.app.distraction.ACTION_TOGGLE_FEATURE"
        const val EXTRA_EXTEND_MILLIS = "extra_extend_millis"
    }
}
