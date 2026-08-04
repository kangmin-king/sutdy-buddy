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
        val current = currentState()
        save(current.copy(endTimeMillis = nowMillis + durationMillis))
    }

    suspend fun startTimerUntil(endTimeMillis: Long) {
        save(currentState().copy(endTimeMillis = endTimeMillis))
    }

    suspend fun extendTimer(extraMillis: Long, nowMillis: Long = System.currentTimeMillis()) {
        val current = currentState()
        val base = current.endTimeMillis ?: nowMillis
        save(current.copy(endTimeMillis = base + extraMillis))
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

    suspend fun setLockoutDurationMillis(durationMillis: Long) {
        save(currentState().copy(lockoutDurationMillis = durationMillis))
    }

    suspend fun setAppEnabled(app: BlockedApp, enabled: Boolean) {
        val current = currentState()
        val updated = if (enabled) current.enabledApps + app else current.enabledApps - app
        save(current.copy(enabledApps = updated))
    }

    suspend fun setFeatureEnabled(enabled: Boolean) {
        save(currentState().copy(featureEnabled = enabled))
    }

    private suspend fun currentState(): TimerState = observeState().first()

    private fun save(state: TimerState) {
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
        json.put("enabledApps", JSONArray(state.enabledApps.map { it.name }))
        json.put("lockoutDurationMillis", state.lockoutDurationMillis)
        json.put("featureEnabled", state.featureEnabled)
        return json.toString()
    }

    private fun fromJson(raw: String): TimerState {
        val json = JSONObject(raw)
        val appsArray = json.getJSONArray("enabledApps")
        val apps = mutableSetOf<BlockedApp>()
        for (i in 0 until appsArray.length()) {
            runCatching { BlockedApp.valueOf(appsArray.getString(i)) }.getOrNull()?.let { apps.add(it) }
        }
        return TimerState(
            endTimeMillis = if (json.isNull("endTimeMillis")) null else json.getLong("endTimeMillis"),
            exitMode = runCatching { ExitMode.valueOf(json.getString("exitMode")) }.getOrDefault(ExitMode.GRACE_PERIOD),
            gracePeriodSeconds = json.getInt("gracePeriodSeconds"),
            enabledApps = apps,
            lockoutDurationMillis = json.getLong("lockoutDurationMillis"),
            featureEnabled = json.getBoolean("featureEnabled")
        )
    }

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
