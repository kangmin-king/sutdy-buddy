package com.studybuddy.app.distraction

// Capacitor의 PluginCall.getLong은 값이 정확히 Long일 때만 돌려주고, 그 외에는 조용히
// 기본값을 준다(`if (value is Long) ... else defaultValue`). JS가 보낸 밀리초는 Int 범위면
// JSON에서 Integer로 파싱되므로 getLong("durationMillis")는 300000에 대해 항상 null이었다.
// 그래서 startTimer/extendTimer가 매번 reject되고, 앱에서 쉬는 시간을 눌러도 네이티브
// 상태가 바뀌지 않았다 — 알림은 네이티브를 읽으니 아무 반응이 없었다.
//
// 브리지를 건너온 숫자는 Integer/Long/Double 중 무엇으로도 올 수 있으므로 Number로 받아
// 직접 변환한다. 순수 함수로 둔 이유는 이것만 단위 테스트할 수 있기 때문이다 — PluginCall과
// JSONObject는 로컬 단위 테스트에서 쓸 수 없다.
fun millisOrNull(value: Any?): Long? {
    val millis = when (value) {
        is Number -> value.toLong()
        is String -> value.toLongOrNull()
        else -> null
    } ?: return null
    // 0 이하는 거른다. 음수 duration은 이미 지난 endTimeMillis를 만들어 쉬는 시간이 조용히
    // 무효가 되는데, 화면은 낙관적 업데이트 때문에 정상처럼 보인다 — 이 버그와 같은 모양이다.
    return millis.takeIf { it > 0 }
}
