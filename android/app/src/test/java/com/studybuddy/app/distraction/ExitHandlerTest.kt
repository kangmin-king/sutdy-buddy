package com.studybuddy.app.distraction

import org.junit.Assert.assertEquals
import org.junit.Test

class ExitHandlerTest {

    private val handler = ExitHandler()

    @Test
    fun `IMMEDIATE mode decides BlockNow`() {
        val action = handler.decide(ExitMode.IMMEDIATE, gracePeriodSeconds = 10)
        assertEquals(ExitAction.BlockNow, action)
    }

    @Test
    fun `CONFIRM mode decides AskConfirmation`() {
        val action = handler.decide(ExitMode.CONFIRM, gracePeriodSeconds = 10)
        assertEquals(ExitAction.AskConfirmation, action)
    }

    @Test
    fun `GRACE_PERIOD mode decides WarnThenBlockAfter with configured delay`() {
        val action = handler.decide(ExitMode.GRACE_PERIOD, gracePeriodSeconds = 15)
        assertEquals(ExitAction.WarnThenBlockAfter(delaySeconds = 15), action)
    }
}
