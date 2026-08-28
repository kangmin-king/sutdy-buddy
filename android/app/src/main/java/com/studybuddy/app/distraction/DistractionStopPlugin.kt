package com.studybuddy.app.distraction

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.studybuddy.app.distraction.notification.QuickControlNotificationManager
import com.studybuddy.app.distraction.service.ForegroundAppAccessibilityService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// React 쪽(src/native/distractionStop.ts)의 유일한 진입점. TimerStateStore를 읽고 쓰며,
// 상태가 바뀔 때마다 notifyListeners로 JS에 실시간 반영한다.
@CapacitorPlugin(name = "DistractionStop")
class DistractionStopPlugin : Plugin() {

    private val store by lazy { TimerStateStore.getInstance(context) }
    private val installedApps by lazy { InstalledApps(context) }
    private val passThrough by lazy { PassThroughPackages(context) }
    private val scope = MainScope()

    override fun load() {
        super.load()
        store.observeState()
            .onEach { state -> notifyListeners("stateChanged", state.toJSObject()) }
            .launchIn(scope)
        // 알림 퀵컨트롤도 앱 로드 시점부터 계속 최신 상태를 반영하도록 관찰 시작
        QuickControlNotificationManager().startObserving(context, store, scope)
    }

    @PluginMethod
    fun getState(call: PluginCall) {
        call.resolve(store.observeState().value.toJSObject())
    }

    @PluginMethod
    fun startTimer(call: PluginCall) {
        val durationMillis = call.getLong("durationMillis") ?: run {
            call.reject("durationMillis is required")
            return
        }
        scope.launch {
            store.startTimer(durationMillis, System.currentTimeMillis())
            call.resolve(store.observeState().value.toJSObject())
        }
    }

    @PluginMethod
    fun extendTimer(call: PluginCall) {
        val extraMillis = call.getLong("extraMillis") ?: run {
            call.reject("extraMillis is required")
            return
        }
        scope.launch {
            store.extendTimer(extraMillis)
            call.resolve(store.observeState().value.toJSObject())
        }
    }

    @PluginMethod
    fun stopTimer(call: PluginCall) {
        scope.launch {
            store.stopTimer()
            call.resolve(store.observeState().value.toJSObject())
        }
    }

    @PluginMethod
    fun setExitMode(call: PluginCall) {
        val modeName = call.getString("mode") ?: run {
            call.reject("mode is required")
            return
        }
        val mode = runCatching { ExitMode.valueOf(modeName) }.getOrNull() ?: run {
            call.reject("invalid mode: $modeName")
            return
        }
        scope.launch {
            store.setExitMode(mode)
            call.resolve(store.observeState().value.toJSObject())
        }
    }

    @PluginMethod
    fun setGracePeriodSeconds(call: PluginCall) {
        val seconds = call.getInt("seconds") ?: run {
            call.reject("seconds is required")
            return
        }
        scope.launch {
            store.setGracePeriodSeconds(seconds)
            call.resolve(store.observeState().value.toJSObject())
        }
    }

