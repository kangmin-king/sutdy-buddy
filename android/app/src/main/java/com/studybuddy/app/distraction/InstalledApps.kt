package com.studybuddy.app.distraction

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.util.Base64
import java.io.ByteArrayOutputStream

data class InstalledApp(val packageName: String, val label: String, val iconPng: String)

// 허용앱 선택 화면에 보여줄 목록. 매니페스트의 <queries> 선언 덕분에 QUERY_ALL_PACKAGES 없이
// 런처에 아이콘이 있는 앱만 조회할 수 있고, 학생에게 보여줄 범위도 정확히 그것이다.
class InstalledApps(context: Context) {
    private val appContext = context.applicationContext

    fun list(excluded: Set<String>): List<InstalledApp> {
        val pm = appContext.packageManager
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)

        return pm.queryIntentActivities(intent, 0)
            .asSequence()
            .map { it.activityInfo.packageName }
            .distinct()
            // 통과 대상과 우리 앱은 이미 항상 열리므로 허용앱으로 고를 필요가 없다.
            .filter { it !in excluded }
            .mapNotNull { packageName ->
                runCatching {
                    val info = pm.getApplicationInfo(packageName, 0)
                    InstalledApp(
                        packageName = packageName,
                        label = pm.getApplicationLabel(info).toString(),
                        iconPng = encodeIcon(pm.getApplicationIcon(info))
                    )
                }.getOrNull()
            }
            .sortedBy { it.label }
            .toList()
    }

    // 아이콘 하나가 3~6KB가 되도록 64dp로 줄여 base64 PNG로 싣는다. 앱 80개면 400KB 남짓이고,
    // 화면을 열 때 한 번만 부르므로 한 번의 브리지 왕복으로 감당할 수 있다.
    private fun encodeIcon(drawable: Drawable): String {
        val bitmap = Bitmap.createBitmap(ICON_PX, ICON_PX, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        drawable.setBounds(0, 0, ICON_PX, ICON_PX)
        drawable.draw(canvas)

        val stream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
        bitmap.recycle()
        return Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
    }

    companion object {
        private const val ICON_PX = 64
    }
}
