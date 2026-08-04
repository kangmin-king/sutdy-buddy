package com.studybuddy.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.getcapacitor.BridgeActivity
import com.studybuddy.app.distraction.DistractionStopPlugin
import com.studybuddy.app.distraction.notification.QuickControlNotificationManager

class MainActivity : BridgeActivity() {

    // Result is ignored: the quick-control notification is a convenience, and the app
    // stays fully usable when the user declines. Registered as a property so it is
    // created before the Activity reaches STARTED, as the contract API requires.
    private val requestNotificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) {}

    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(DistractionStopPlugin::class.java)
        super.onCreate(savedInstanceState)
        requestNotificationPermissionIfNeeded()
        consumeOpenDistractionStopExtra(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        consumeOpenDistractionStopExtra(intent)
    }

    // 딴짓 멈춰 상단 알림을 탭해서 앱이 열린 경우, 웹 쪽(App.tsx)이 확인할 수 있도록 플래그를
    // 남긴다 — App.tsx는 화면이 다시 보일 때 DistractionStop.consumeOpenRequest()로 이걸 읽는다.
    private fun consumeOpenDistractionStopExtra(intent: Intent) {
        if (intent.getBooleanExtra(QuickControlNotificationManager.EXTRA_OPEN_DISTRACTION_STOP, false)) {
            DistractionStopPlugin.pendingOpenRequest = true
        }
    }

    // POST_NOTIFICATIONS only exists on API 33+; on older releases the notification
    // is granted implicitly and there is nothing to ask for.
    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            requestNotificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}
