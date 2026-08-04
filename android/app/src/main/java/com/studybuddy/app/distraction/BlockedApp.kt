package com.studybuddy.app.distraction

enum class BlockedApp(val packageName: String) {
    INSTAGRAM("com.instagram.android"),
    YOUTUBE("com.google.android.youtube"),
    TIKTOK("com.zhiliaoapp.musically");

    companion object {
        fun fromPackageName(packageName: String): BlockedApp? =
            entries.firstOrNull { it.packageName == packageName }
    }
}
