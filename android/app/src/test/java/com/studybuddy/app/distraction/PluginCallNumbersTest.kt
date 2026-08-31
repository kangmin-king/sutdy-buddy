package com.studybuddy.app.distraction

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

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
    // 통과한다 — 이 테스트도 마찬가지다. 이 함수는 그 구멍을 막지 *않는다*; Capacitor의
    // getLong이 왜 못 쓰는지를 그 구현을 그대로 재현해서 문서로 남겨둘 뿐이다. 실제로
    // 호출부가 되돌아가는 것을 막는 가드는 아래
    // `DistractionStopPlugin routes every numeric PluginCall read through millisOrNull`이다.
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

    // 위 테스트들은 모두 millisOrNull 자체만 검사한다 — DistractionStopPlugin의 호출부가
    // call.getLong/call.getInt로 되돌아가도 전부 그대로 통과한다. 이 프로젝트에는
    // Robolectric도 계측 테스트 하네스도 없어서 실제 PluginCall을 만들어 플러그인
    // 메서드를 호출하는 테스트는 쓸 수 없다. 대신 플러그인의 실제 소스를 읽어서, 숫자를
    // 읽는 자리가 여전히 millisOrNull을 거치는지 문자열로 확인한다 — 투박하지만
    // 호출부가 되돌아가면 실제로 실패한다.
    @Test
    fun `DistractionStopPlugin routes every numeric PluginCall read through millisOrNull`() {
        val pluginSource = readDistractionStopPluginSource()

        val rawNumericReads = Regex("""call\.getLong\(|call\.getInt\(""").findAll(pluginSource).map { it.value }.toList()
        assertTrue(
            "DistractionStopPlugin.kt must not read numeric PluginCall values with " +
                "call.getLong(/call.getInt( — found: $rawNumericReads. Use " +
                "millisOrNull(call.data.opt(...)) instead (see PluginCallNumbers.kt) so an " +
                "Integer-valued field from the JS bridge isn't silently dropped.",
            rawNumericReads.isEmpty()
        )

        val millisOrNullReads = Regex("""millisOrNull\(call\.data\.opt\(""").findAll(pluginSource).count()
        assertTrue(
            "Expected DistractionStopPlugin.kt's four numeric PluginCall reads " +
                "(durationMillis, extraMillis, seconds, count) to go through " +
                "millisOrNull(call.data.opt(...)), but found only $millisOrNullReads " +
                "occurrence(s) — a call site may have regressed to a different numeric read.",
            millisOrNullReads >= 4
        )
    }

    // DistractionStopPlugin.kt는 이 테스트 모듈이 아니라 main 소스셋에 있으므로 읽으려면
    // 파일시스템 경로를 알아야 한다. Gradle의 단위 테스트 작업 디렉터리는 보통 app 모듈
    // 루트지만, 어느 디렉터리에서 실행되든 버티도록 cwd부터 위로 올라가며 두 가지 후보
    // 경로를 모두 찾는다.
    private fun readDistractionStopPluginSource(): String {
        val relativeSuffix = "src/main/java/com/studybuddy/app/distraction/DistractionStopPlugin.kt"
        val tried = mutableListOf<String>()
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            val direct = File(dir, relativeSuffix)
            tried += direct.path
            if (direct.isFile) return direct.readText()

            val viaAppModule = File(dir, "app/$relativeSuffix")
            tried += viaAppModule.path
            if (viaAppModule.isFile) return viaAppModule.readText()

            dir = dir.parentFile
        }
        error(
            "Could not locate DistractionStopPlugin.kt to guard against a regression. " +
                "Tried (cwd=${File(".").absolutePath}): $tried"
        )
    }
}
