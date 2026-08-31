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
}
