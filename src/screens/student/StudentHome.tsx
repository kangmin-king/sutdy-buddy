import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey, addDaysToKey, resolvePlannerItemManagerId, managerDisplayLabel } from '../../lib';
import { getSubject } from '../../constants';
import { TopAppBar, Card, Icon } from '../../primitives';
import { DistractionStop, isNativePlatform, useDistractionState } from '../../native/distractionStop';
import LinkedManagerChips from './LinkedManagerChips';
import HomeBanner from '../shared/HomeBanner';
import type { PlannerItem } from '../../types';

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// 오늘 이 항목에 쌓인 총 학습 시간(일시정지-재시작을 반복해도 누적) = 이미 끝난 세션들의
// durationSeconds 합 + 지금 돌고 있는 세션이 있으면 그 실시간 경과.
function elapsedTodaySeconds(sessions: { id: string; startedAt: string; durationSeconds: number | null }[], runningSessionId: string | undefined, nowMs: number): number {
  let total = 0;
  for (const s of sessions) {
    if (s.durationSeconds != null) total += s.durationSeconds;
  }
  if (runningSessionId) {
    const running = sessions.find((s) => s.id === runningSessionId);
    if (running) total += Math.floor((nowMs - Date.parse(running.startedAt)) / 1000);
  }
  return total;
}

