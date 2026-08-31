package com.studybuddy.app.distraction

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import org.json.JSONArray
import org.json.JSONObject

// TimerRepository(reels-stop)와 동일한 공개 API를 가진 상태 저장소.
// Room 대신 SharedPreferences에 JSON 한 덩어리로 저장한다 — 스칼라/Set 6개뿐인 상태에
// 관계형 DB가 필요 없고, KSP/Room 의존성을 빼면 빌드 실패 지점이 줄어든다.
class TimerStateStore(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences("distraction_stop_state", Context.MODE_PRIVATE)

    private val stateFlow = MutableStateFlow(readFromPrefs())

    fun observeState(): StateFlow<TimerState> = stateFlow

    suspend fun startTimer(durationMillis: Long, nowMillis: Long) {
        save(currentState().withBreakUntil(nowMillis + durationMillis, nowMillis))
    }

    suspend fun extendTimer(extraMillis: Long, nowMillis: Long = System.currentTimeMillis()) {
        val current = currentState()
        save(current.withBreakUntil(current.extendedEndTime(extraMillis, nowMillis), nowMillis))
    }

    suspend fun stopTimer() {
        save(currentState().copy(endTimeMillis = null))
    }

    suspend fun setExitMode(mode: ExitMode) {
        save(currentState().copy(exitMode = mode))
    }

    suspend fun setGracePeriodSeconds(seconds: Int) {
        save(currentState().copy(gracePeriodSeconds = seconds))
    }

    suspend fun setFeatureEnabled(enabled: Boolean) {
        save(currentState().copy(featureEnabled = enabled))
    }

    suspend fun setAllowedApps(apps: Set<String>) {
        save(currentState().copy(allowedApps = apps))
    }

    suspend fun setSessionActive(active: Boolean, nowMillis: Long = System.currentTimeMillis()) {
        val current = currentState()
        save(if (active) current.withSessionStarted(nowMillis) else current.withSessionStopped(nowMillis))
    }

    suspend fun clearPendingPause() {
        save(currentState().withPendingPauseCleared())
    }

    suspend fun updateForegroundPackage(packageName: String, nowMillis: Long = System.currentTimeMillis()) {
        save(currentState().withForegroundPackage(packageName, nowMillis))
    }

    suspend fun clearAllowedAppIntervals(count: Int) {
        save(currentState().withAllowedAppIntervalsCleared(count))
    }

    private suspend fun currentState(): TimerState = observeState().first()

    private fun save(state: TimerState) {
        // 화면 전환마다 updateForegroundPackage가 불리지만 대부분은 상태를 바꾸지 않는다.
        // 같은 값이면 디스크 쓰기도 Flow 방출도 하지 않는다.
        if (state == stateFlow.value) return
        prefs.edit().putString(KEY_STATE, toJson(state)).apply()
        stateFlow.value = state
    }

    private fun readFromPrefs(): TimerState {
        val raw = prefs.getString(KEY_STATE, null) ?: return TimerState.DEFAULT
        return runCatching { fromJson(raw) }.getOrDefault(TimerState.DEFAULT)
    }

    private fun toJson(state: TimerState): String {
        val json = JSONObject()
        json.put("endTimeMillis", state.endTimeMillis ?: JSONObject.NULL)
        json.put("exitMode", state.exitMode.name)
        json.put("gracePeriodSeconds", state.gracePeriodSeconds)
        json.put("featureEnabled", state.featureEnabled)
        json.put("allowedApps", JSONArray(state.allowedApps.toList()))
        json.put("sessionActive", state.sessionActive)
        json.put("sessionStartedAtMillis", state.sessionStartedAtMillis ?: JSONObject.NULL)
        json.put("pendingPauseAtMillis", state.pendingPauseAtMillis ?: JSONObject.NULL)
        json.put("allowedAppEnteredAtMillis", state.allowedAppEnteredAtMillis ?: JSONObject.NULL)
        json.put(
            "allowedAppIntervals",
            JSONArray(
                state.allowedAppIntervals.map { interval ->
                    JSONObject().put("startedAtMillis", interval.startedAtMillis).put("endedAtMillis", interval.endedAtMillis)
                }
            )
        )
        return json.toString()
    }

    private fun fromJson(raw: String): TimerState {
        val json = JSONObject(raw)
        val allowedApps = mutableSetOf<String>()
        if (json.has("allowedApps")) {
            val allowedArray = json.getJSONArray("allowedApps")
            for (i in 0 until allowedArray.length()) {
                allowedApps.add(allowedArray.getString(i))
            }
        }
        // 차단 목록 시절의 키. 이 키가 있다는 것은 허용 목록으로 바꾸기 전 APK가 쓴 JSON이라는
        // 뜻이다. 그때는 sessionActive가 켜져 있어도 "지정한 앱 몇 개만 막는" 상태였지만, 새 APK가
        // 그대로 읽으면 비어 있는 allowedApps 기준으로 전화·런처 말고 전부가 막힌 기기가 된다 —
        // 학생이 앱을 열지도, 공부를 시작하지도 않았는데. 업그레이드 시 한 번만 공부 모드를 끈다.
        val isPreAllowListFormat = json.has("enabledApps")

        val intervals = mutableListOf<AllowedAppInterval>()
        if (json.has("allowedAppIntervals") && !json.isNull("allowedAppIntervals")) {
            val array = json.getJSONArray("allowedAppIntervals")
            for (i in 0 until array.length()) {
                runCatching {
                    val item = array.getJSONObject(i)
                    AllowedAppInterval(item.getLong("startedAtMillis"), item.getLong("endedAtMillis"))
                }.getOrNull()?.let { intervals.add(it) }
            }
        }

        // 아래 두 값은 getInt/getBoolean으로 읽으면 키가 없거나 타입이 다를 때 예외를 던진다.
        // 이 함수 전체가 runCatching + DEFAULT 폴백이라, 그러면 학생이 맞춰둔 설정과 허용앱이
        // 통째로 날아간다. 해당 필드만 기본값으로 떨어지게 한다.
        return TimerState(
            endTimeMillis = if (json.isNull("endTimeMillis")) null else json.getLong("endTimeMillis"),
            exitMode = runCatching { ExitMode.valueOf(json.getString("exitMode")) }
                .getOrDefault(TimerState.DEFAULT.exitMode),
            gracePeriodSeconds = json.optInt("gracePeriodSeconds", TimerState.DEFAULT.gracePeriodSeconds),
            featureEnabled = json.optBoolean("featureEnabled", TimerState.DEFAULT.featureEnabled),
            allowedApps = allowedApps,
            sessionActive = !isPreAllowListFormat && json.optBoolean("sessionActive", false),
            sessionStartedAtMillis = if (isPreAllowListFormat) null else optLongOrNull(json, "sessionStartedAtMillis"),
            pendingPauseAtMillis = optLongOrNull(json, "pendingPauseAtMillis"),
            allowedAppEnteredAtMillis = optLongOrNull(json, "allowedAppEnteredAtMillis"),
            allowedAppIntervals = intervals
        )
    }

    private fun optLongOrNull(json: JSONObject, key: String): Long? =
        if (!json.has(key) || json.isNull(key)) null else json.getLong(key)

    companion object {
        private const val KEY_STATE = "timer_state_json"

        @Volatile
        private var instance: TimerStateStore? = null

        fun getInstance(context: Context): TimerStateStore =
            instance ?: synchronized(this) {
                instance ?: TimerStateStore(context).also { instance = it }
            }
    }
}
