package com.studybuddy.app.distraction.notification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.studybuddy.app.MainActivity
import com.studybuddy.app.R
import com.studybuddy.app.distraction.TimerState
import com.studybuddy.app.distraction.TimerStateStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch

// 본문은 RemoteViews로 R.layout.notification_quick_control을 그린다 — ON/OFF 알약을
// 놓을 자리가 표준 addAction 템플릿에는 없기 때문이다. DecoratedCustomViewStyle을 쓰므로
// 상단 헤더(앱 아이콘·이름·시간·펼치기)는 여전히 시스템이 그린다.
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

        val content = when {
            state.isBreakActive(now) && remainingMinutes != null ->
                "쉬는 시간 ${remainingMinutes}분 남음 — 이 동안은 공부 시간이 쌓이지 않아요"
            studying -> "공부 중 — 허용앱 외에는 열리지 않아요"
            else -> "공부를 시작하면 허용앱 외에는 열리지 않아요"
        }

        // 본문만 커스텀으로 그린다. DecoratedCustomViewStyle이 상단 헤더(앱 아이콘·이름·
        // 시간·펼치기)를 계속 그려주므로 시스템 테마와 덜 어긋나고 깨질 지점이 적다.
        // 표준 템플릿으로는 본문 오른쪽에 컨트롤을 놓을 자리가 없어 이 방식을 택했다.
        val body = RemoteViews(context.packageName, R.layout.notification_quick_control).apply {
            setTextViewText(R.id.quick_control_status, content)
            if (state.featureEnabled) {
                setTextViewText(R.id.quick_control_pill, "ON")
                setInt(R.id.quick_control_pill, "setBackgroundResource", R.drawable.pill_on)
                setTextColor(R.id.quick_control_pill, ContextCompat.getColor(context, R.color.pill_on_text))
            } else {
                setTextViewText(R.id.quick_control_pill, "OFF")
                setInt(R.id.quick_control_pill, "setBackgroundResource", R.drawable.pill_off)
                setTextColor(R.id.quick_control_pill, ContextCompat.getColor(context, R.color.pill_off_text))
            }
            setOnClickPendingIntent(R.id.quick_control_pill, toggleFeaturePendingIntent(context))
        }

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            // 커스텀 본문을 쓰더라도 접근성 서비스와 알림 목록이 읽을 텍스트는 남겨둔다.
            .setContentTitle(context.getString(R.string.quick_control_title))
            .setContentText(content)
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(body)
            .setCustomBigContentView(body)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openAppPendingIntent(context))

        // 시간 버튼은 순서 그대로 셋. 예전에는 세 번째 자리가 공부 중일 때 '공부 끝내기'로
        // 바뀌었는데, 이제 알약이 항상 눌러지므로 그 탈출구 역할을 알약이 대신한다.
        builder.addAction(0, "+5분", quickSetPendingIntent(context, 5 * 60_000L))
        builder.addAction(0, "+10분", quickSetPendingIntent(context, 10 * 60_000L))
        builder.addAction(0, "+30분", quickSetPendingIntent(context, 30 * 60_000L))

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, builder.build())
    }

    private fun toggleFeaturePendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, QuickActionReceiver::class.java).apply {
            action = QuickActionReceiver.ACTION_TOGGLE_FEATURE
        }
        return PendingIntent.getBroadcast(
            context,
            TOGGLE_FEATURE_REQUEST_CODE,
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
        private const val TOGGLE_FEATURE_REQUEST_CODE = -4
        const val EXTRA_OPEN_DISTRACTION_STOP = "open_distraction_stop"
    }
}
