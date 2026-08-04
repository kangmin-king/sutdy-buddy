package com.studybuddy.app.distraction.ui

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import com.studybuddy.app.R

// 즉시 차단(ExitMode.IMMEDIATE) 모드에서만 쓰인다 — CONFIRM/GRACE_PERIOD는 전체화면 전환
// 대신 WarningNotificationManager의 알림으로 먼저 물어본 뒤 처리한다.
// Compose 대신 단순 View/XML로 작성해 빌드 의존성을 최소화한다.
class BlockScreenActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_block_screen)
        findViewById<android.widget.Button>(R.id.confirmButton).setOnClickListener { goHome() }
    }

    // 이 화면은 원인이 된 앱 위에 떠 있으므로, 단순 finish()만 하면 그 앱으로 돌아가버린다.
    // 런처(홈)로 보내야 실제로 "차단"이 된다.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
    }

    private fun goHome() {
        val homeIntent = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        startActivity(homeIntent)
        finish()
    }
}
