package com.studybuddy.app.distraction

import android.content.Context
import android.content.Intent
import android.provider.AlarmClock
import android.provider.Settings
import android.telecom.TelecomManager

// 공부 중에도 통과시켜야 하는 패키지를 시스템에 조회한다. 하드코딩하지 않는 이유는 런처와
// 키보드와 전화 앱이 기기·학생마다 다르기 때문이다.
//
// 전화를 통과시키는 것은 안전 요구사항이다 — 공부 중이라는 이유로 전화를 받거나 걸지 못하면
// 안 된다. 시계·알람은 알람을 못 듣거나 다시 못 맞추는 상황을 막는다. 설정은 통과시킨다:
// 마음먹은 학생은 앱을 지우면 되므로 완전한 잠금은 애초에 불가능하고, 제품 철학은 "물리적으로
// 못 하게"가 아니라 "안 하면 티가 난다"다.
class PassThroughPackages(context: Context) {
    private val appContext = context.applicationContext

    private var cached: Set<String>? = null
    private var cachedAtMillis = 0L

    fun packages(nowMillis: Long = System.currentTimeMillis()): Set<String> {
        val current = cached
        if (current != null && nowMillis - cachedAtMillis < CACHE_TTL_MILLIS) return current

        val resolved = buildSet {
            add(appContext.packageName)
            add(SYSTEM_UI_PACKAGE)
            resolvePackage(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME))?.let { add(it) }
            resolvePackage(Intent(AlarmClock.ACTION_SHOW_ALARMS))?.let { add(it) }
            resolvePackage(Intent(Settings.ACTION_SETTINGS))?.let { add(it) }
            defaultDialerPackage()?.let { add(it) }
            currentInputMethodPackage()?.let { add(it) }
        }

        cached = resolved
        cachedAtMillis = nowMillis
        return resolved
    }

    private fun resolvePackage(intent: Intent): String? = runCatching {
        appContext.packageManager
            .resolveActivity(intent, android.content.pm.PackageManager.MATCH_DEFAULT_ONLY)
            ?.activityInfo
            ?.packageName
    }.getOrNull()

    private fun defaultDialerPackage(): String? = runCatching {
        (appContext.getSystemService(Context.TELECOM_SERVICE) as TelecomManager).defaultDialerPackage
    }.getOrNull()

    // DEFAULT_INPUT_METHOD는 "패키지명/서비스명" 형식이다.
    private fun currentInputMethodPackage(): String? = runCatching {
        Settings.Secure.getString(appContext.contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD)
            ?.substringBefore('/')
            ?.takeIf { it.isNotBlank() }
    }.getOrNull()

    companion object {
        private const val SYSTEM_UI_PACKAGE = "com.android.systemui"

        // 기본 런처·키보드·전화 앱은 학생이 바꿀 수 있으므로 영구 캐시는 안 되고,
        // 매 이벤트마다 조회하는 것도 낭비다.
        private const val CACHE_TTL_MILLIS = 60_000L
    }
}