    @PluginMethod
    fun setFeatureEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled") ?: run {
            call.reject("enabled is required")
            return
        }
        scope.launch {
            store.setFeatureEnabled(enabled)
            call.resolve(store.observeState().value.toJSObject())
        }
    }

    @PluginMethod
    fun setAllowedApps(call: PluginCall) {
        val apps = call.getArray("apps")?.toList<String>()?.toSet() ?: run {
            call.reject("apps is required")
            return
        }
        scope.launch {
            store.setAllowedApps(apps)
            call.resolve(store.observeState().value.toJSObject())
        }
    }

    @PluginMethod
    fun setSessionActive(call: PluginCall) {
        val active = call.getBoolean("active") ?: run {
            call.reject("active is required")
            return
        }
        scope.launch {
            store.setSessionActive(active)
            call.resolve(store.observeState().value.toJSObject())
        }
    }

    @PluginMethod
    fun isAccessibilityServiceEnabled(call: PluginCall) {
        val enabledServices = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        )
        val expected = "${context.packageName}/${ForegroundAppAccessibilityService::class.java.name}"
        val enabled = enabledServices?.split(":")?.any { it.equals(expected, ignoreCase = true) } ?: false
        val result = JSObject()
        result.put("enabled", enabled)
        call.resolve(result)
    }

    @PluginMethod
    fun isOverlayPermissionGranted(call: PluginCall) {
        val result = JSObject()
        result.put("granted", Settings.canDrawOverlays(context))
        call.resolve(result)
    }

    @PluginMethod
    fun openAccessibilitySettings(call: PluginCall) {
        context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        call.resolve()
    }

    @PluginMethod
    fun openOverlaySettings(call: PluginCall) {
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:${context.packageName}")
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        call.resolve()
    }

    // 상단 알림을 탭해서 앱으로 돌아왔을 때, JS 쪽(App.tsx)이 "딴짓 멈춰 화면을 열어야 하는지"
    // 확인하기 위해 부르는 메서드. 한 번 읽으면 소비되어 다음 호출부터는 false.
    @PluginMethod
    fun consumeOpenRequest(call: PluginCall) {
        val result = JSObject()
        result.put("requested", pendingOpenRequest)
        pendingOpenRequest = false
        call.resolve(result)
    }

    @PluginMethod
    fun clearPendingPause(call: PluginCall) {
        scope.launch {
            store.clearPendingPause()
            call.resolve(store.observeState().value.toJSObject())
        }
    }

    @PluginMethod
    fun clearAllowedAppIntervals(call: PluginCall) {
        scope.launch {
            store.clearAllowedAppIntervals()
            call.resolve(store.observeState().value.toJSObject())
        }
    }

    // 다른 @PluginMethod와 달리 이 메서드는 scope(Main)에서 바로 launch하지 않는다.
    // installedApps.list()는 앱 100~200개 기준으로 PackageManager 조회 + 앱마다 아이콘
    // 비트맵 생성/캔버스 그리기/PNG 압축/base64 인코딩을 한다 — 메인 스레드에서 돌리면
    // 버벅임은 물론 저사양 기기에서는 ANR까지 날 수 있다. Dispatchers.Default로 옮겨서
    // 계산/IO를 백그라운드 스레드 풀에서 처리한다. call.resolve는 어느 스레드에서 불러도
    // 안전하므로 결과를 만든 뒤 그대로 반환한다.
    @PluginMethod
    fun listInstalledApps(call: PluginCall) {
        scope.launch {
            withContext(Dispatchers.Default) {
                val apps = installedApps.list(excluded = passThrough.packages())
                val array = com.getcapacitor.JSArray()
                apps.forEach { app ->
                    array.put(
                        JSObject().apply {
                            put("packageName", app.packageName)
                            put("label", app.label)
                            put("iconPng", app.iconPng)
                        }
                    )
                }
                call.resolve(JSObject().apply { put("apps", array) })
            }
        }
    }

    private fun TimerState.toJSObject(): JSObject {
        val obj = JSObject()
        obj.put("endTimeMillis", endTimeMillis ?: JSObject.NULL)
        obj.put("exitMode", exitMode.name)
        obj.put("gracePeriodSeconds", gracePeriodSeconds)
        obj.put("featureEnabled", featureEnabled)
        obj.put("allowedApps", com.getcapacitor.JSArray(allowedApps.toList()))
        obj.put("sessionActive", sessionActive)
        obj.put("sessionStartedAtMillis", sessionStartedAtMillis ?: JSObject.NULL)
        obj.put("pendingPauseAtMillis", pendingPauseAtMillis ?: JSObject.NULL)
        obj.put("allowedAppEnteredAtMillis", allowedAppEnteredAtMillis ?: JSObject.NULL)
        obj.put(
            "allowedAppIntervals",
            com.getcapacitor.JSArray(
                allowedAppIntervals.map { interval ->
                    JSObject().put("startedAtMillis", interval.startedAtMillis).put("endedAtMillis", interval.endedAtMillis)
                }
            )
        )
        return obj
    }

    companion object {
        // MainActivity가 알림 탭으로 열렸을 때 여기 true를 세팅한다. 프로세스가 살아있는 동안만
        // 유효한 단순 플래그로 충분하다 — 앱이 완전히 죽은 뒤 알림으로 열리면 콜드 스타트라
        // 어차피 JS 쪽도 처음부터 새로 로드되므로 별도 영속 저장은 필요 없다.
        @Volatile
        var pendingOpenRequest = false
    }
}
