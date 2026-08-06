import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey } from '../../lib';
import { getSubject } from '../../constants';
import { TopAppBar, Card, Icon } from '../../primitives';
import { DistractionStop, isNativePlatform, useDistractionState } from '../../native/distractionStop';

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function StudentHomeScreen() {
  const { state, actions } = useAppState();
  const today = todayKey();
  const items = (state.plannerItems[today] ?? []).slice().sort((a, b) => a.order - b.order);
  const [runningSessionId, setRunningSessionId] = React.useState<Record<string, string>>({});
  const [startPending, setStartPending] = React.useState<Record<string, boolean>>({});
  const [now, setNow] = React.useState(Date.now());
  const [showTodo, setShowTodo] = React.useState(false);

  // 네이티브가 허용앱 밖 이탈을 감지하면 스스로 sessionActive를 false로 내리고 stateChanged로
  // 알려준다(DistractionStop 화면과 같은 구독 훅). 웹은 그 전환을 보고 타이머를 이탈로 끝낸다.
  const { state: distraction } = useDistractionState();
  const nativeSessionActive = distraction?.sessionActive ?? false;
  const prevNativeSessionActive = React.useRef(false);
  // 사용자가 직접 정지/완료를 눌러 setSessionActive(false)를 보낸 경우에도 같은 전환이 오기
  // 때문에, "우리가 멈춘 것"인지 구분할 플래그가 필요하다. 정지 핸들러에서 동기적으로 세워두고
  // 전환을 관측할 때 소비한다.
  const selfInitiatedStop = React.useRef(false);

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    const wasActive = prevNativeSessionActive.current;
    prevNativeSessionActive.current = nativeSessionActive;
    if (nativeSessionActive) {
      // false -> true(새 세션 시작) 전환에서만 소비되지 않고 남은 플래그를 버린다. 매번 지우면
      // 정지 버튼이 세운 플래그가 네이티브 응답 전에(runningSessionId 변경으로 이 이펙트가
      // 다시 돌면서) 날아가 자기 정지를 이탈로 오인하게 된다.
      if (!wasActive) selfInitiatedStop.current = false;
      return;
    }
    if (!wasActive) return; // true -> false 전환만 처리
    if (selfInitiatedStop.current) {
      selfInitiatedStop.current = false;
      return;
    }
    const running = Object.entries(runningSessionId);
    if (running.length === 0) return;
    for (const [itemId, sessionId] of running) {
      actions.endStudySession(itemId, sessionId, true);
    }
    setRunningSessionId({});
  }, [nativeSessionActive, runningSessionId, actions]);

  const handleStart = async (itemId: string) => {
    if (startPending[itemId]) return;
    setStartPending((m) => ({ ...m, [itemId]: true }));
    try {
      const sessionId = await actions.startStudySession(itemId);
      setRunningSessionId((m) => ({ ...m, [itemId]: sessionId }));
      selfInitiatedStop.current = false;
      if (isNativePlatform()) DistractionStop.setSessionActive({ active: true });
    } finally {
      setStartPending((m) => {
        const next = { ...m };
        delete next[itemId];
        return next;
      });
    }
  };
  const handleStop = (itemId: string, completed: boolean) => {
    const sessionId = runningSessionId[itemId];
    if (!sessionId) return;
    actions.endStudySession(itemId, sessionId, false);
    if (isNativePlatform()) {
      // 아래 setSessionActive(false)가 돌려보낼 true -> false 전환을 이탈로 오인하지 않도록
      // 네이티브에 알리기 전에 동기적으로 표시해둔다.
      selfInitiatedStop.current = true;
      DistractionStop.setSessionActive({ active: false });
    }
    setRunningSessionId((m) => {
      const next = { ...m };
      delete next[itemId];
      return next;
    });
    if (completed) actions.updatePlannerItem(today, itemId, { status: 'completed' });
  };

  return (
    <div className="px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <TopAppBar />
      {state.profile?.inviteCode && (
        <p className="mt-2 text-xs text-on-surface-variant">
          내 초대코드 <span className="font-mono font-bold text-on-surface tracking-wider">{state.profile.inviteCode}</span> · 과외쌤/학부모께 알려주세요
        </p>
      )}
      <button
        onClick={() => setShowTodo(true)}
        className="mt-3 mb-4 inline-flex items-center gap-1 rounded-lg bg-tertiary-container/30 px-3 py-1.5 text-xs font-semibold text-on-surface"
      >
        📌 오늘의 할 일
      </button>

      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-on-surface-variant text-center py-10">오늘 할 일이 없어요.</p>}
        {items.map((it) => {
          const sessionId = runningSessionId[it.id];
          const session = sessionId ? (state.studySessions[it.id] ?? []).find((s) => s.id === sessionId) : null;
          const elapsed = session ? Math.floor((now - Date.parse(session.startedAt)) / 1000) : 0;
          return (
            <Card key={it.id}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold">
                    {getSubject(it.subjectId).label} {it.source === 'homework' && <span className="text-[10px] text-tertiary ml-1">숙제</span>}
                  </p>
                  <p className="text-xs text-on-surface-variant">{it.material || '할 일'}</p>
                  {session && <p className="text-lg font-mono font-bold text-primary mt-1">{formatElapsed(elapsed)}</p>}
                </div>
                {!session ? (
                  <button
                    onClick={() => handleStart(it.id)}
                    disabled={!!startPending[it.id]}
                    className="text-xs font-semibold text-on-primary px-3 py-2 rounded-full bg-primary flex items-center gap-1 disabled:opacity-50 shrink-0"
                  >
                    <Icon name="play_arrow" className="!text-[16px]" /> 시작하기
                  </button>
                ) : (
                  <button
                    onClick={() => handleStop(it.id, false)}
                    title="이따가 이어서 할 거예요"
                    className="text-sm font-semibold text-on-surface-variant px-4 py-2.5 rounded-full bg-surface-container shrink-0"
                  >
                    정지
                  </button>
                )}
              </div>
              {session && (
                <button
                  onClick={() => handleStop(it.id, true)}
                  className="w-full mt-2 text-sm font-bold text-on-primary px-3 py-2.5 rounded-full bg-primary"
                >
                  오늘 학습 완료!!
                </button>
              )}
            </Card>
          );
        })}
      </div>

      {showTodo && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-end" onClick={() => setShowTodo(false)}>
          <div className="w-full bg-[#1e2b1e] text-white rounded-t-2xl p-5 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold mb-3">오늘의 할 일</h2>
            {items.map((it) => (
              <div key={it.id} className="py-1.5 border-b border-white/10">
                <p className="text-sm">
                  {getSubject(it.subjectId).label} — {it.material || '할 일'} {it.status === 'completed' ? '✓' : ''}
                </p>
                {it.pageRange && <p className="text-xs text-white/60 mt-0.5">{it.pageRange}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
