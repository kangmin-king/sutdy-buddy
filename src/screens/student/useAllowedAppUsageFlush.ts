import React from 'react';
import { DistractionStop, isNativePlatform, useDistractionState } from '../../native/distractionStop';
import { useAppState } from '../../state/AppStateContext';
import { toIntervalRows } from '../shared/allowedAppUsageModel';

// 네이티브가 쌓아둔 허용앱 사용 구간을 서버로 보내고 네이티브 목록을 비운다.
// StudentAppShell에서 부르기 때문에 딴짓멈춰 오버레이가 떠서 학생 홈이 언마운트돼도
// 계속 동작한다 — 학생이 허용앱에서 돌아오는 시점이 바로 그 오버레이를 지날 때다.
export function useAllowedAppUsageFlush(): void {
  const { state: distraction } = useDistractionState();
  const { state, actions } = useAppState();
  const intervals = distraction?.allowedAppIntervals ?? [];
  const count = intervals.length;
  const userId = state.profile?.id ?? null;
  const flushing = React.useRef(false);

  React.useEffect(() => {
    if (!isNativePlatform() || count === 0 || userId == null) return;
    if (flushing.current) return;
    flushing.current = true;

    const rows = toIntervalRows(intervals, userId);

    void (async () => {
      try {
        await actions.recordAllowedAppIntervals(rows);
        await DistractionStop.clearAllowedAppIntervals();
        await actions.loadAllowedAppIntervals(userId);
      } catch {
        // 전송에 실패하면 네이티브 목록이 그대로 남아 다음 기회에 다시 시도한다.
      } finally {
        flushing.current = false;
      }
    })();
    // intervals 자체를 의존성에 넣으면 매 렌더마다 새 배열이라 무한 반복이 된다.
  }, [count, userId, actions]);
}
