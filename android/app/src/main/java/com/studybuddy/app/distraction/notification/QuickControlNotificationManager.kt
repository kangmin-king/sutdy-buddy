package com.studybuddy.app.distraction.notification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.studybuddy.app.MainActivity
import com.studybuddy.app.distraction.TimerState
import com.studybuddy.app.distraction.TimerStateStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch

// reels-stop 원본은 RemoteViews로 접힌/펼친 뷰를 직접 그렸지만, 여기서는 표준
// NotificationCompat(+ addAction 버튼)만으로 동일한 "알림에서 바로 타이머 조작" 기능을
// 제공한다 — 커스텀 레이아웃 XML 없이 빌드 리스크를 낮추는 선택.
class QuickControlNotificationManager {

    fun startObserving(context: Context, store: TimerStateStore, scope: CoroutineScope) {
        store.observeState()
            .onEach { state -> show(context, state) }
            .launchIn(scope)

        // The Flow above only re-emits when state changes (timer start/extend/stop).
        // Without this ticker, the displayed "N분 남음" freezes at whatever value it had
        // when the timer was last set, even though time keeps passing.
        scope.launch {
            while (true) {
                delay(30_000L)
                val state = store.observeState().first()
                // 남은 시간 표시와 세션 만료는 둘 다 시간이 지나면서 저절로 바뀌는 값이라,
                // 상태 변경 이벤트만으로는 알림이 굳는다.
                if (state.endTimeMillis != null || state.isSessionActive(System.currentTimeMillis())) {
                    show(context, state)
                }
            }
        }
    }

    fun show(context: Context, state: TimerState) {
        ensureChannel(context)

        val now = System.currentTimeMillis()
        val studying = state.isSessionActive(now)
        val remainingMinutes = state.endTimeMillis
            ?.let { endTime -> ((endTime - now).coerceAtLeast(0) + 59_999L) / 60_000L }

        val title = if (state.featureEnabled) "딴짓 멈춰 On" else "딴짓 멈춰 Off"
        val content = when {
            state.isBreakActive(now) && remainingMinutes != null ->
                "쉬는 시간 ${remainingMinutes}분 남음 — 이 동안은 공부 시간이 쌓이지 않아요"
            studying -> "공부 중 — 허용앱 외에는 열리지 않아요"
            else -> "공부를 시작하면 허용앱 외에는 열리지 않아요"
        }

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(title)
            .setContentText(content)
            .setStyle(NotificationCompat.BigTextStyle().bigText(content))
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openAppPendingIntent(context))

        // 안드로이드 알림은 액션 버튼을 보통 3개까지만 보여준다. 세 번째 자리는 공부 중일 때
        // 탈출구(공부 끝내기)로 쓴다 — 앱을 열 수 없는 상황에서도 차단을 풀 수 있어야 한다.
        // 공부 중이 아니면 그 버튼은 할 일이 없으므로 +10분을 둔다.
        builder.addAction(0, "+5분", quickSetPendingIntent(context, 5 * 60_000L))
        builder.addAction(0, "+30분", quickSetPendingIntent(context, 30 * 60_000L))
        if (studying) {
            builder.addAction(0, "공부 끝내기", endSessionPendingIntent(context))
        } else {
            builder.addAction(0, "+10분", quickSetPendingIntent(context, 10 * 60_000L))
        }

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, builder.build())
    }

    private fun endSessionPendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, QuickActionReceiver::class.java).apply {
            action = QuickActionReceiver.ACTION_END_SESSION
        }
        return PendingIntent.getBroadcast(
            context,
            END_SESSION_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    // 알림 본문(버튼 제외)을 탭하면 앱을 열면서 딴짓 멈춰 화면으로 바로 이동시킨다.
    // MainActivity.onNewIntent가 이 extra를 읽어서 DistractionStopPlugin에 신호를 남기고,
    // 웹 쪽(App.tsx)이 그 신호를 확인해 오버레이를 연다.
    private fun openAppPendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_OPEN_DISTRACTION_STOP, true)
        }
        return PendingIntent.getActivity(
            context,
            OPEN_APP_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun quickSetPendingIntent(context: Context, extraMillis: Long): PendingIntent {
        val intent = Intent(context, QuickActionReceiver::class.java).apply {
            action = QuickActionReceiver.ACTION_QUICK_SET
            putExtra(QuickActionReceiver.EXTRA_EXTEND_MILLIS, extraMillis)
        }
        return PendingIntent.getBroadcast(
            context,
            extraMillis.toInt(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun ensureChannel(context: Context) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CHANNEL_ID) == null) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "쉬는 시간 컨트롤", NotificationManager.IMPORTANCE_LOW)
            )
        }
    }

    companion object {
        private const val CHANNEL_ID = "quick_control"
        private const val NOTIFICATION_ID = 1001
        private const val OPEN_APP_REQUEST_CODE = -2
        private const val END_SESSION_REQUEST_CODE = -3
        const val EXTRA_OPEN_DISTRACTION_STOP = "open_distraction_stop"
    }
}
