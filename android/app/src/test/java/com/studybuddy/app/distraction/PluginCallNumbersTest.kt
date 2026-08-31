package com.studybuddy.app.distraction

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PluginCallNumbersTest {

    // 회귀: Capacitor의 PluginCall.getLong은 값이 정확히 Long일 때만 돌려주고 그 외에는
    // 기본값(null)을 준다. JS가 보낸 300000은 Int 범위라 JSON에서 Integer로 파싱되므로
    // getLong("durationMillis")가 항상 null이었고, startTimer/extendTimer가 매번
    // reject됐다. 앱에서 +5분을 눌러도 네이티브 상태가 안 바뀌고, 알림은 네이티브를
    // 읽으므로 아무 반응이 없었다.
    @Test
    fun `an Integer millis value is read as Long`() {
        assertEquals(300_000L, millisOrNull(300_000))
    }

    @Test
    fun `a Long millis value is read as Long`() {
        assertEquals(300_000L, millisOrNull(300_000L))
    }

    // JS의 Number는 배정밀도 실수다. Capacitor가 소수점 없는 값을 Double로 넘기는 경우도
    // 있어서 함께 받아준다.
    @Test
    fun `a Double millis value is truncated to Long`() {
        assertEquals(300_000L, millisOrNull(300_000.0))
    }

    @Test
    fun `a numeric string is read as Long`() {
        assertEquals(300_000L, millisOrNull("300000"))
    }

    @Test
    fun `a missing value is null`() {
        assertNull(millisOrNull(null))
    }

    @Test
    fun `a non-numeric value is null`() {
        assertNull(millisOrNull("5분"))
    }

    @Test
    fun `a boolean is null`() {
        assertNull(millisOrNull(true))
    }

    // 위 테스트들은 millisOrNull만 검사하므로, 호출부를 call.getLong으로 되돌려도 전부
    // 통과한다. 이 테스트가 그 구멍을 막는다 — Capacitor의 getLong이 왜 못 쓰는지를
    // 그 구현을 그대로 재현해 고정한다. 여기가 실패하면 getLong의 동작이 바뀐 것이므로
    // 그때는 헬퍼를 없앨 수 있는지 다시 판단하면 된다.
    private fun capacitorGetLong(value: Any?): Long? = if (value is Long) value else null

    @Test
    fun `capacitor getLong drops an Integer, which is why the helper exists`() {
        val fromBridge: Any = 300_000                     // JSON이 Int 범위를 Integer로 파싱한다
        assertNull(capacitorGetLong(fromBridge))          // getLong을 쓰면 조용히 null
        assertEquals(300_000L, millisOrNull(fromBridge))  // 헬퍼는 값을 살린다
    }

    // 음수 duration은 이미 지난 endTimeMillis를 만들어 쉬는 시간이 조용히 무효가 된다.
    // 지금은 앱이 5/10/30분만 보내므로 도달하지 않지만, 파싱을 한곳에 모은 이상 여기서 막는다.
    @Test
    fun `a non-positive millis value is null`() {
        assertNull(millisOrNull(0))
        assertNull(millisOrNull(-300_000))
    }
}