export default function StudentHomeScreen({ onNavigateToCalendar }: { onNavigateToCalendar?: () => void } = {}) {
  const { state, actions } = useAppState();
  const today = todayKey();
  const yesterday = addDaysToKey(today, -1);
  // 완료 처리한 항목은 홈 목록에서 사라진다 — "📌 오늘의 할 일" 오버레이에서는 체크 표시로 계속 보인다.
  const items = (state.plannerItems[today] ?? []).filter((it) => it.status !== 'completed').slice().sort((a, b) => a.order - b.order);
  const allTodayItems = (state.plannerItems[today] ?? []).slice().sort((a, b) => a.order - b.order);
  const missedYesterday = (state.plannerItems[yesterday] ?? []).filter((it) => it.status !== 'completed');
  const isPageRangeItem = (it: PlannerItem) => {
    if (!it.examSubjectRangeId) return false;
    const range = state.examSubjectRanges.find((r) => r.id === it.examSubjectRangeId);
    return !!range && /^\d+~\d+페이지$/.test(range.rangeLabel);
  };
  // 페이지 범위 숙제는 보통 밀린 만큼이 자동으로 오늘/미래 날짜에 재분배된다(computeMissedHomeworkRedistribution).
  // 하지만 그 범위에 남은 미완료 미래/오늘 날짜가 하나도 없으면(예: 마지막 배정일이 어제) 재분배될
  // 곳이 없어 조용히 누락된다 — 이 경우엔 자유 입력 항목과 동일하게 "오늘 일정에 추가하기" 버튼을 보여준다.
  const hasFutureIncompleteInSameRange = (it: PlannerItem) => {
    if (!it.examSubjectRangeId) return false;
    return Object.values(state.plannerItems)
      .flat()
      .some((other) => other.examSubjectRangeId === it.examSubjectRangeId && other.date >= today && other.status !== 'completed');
  };
  const handleAddToToday = (it: PlannerItem) => {
    actions.addPlannerItem(today, {
      date: today,
      subjectId: it.subjectId,
      startTime: it.startTime,
      studyType: it.studyType,
      material: it.material,
      unit: it.unit,
      pageRange: it.pageRange,
      endTime: it.endTime,
      difficulty: it.difficulty,
      restPattern: it.restPattern,
      mustDo: it.mustDo,
      status: 'planned',
      actualMinutes: null,
      understanding: null,
      partialReason: null,
      incompleteReason: null,
      source: it.source,
      homeworkAssignmentId: null,
      examSubjectRangeId: null,
    });
  };
  const [runningSessionId, setRunningSessionId] = React.useState<Record<string, string>>({});
  const [startPending, setStartPending] = React.useState<Record<string, boolean>>({});
  const [now, setNow] = React.useState(Date.now());
  const [showTodo, setShowTodo] = React.useState(false);
  // 선생님이 여러 명일 때만 의미가 있는 정렬 토글 — 세션 안에서만 기억하고 서버엔 저장하지 않는다.
  const [sortMode, setSortMode] = React.useState<'time' | 'manager'>('time');
  const managerIdFor = (it: PlannerItem) => resolvePlannerItemManagerId(it, state);
  const managerLabelFor = (it: PlannerItem) => {
    const managerId = managerIdFor(it);
    if (!managerId) return null;
    const index = state.linkedManagers.findIndex((m) => m.id === managerId);
    return managerDisplayLabel(managerId, state.managerLabels, index);
  };
  const proposalManagerLabel = (managerId: string) => {
    const index = state.linkedManagers.findIndex((m) => m.id === managerId);
    return managerDisplayLabel(managerId, state.managerLabels, index);
  };

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
  // 일시정지 중(활성 세션 없음)에도 완료를 누를 수 있어야 하므로, 돌고 있는 세션이 있으면 그걸
  // 완료로 끝내고, 없으면 세션 없이 바로 상태만 완료로 바꾼다.
  const handleComplete = (itemId: string) => {
    if (runningSessionId[itemId]) {
      handleStop(itemId, true);
    } else {
      actions.updatePlannerItem(today, itemId, { status: 'completed' });
    }
  };

  // 선생님별 정렬을 고르면 항목을 선생님 단위로 묶는다(같은 선생님 항목은 원래 시간순 그대로 유지).
  // 시간순일 때는 지금처럼 그룹 헤더 없이 하나의 목록으로 보여준다.
  const itemGroups: { header: string | null; items: PlannerItem[] }[] =
    sortMode === 'time'
      ? [{ header: null, items }]
      : [
          ...state.linkedManagers.map((manager, index) => ({
            header: managerDisplayLabel(manager.id, state.managerLabels, index),
            items: items.filter((it) => managerIdFor(it) === manager.id),
          })),
          { header: '직접 추가', items: items.filter((it) => managerIdFor(it) === null) },
        ].filter((group) => group.items.length > 0);

  return (
    <div className="px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <TopAppBar />
      <HomeBanner />
      {state.profile?.inviteCode && (
        <p className="mt-2 text-xs text-on-surface-variant">
          내 초대코드 <span className="font-mono font-bold text-on-surface tracking-wider">{state.profile.inviteCode}</span> · 과외쌤/학부모께 알려주세요
        </p>
      )}
      <LinkedManagerChips />
      {state.homeworkProposals.length > 0 && (
        <div className="mt-3 space-y-2">
          {state.homeworkProposals.map((p) => (
            <Card key={p.id} className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">
                  {getSubject(p.subjectId).label} <span className="text-[10px] text-tertiary ml-1">숙제 제안 · {proposalManagerLabel(p.managerId)}</span>
                </p>
                <p className="text-xs text-on-surface-variant">{p.material || p.pageRange || '할 일'}</p>
                <p className="text-[11px] text-on-surface-variant mt-0.5">{p.date}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => actions.respondToHomeworkProposal(p.id, false)}
                  aria-label="거절"
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-surface-container text-on-surface-variant"
                >
                  <Icon name="close" className="!text-[18px]" />
                </button>
                <button
                  onClick={() => actions.respondToHomeworkProposal(p.id, true)}
                  aria-label="수락"
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-primary text-on-primary"
                >
                  <Icon name="check" className="!text-[18px]" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {missedYesterday.length > 0 && (
        <div className="mt-3 rounded-xl bg-error/10 border border-error/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-error">어제 못한 숙제</p>
            <button onClick={onNavigateToCalendar} className="text-[11px] text-on-surface-variant underline">
              지금까지 밀린 과제 보기
            </button>
          </div>
          <div className="space-y-1.5">
            {missedYesterday.map((it) => (
              <div key={it.id} className="flex items-center justify-between gap-2">
                <p className="text-xs">
                  {getSubject(it.subjectId).label} · {it.material || '할 일'}
                  {managerLabelFor(it) && <span className="text-[10px] text-tertiary ml-1">· {managerLabelFor(it)}</span>}
                </p>
                {(!isPageRangeItem(it) || !hasFutureIncompleteInSameRange(it)) && (
                  <button onClick={() => handleAddToToday(it)} className="text-[11px] font-semibold text-primary shrink-0">
                    오늘 일정에 추가하기
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <button
          onClick={() => setShowTodo(true)}
          className="mt-3 mb-4 relative inline-flex items-center gap-1.5 rounded-tl-sm rounded-tr-sm rounded-br-2xl rounded-bl-sm bg-[#fff4a8] text-[#4a3f10] pl-4 pr-8 py-2.5 text-xs font-bold shadow-md -rotate-3"
        >
          <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-sm rotate-[8deg]">🥕</span>
          오늘의 할 일
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 flex flex-col opacity-80">
            <svg width="12" height="7" viewBox="0 0 12 7">
              <path d="M1 1 L6 6 L11 1" stroke="#4a3f10" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <svg width="12" height="7" viewBox="0 0 12 7" style={{ marginTop: -3, opacity: 0.5 }}>
              <path d="M1 1 L6 6 L11 1" stroke="#4a3f10" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
      </div>

      {state.linkedManagers.length > 1 && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-on-surface-variant">오늘 할 일</span>
          <div className="flex bg-surface-container rounded-full p-0.5">
            {(['time', 'manager'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                className={`text-[10px] font-semibold rounded-full px-2.5 py-1 ${
                  sortMode === mode ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
                }`}
              >
                {mode === 'time' ? '시간순' : '선생님별'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {items.length === 0 && <p className="text-sm text-on-surface-variant text-center py-10">오늘 할 일이 없어요.</p>}
        {itemGroups.map((group) => (
          <div key={group.header ?? 'all'} className="space-y-2">
            {group.header && <p className="text-[11px] font-semibold text-tertiary">{group.header}</p>}
            {group.items.map((it) => {
              const sessionId = runningSessionId[it.id];
              const isRunning = !!sessionId;
              const sessions = state.studySessions[it.id] ?? [];
              const elapsed = elapsedTodaySeconds(sessions, sessionId, now);
              return (
                <Card key={it.id}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold">
                        {getSubject(it.subjectId).label}{' '}
                        {it.source === 'homework' && (
                          <span className="text-[10px] text-tertiary ml-1">
                            숙제{managerLabelFor(it) && ` · ${managerLabelFor(it)}`}
                          </span>
                        )}
                      </p>
                      {elapsed > 0 && <p className="text-lg font-mono font-bold text-primary mt-1">{formatElapsed(elapsed)}</p>}
                    </div>
                    {isRunning ? (
                      <button
                        onClick={() => handleStop(it.id, false)}
                        className="text-sm font-semibold text-on-surface-variant px-4 py-2.5 rounded-full bg-surface-container flex items-center gap-1 shrink-0"
                      >
                        <Icon name="pause" className="!text-[16px]" /> 일시정지
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStart(it.id)}
                        disabled={!!startPending[it.id]}
                        className="text-xs font-semibold text-on-primary px-3 py-2 rounded-full bg-primary flex items-center gap-1 disabled:opacity-50 shrink-0"
                      >
                        <Icon name="play_arrow" className="!text-[16px]" /> 시작
                      </button>
                    )}
                  </div>
                  {elapsed > 0 && (
                    <button
                      onClick={() => handleComplete(it.id)}
                      className="w-full mt-2 text-sm font-bold text-on-primary px-3 py-2.5 rounded-full bg-primary"
                    >
                      오늘 학습 완료!!
                    </button>
                  )}
                </Card>
              );
            })}
          </div>
        ))}
      </div>

      {showTodo && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-start" onClick={() => setShowTodo(false)}>
          <div
            className="w-full bg-[#1e2b1e] text-white rounded-b-2xl p-5 max-h-[70vh] overflow-y-auto pt-[calc(1.25rem+env(safe-area-inset-top))]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold mb-3">오늘의 할 일</h2>
            {allTodayItems.map((it) => (
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
