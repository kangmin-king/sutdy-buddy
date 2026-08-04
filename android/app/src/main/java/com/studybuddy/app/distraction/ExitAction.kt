package com.studybuddy.app.distraction

sealed class ExitAction {
    object BlockNow : ExitAction()
    object AskConfirmation : ExitAction()
    data class WarnThenBlockAfter(val delaySeconds: Int) : ExitAction()
}
