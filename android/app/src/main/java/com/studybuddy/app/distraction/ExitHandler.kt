package com.studybuddy.app.distraction

class ExitHandler {
    fun decide(mode: ExitMode, gracePeriodSeconds: Int): ExitAction = when (mode) {
        ExitMode.IMMEDIATE -> ExitAction.BlockNow
        ExitMode.CONFIRM -> ExitAction.AskConfirmation
        ExitMode.GRACE_PERIOD -> ExitAction.WarnThenBlockAfter(delaySeconds = gracePeriodSeconds)
    }
}
