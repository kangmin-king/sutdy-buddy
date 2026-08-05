import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey } from '../../lib';
import { getSubject } from '../../constants';
import { TopAppBar, Card, Icon } from '../../primitives';
import { DistractionStop, isNativePlatform } from '../../native/distractionStop';

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

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleStart = async (itemId: string) => {
    if (startPending[itemId]) return;
    setStartPending((m) => ({ ...m, [itemId]: true }));
    try {
      const sessionId = await actions.startStudySession(itemId);
      setRunningSessionId((m) => ({ ...m, [itemId]: sessionId }));
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
    if (isNativePlatform()) DistractionStop.setSessionActive({ active: false });
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
            <Card key={it.id} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold">
                  {getSubject(it.subjectId).label} {it.source === 'homework' && <span className="text-[10px] text-tertiary ml-1">숙제</span>}
                </p>
                <p className="text-xs text-on-surface-variant">{it.material || '할 일'}</p>
                {session && <p className="text-lg font-mono font-bold text-primary mt-1">{formatElapsed(elapsed)}</p>}
              </div>
              {session ? (
                <div className="flex gap-2">
                  <button onClick={() => handleStop(it.id, false)} className="text-xs font-semibold text-on-surface-variant px-3 py-2 rounded-full bg-surface-container">
                    정지
                  </button>
                  <button onClick={() => handleStop(it.id, true)} className="text-xs font-semibold text-on-primary px-3 py-2 rounded-full bg-primary">
                    완료
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleStart(it.id)}
                  disabled={!!startPending[it.id]}
                  className="text-xs font-semibold text-on-primary px-3 py-2 rounded-full bg-primary flex items-center gap-1 disabled:opacity-50"
                >
                  <Icon name="play_arrow" className="!text-[16px]" /> 시작하기
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
              <p key={it.id} className="text-sm py-1.5 border-b border-white/10">
                {getSubject(it.subjectId).label} — {it.material || '할 일'} {it.status === 'completed' ? '✓' : ''}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
