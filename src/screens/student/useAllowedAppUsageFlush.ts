import React from 'react';
import { DistractionStop, isNativePlatform, useDistractionState } from '../../native/distractionStop';
import { useAppState } from '../../state/AppStateContext';
import { intervalsToFlush } from '../shared/allowedAppUsageModel';

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

  // actions는 useMemo(..., [userId, state])라 AppState가 바뀔 때마다 새 객체가 된다 — 그리고
  // 이 훅이 마지막에 부르는 loadAllowedAppIntervals가 바로 그 AppState를 바꾼다. 의존성에
  // 두면 그 갱신이 이펙트를 다시 돌리는데, 그때 네이티브의 새 상태는 아직 브리지를 건너오는
  // 중이라 count와 intervals는 방금 지운 스냅샷 그대로다. 그 낡은 count로 clear를 한 번 더
  // 부르면 그 사이에 닫힌 — 서버로 보낸 적 없는 — 구간의 앞부분이 잘려나간다.
  // flushing.current는 async 본문만 막지, clear와 새 count 도착 사이의 창은 막지 못한다.
  // 그래서 actions는 ref로 들고 의존성에서 뺀다. 이펙트를 다시 돌릴 자격이 있는 것은
  // 네이티브가 실제로 새 구간을 넘겼다는 신호(count)와 사용자 전환(userId)뿐이다.
  const actionsRef = React.useRef(actions);
  actionsRef.current = actions;

  const intervalsRef = React.useRef(intervals);
  intervalsRef.current = intervals;

  React.useEffect(() => {
    if (!isNativePlatform() || count === 0 || userId == null) return;
    if (flushing.current) return;
    flushing.current = true;

    // count와 같은 렌더의 스냅샷이어야 한다 — 아래 clear가 지우는 개수가 곧 이 개수다.
    const { rows, count: snapshotCount } = intervalsToFlush(intervalsRef.current, userId);

    void (async () => {
      try {
        await actionsRef.current.recordAllowedAppIntervals(rows);
        await DistractionStop.clearAllowedAppIntervals({ count: snapshotCount });
        await actionsRef.current.loadAllowedAppIntervals(userId);
      } catch {
        // 전송에 실패하면 네이티브 목록이 그대로 남아 다음 기회에 다시 시도한다.
      } finally {
        flushing.current = false;
      }
    })();
    // intervals 자체를 의존성에 넣으면 매 렌더마다 새 배열이라 무한 반복이 된다. actions를
    // 뺀 이유는 위 주석 참조 — 이 훅이 스스로 바꾸는 값이라 넣으면 재진입이 생긴다.
  }, [count, userId]);
}
