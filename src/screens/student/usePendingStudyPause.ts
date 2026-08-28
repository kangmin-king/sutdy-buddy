import React from 'react';
import { DistractionStop, isNativePlatform, useDistractionState } from '../../native/distractionStop';
import { useAppState } from '../../state/AppStateContext';
import { findOpenStudySessionsBefore, secondsUntil } from './pendingPauseModel';

// 네이티브가 "이 시각 기준으로 학습 집계를 멈춰라"는 표식을 남기면(쉬는 시간 시작) 열려 있던
// 학습 세션을 그 시각까지로 닫는다. StudentAppShell에서 부르기 때문에 딴짓멈춰 오버레이가
// 떠서 학생 홈이 언마운트돼도 계속 동작한다.
//
// 표식은 상태에 남아 있으므로 앱이 죽었다 살아나도 처리된다. 처리 도중 실패하면 표식이
// 남아 다음 기회에 다시 시도하고, 세션을 닫은 뒤 해제에 실패하면 다음 실행이 열린 세션을
// 찾지 못해 표식만 해제한다 — 중복 종료가 생기지 않는다.
export function usePendingStudyPause(): void {
  const { state: distraction } = useDistractionState();
  const { state, actions } = useAppState();
  const pendingAt = distraction?.pendingPauseAtMillis ?? null;
  // 이번 공부 세션이 시작된 시각. 지난 날짜에 열린 채 남은 고아 세션까지 닫지 않도록
  // findOpenStudySessionsBefore의 아래 경계로 쓴다.
  const sessionStartedAt = distraction?.sessionStartedAtMillis ?? null;
  const handling = React.useRef(false);

  React.useEffect(() => {
    if (!isNativePlatform() || pendingAt == null) return;
    if (handling.current) return;
    handling.current = true;

    const open = findOpenStudySessionsBefore(state.studySessions, pendingAt, sessionStartedAt);

    void (async () => {
      try {
        for (const { itemId, sessionId, startedAt } of open) {
          await actions.endStudySession(itemId, sessionId, secondsUntil(startedAt, pendingAt));
        }
        await DistractionStop.clearPendingPause();
      } finally {
        handling.current = false;
      }
    })();
  }, [pendingAt, sessionStartedAt, state.studySessions, actions]);
}
