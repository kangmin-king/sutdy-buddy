package com.studybuddy.app.distraction.notification

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat

// Heads-up (high-priority) alerts for ExitMode.CONFIRM and ExitMode.GRACE_PERIOD —
// a small popup like a chat message, not a full-screen takeover, so the "warn first"
// flow is actually a warning and not a jump-scare.
class WarningNotificationManager {

    fun showConfirmation(context: Context) {
        ensureChannel(context)
        val continueIntent = actionPendingIntent(context, WarningActionReceiver.ACTION_CONTINUE_BREAK, 1)
        val endIntent = actionPendingIntent(context, WarningActionReceiver.ACTION_END_BREAK, 2)

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("쉬는 시간이 끝났어요")
            .setContentText("계속 쉴까요?")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .addAction(0, "5분 더 쉬기", continueIntent)
            .addAction(0, "그만 쉬기", endIntent)
            .build()

        notify(context, notification)
    }

    fun showGraceWarning(context: Context, delaySeconds: Int) {
        ensureChannel(context)
        val exitNowIntent = actionPendingIntent(context, WarningActionReceiver.ACTION_EXIT_NOW, 3)

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("쉬는 시간이 곧 끝나요")
            .setContentText("${delaySeconds}초 후 자동으로 종료됩니다")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .addAction(0, "지금 나가기", exitNowIntent)
            .build()

        notify(context, notification)
    }

    private fun notify(context: Context, notification: Notification) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, notification)
    }

    private fun actionPendingIntent(context: Context, action: String, requestCode: Int): PendingIntent {
        val intent = Intent(context, WarningActionReceiver::class.java).apply { this.action = action }
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun ensureChannel(context: Context) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CHANNEL_ID) == null) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "쉬는 시간 경고", NotificationManager.IMPORTANCE_HIGH)
            )
        }
    }

    companion object {
        private const val CHANNEL_ID = "break_warning"
        private const val NOTIFICATION_ID = 1002
    }
}
