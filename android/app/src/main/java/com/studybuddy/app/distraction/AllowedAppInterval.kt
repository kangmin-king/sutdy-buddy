package com.studybuddy.app.distraction

// 학생이 공부 중에 허용앱에 머문 한 구간. 어떤 앱이었는지는 담지 않는다 — 매니저에게
// 필요한 신호는 "얼마나 오래"이지 "무엇을"이 아니고, 담지 않으면 새어 나갈 것도 없다.
data class AllowedAppInterval(val startedAtMillis: Long, val endedAtMillis: Long)
