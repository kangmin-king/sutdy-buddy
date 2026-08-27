import React from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { useAppState } from '../../state/AppStateContext';
import { todayKey, addDaysToKey, resolvePlannerItemManagerId, managerDisplayLabel } from '../../lib';
import { getSubject } from '../../constants';
import { TopAppBar, Icon } from '../../primitives';
import { DistractionStop, isNativePlatform, useDistractionState } from '../../native/distractionStop';
import LinkedManagerChips from './LinkedManagerChips';
import HomeBanner from '../shared/HomeBanner';
import type { PlannerItem } from '../../types';
import { buildStudentHomeModel, canStartStudyItem, deriveRunningSessionIds, findStaleRunningSessions } from './studentHomeModel';
import { classifySessionStop } from '../distractionStopModel';

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatProposalDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${Number(match[2])}월 ${Number(match[3])}일` : date;
}
export default function StudentHomeScreen({
  onNavigateToCalendar,
  onOpenMockExam,
}: { onNavigateToCalendar?: () => void; onOpenMockExam?: () => void } = {}) {
  const { state, actions } = useAppState();
  const today = todayKey();
  const yesterday = addDaysToKey(today, -1);
  // 완료 처리한 항목은 홈 목록에서 사라진다 — "오늘의 할 일" 오버레이에서는 체크 표시로 계속 보인다.
  const allTodayItems = (state.plannerItems[today] ?? []).slice().sort((a, b) => a.order - b.order);
  const missedYesterday = (state.plannerItems[yesterday] ?? []).filter((it) => it.status !== 'completed');
  const isPageRangeItem = (it: PlannerItem) => {
    if (!it.examSubjectRangeId) return false;
    const range = state.examSubjectRanges.find((r) => r.id === it.examSubjectRangeId);
    return !!range && /^\d+~\d+페이지$/.test(range.rangeLabel);
  };
  // 페이지 범위 숙제는 보통 밀린 만큼이 자동으로 오늘/미래 날짜에 재분배된다(computeMissedHomeworkRedistribution).
  // 하지만 그 범위에 남은 미완료 미래/오늘 날짜가 하나도 없으면(예: 마지막 배정일이 어제) 재분배될
  // 곳이 없어 조용히 누락된다 — 이 경우엔 자유 입력 항목과 동일하게 "오늘 일정에 추가" 버튼을 보여준다.
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
  const todoTriggerRef = React.useRef<HTMLButtonElement>(null);
  const wasTodoOpen = React.useRef(false);
  const closeTodo = React.useCallback(() => setShowTodo(false), []);

  React.useEffect(() => {
    if (showTodo) {
      wasTodoOpen.current = true;
      return;
    }
    if (!wasTodoOpen.current) return;
    wasTodoOpen.current = false;
    const focusTimer = window.setTimeout(() => todoTriggerRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [showTodo]);

  React.useEffect(() => {
    if (!showTodo || !isNativePlatform()) return;
    const listenerPromise = CapacitorApp.addListener('backButton', closeTodo);
    return () => {
      void listenerPromise.then((handle) => handle.remove());
    };
  }, [closeTodo, showTodo]);
  const didRecoverRunningSession = React.useRef(false);

  React.useEffect(() => {
    if (state.loading || didRecoverRunningSession.current) return;
    didRecoverRunningSession.current = true;
    const visibleItemIds = new Set(
      allTodayItems.filter((item) => item.status !== 'completed').map((item) => item.id),
    );
    const recovered = deriveRunningSessionIds(state.studySessions, visibleItemIds);
    for (const stale of findStaleRunningSessions(state.studySessions, visibleItemIds)) {
      void actions.endStudySession(stale.itemId, stale.sessionId, false, stale.durationSeconds);
    }
    setRunningSessionId(recovered);
  }, [actions, allTodayItems, state.loading, state.studySessions]);

  const homeModel = React.useMemo(
    () => buildStudentHomeModel(allTodayItems, state.studySessions, runningSessionId, now),
    [allTodayItems, state.studySessions, runningSessionId, now],
  );
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
    return index >= 0 ? managerDisplayLabel(managerId, state.managerLabels, index) : (state.managerLabels[managerId] || '선생님');
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
    const cause = distraction
      ? classifySessionStop(distraction, Date.now(), selfInitiatedStop.current)
      : 'deviation';
    if (cause === 'self') {
      selfInitiatedStop.current = false;
      return;
    }
    const running = Object.entries(runningSessionId);
    if (running.length === 0) return;
    for (const [itemId, sessionId] of running) {
      // 쉬는 시간으로 멈춘 것은 이탈이 아니다 — 학생이 하지 않은 이탈을 기록에 남기면 안 된다.
      actions.endStudySession(itemId, sessionId, cause === 'deviation');
    }
    setRunningSessionId({});
  }, [nativeSessionActive, runningSessionId, actions, distraction]);

  const handleStart = async (itemId: string) => {
    if (startPending[itemId] || !canStartStudyItem(runningSessionId, itemId)) return;
    setStartPending((m) => ({ ...m, [itemId]: true }));
    try {
      const sessionId = await actions.startStudySession(itemId);
      // now가 1초 간격 setInterval로만 갱신돼서, 재시작 직후 새 세션의 startedAt보다 stale한
      // now가 남아있으면 경과시간이 순간적으로 음수가 되어 합계가 1초 줄어 보인다. 시작 시점에
      // 바로 맞춰준다.
      setNow(Date.now());
      setRunningSessionId((m) => ({ ...m, [itemId]: sessionId }));
      selfInitiatedStop.current = false;
      // 네이티브 브릿지 호출(DistractionStop 접근성 서비스 쪽 처리)이 실기기에서 동기적으로
      // 오래 걸릴 수 있는데, 같은 실행 흐름 안에 있으면 위 setState들이 화면에 그려지는 게
      // 그만큼 늦어져 "재시작해도 잠깐 멈춰있다가 시간이 간다"로 보인다. 화면이 먼저 그려지도록
      // 다음 틱으로 미룬다.
      if (isNativePlatform()) setTimeout(() => DistractionStop.setSessionActive({ active: true }), 0);
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
    const sessions = state.studySessions[itemId] ?? [];
    const running = sessions.find((s) => s.id === sessionId);
    // 화면에 이미 보이고 있던 값을 그대로 저장한다. 정지 시각 기준으로 다시 정밀 계산하면
    // 1초 주기로만 갱신되는 화면 표시값과 어긋나, 정지하는 순간 숫자가 위아래로 튀어 보인다.
    const displayedSeconds = running ? Math.floor((now - Date.parse(running.startedAt)) / 1000) : undefined;
    actions.endStudySession(itemId, sessionId, false, displayedSeconds);
    if (isNativePlatform()) {
      // 아래 setSessionActive(false)가 돌려보낼 true -> false 전환을 이탈로 오인하지 않도록
      // 네이티브에 알리기 전에 동기적으로 표시해둔다(이 ref 대입 자체는 즉시 실행되어야 한다).
      selfInitiatedStop.current = true;
      // 네이티브 호출 자체는 다음 틱으로 미뤄 화면 갱신을 막지 않게 한다 (handleStart와 동일한 이유).
      setTimeout(() => DistractionStop.setSessionActive({ active: false }), 0);
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
      ? [{ header: null, items: homeModel.nextItems }]
      : [
          ...state.linkedManagers.map((manager, index) => ({
            header: managerDisplayLabel(manager.id, state.managerLabels, index),
            items: homeModel.nextItems.filter((it) => managerIdFor(it) === manager.id),
          })),
          { header: '직접 추가', items: homeModel.nextItems.filter((it) => managerIdFor(it) === null) },
        ].filter((group) => group.items.length > 0);
  const currentItem = homeModel.currentItem;
  const currentIsRunning = currentItem ? Boolean(runningSessionId[currentItem.id]) : false;
  const itemOriginLabel = (item: PlannerItem) =>
    item.source === 'homework'
      ? ['숙제', managerLabelFor(item)].filter(Boolean).join(' · ')
      : '내 계획';
  const itemDetails = (item: PlannerItem) => [item.material, item.unit, item.pageRange].filter(Boolean).join(' · ');
  const completionPercent = homeModel.totalCount > 0 ? (homeModel.completedCount / homeModel.totalCount) * 100 : 0;

  return (
    <div className="px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <TopAppBar className="-mx-5" />

      <section className="mt-2" aria-labelledby="today-progress-title">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p id="today-progress-title" className="text-[11px] font-semibold tracking-[0.12em] text-primary">오늘의 학습</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-on-surface">
              {homeModel.totalCount === 0 ? '오늘 계획을 가볍게 시작해 볼까요?' : homeModel.completedCount === homeModel.totalCount ? '오늘 계획을 모두 마쳤어요' : `${homeModel.totalCount - homeModel.completedCount}개 남았어요`}
            </h1>
          </div>
          {homeModel.totalCount > 0 && <p className="shrink-0 font-mono text-sm font-bold tabular-nums text-primary">{homeModel.completedCount}/{homeModel.totalCount}</p>}
        </div>
        {homeModel.totalCount > 0 && (
          <div role="progressbar" aria-valuemin={0} aria-valuemax={homeModel.totalCount} aria-valuenow={homeModel.completedCount} className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-container-high" aria-label={`${homeModel.totalCount}개 중 ${homeModel.completedCount}개 완료`}>
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${completionPercent}%` }} />
          </div>
        )}
      </section>

      <section className="mt-6" aria-labelledby="current-study-title">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="current-study-title" className="text-sm font-bold text-on-surface">지금 할 공부</h2>
          {currentIsRunning && <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary"><span className="h-2 w-2 rounded-full bg-primary motion-safe:animate-pulse" />집중 중</span>}
        </div>
        {currentItem ? (
          <article className="overflow-hidden rounded-[1.75rem] bg-primary text-on-primary shadow-card">
            <div className="p-5 pb-4">
              <p className="text-xs font-semibold text-on-primary/70">{itemOriginLabel(currentItem)}</p>
              <h3 className="mt-2 break-words text-2xl font-extrabold tracking-tight">{getSubject(currentItem.subjectId).label}</h3>
              <p className="mt-1 min-h-5 break-words text-sm leading-relaxed text-on-primary/80">{itemDetails(currentItem) || '학습 내용을 확인하고 바로 시작해 보세요.'}</p>
              <div className="mt-5 flex items-end justify-between gap-3">
                <div><p className="text-[10px] font-semibold tracking-[0.1em] text-on-primary/60">오늘 쌓은 시간</p><p className="mt-1 font-mono text-4xl font-bold leading-none tabular-nums">{formatElapsed(homeModel.currentElapsedSeconds)}</p></div>
                <button onClick={() => currentIsRunning ? handleStop(currentItem.id, false) : handleStart(currentItem.id)} disabled={Boolean(startPending[currentItem.id])} className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-2xl bg-surface-container-lowest px-4 py-3 text-sm font-bold text-primary transition active:scale-[0.98] disabled:opacity-50">
                  <Icon name={currentIsRunning ? 'pause' : 'play_arrow'} className="!text-[18px]" />
                  {currentIsRunning ? '잠깐 멈춤' : homeModel.currentElapsedSeconds > 0 ? '이어서 하기' : '시작하기'}
                </button>
              </div>
            </div>
            {homeModel.currentElapsedSeconds > 0 && <button onClick={() => handleComplete(currentItem.id)} className="w-full border-t border-on-primary/15 px-5 py-3.5 text-sm font-bold transition hover:bg-on-primary/10 active:bg-on-primary/15">오늘 학습 완료</button>}
          </article>
        ) : (
          <div className="rounded-[1.75rem] bg-surface-container px-5 py-8 text-center">
            <Icon name="task_alt" className="!text-[32px] text-primary" filled />
            <p className="mt-2 text-sm font-bold text-on-surface">{homeModel.totalCount > 0 ? '오늘 공부를 모두 마쳤어요' : '아직 등록된 공부가 없어요'}</p>
            <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">{homeModel.totalCount > 0 ? '수고했어요. 오늘 쌓은 흐름을 이어가요.' : '캘린더에서 오늘 계획을 추가할 수 있어요.'}</p>
            {homeModel.totalCount === 0 && onNavigateToCalendar && <button onClick={onNavigateToCalendar} className="mt-4 inline-flex min-h-11 items-center rounded-xl px-3 text-xs font-bold text-primary">오늘 계획 만들기</button>}
          </div>
        )}
      </section>
      {homeModel.nextItems.length > 0 && (
        <section className="mt-6" aria-labelledby="next-study-title">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div><h2 id="next-study-title" className="text-sm font-bold text-on-surface">다음에 할 공부</h2><p className="mt-0.5 text-[11px] text-on-surface-variant">{homeModel.nextItems.length}개가 기다리고 있어요</p></div>
            {state.linkedManagers.length > 1 && <div className="flex rounded-full bg-surface-container p-0.5">{(['time', 'manager'] as const).map((mode) => <button key={mode} onClick={() => setSortMode(mode)} aria-pressed={sortMode === mode} className={`min-h-11 rounded-full px-3 py-2 text-[10px] font-semibold transition ${sortMode === mode ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}>{mode === 'time' ? '시간순' : '선생님별'}</button>)}</div>}
          </div>
          <div className="divide-y divide-outline-variant/40 border-y border-outline-variant/40">
            {itemGroups.map((group) => <div key={group.header ?? 'all'}>
              {group.header && <p className="pb-1 pt-3 text-[10px] font-semibold text-tertiary">{group.header}</p>}
              {group.items.map((item) => {
                const isRunning = Boolean(runningSessionId[item.id]);
                const elapsed = homeModel.elapsedSecondsByItemId[item.id] ?? 0;
                return <article key={item.id} className="flex min-w-0 items-center gap-3 py-3.5">
                  <div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><h3 className="truncate text-sm font-bold text-on-surface">{getSubject(item.subjectId).label}</h3><span className="shrink-0 text-[10px] font-medium text-tertiary">{itemOriginLabel(item)}</span></div><p className="mt-0.5 break-words text-xs leading-relaxed text-on-surface-variant">{itemDetails(item) || '학습 내용 미입력'}</p>{elapsed > 0 && <p className="mt-1 font-mono text-[11px] font-bold tabular-nums text-primary">{formatElapsed(elapsed)} 학습</p>}</div>
                  <button onClick={() => isRunning ? handleStop(item.id, false) : handleStart(item.id)} disabled={Boolean(startPending[item.id]) || !canStartStudyItem(runningSessionId, item.id)} aria-label={`${getSubject(item.subjectId).label} ${isRunning ? '일시정지' : '시작'}`} className={`inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold transition active:scale-[0.96] disabled:opacity-50 ${isRunning ? 'bg-surface-container text-on-surface' : 'bg-primary/10 text-primary'}`}><Icon name={isRunning ? 'pause' : 'play_arrow'} className="!text-[17px]" />{isRunning ? '멈춤' : '시작'}</button>
                </article>;
              })}
            </div>)}
          </div>
        </section>
      )}

      {state.homeworkProposals.length > 0 && (
        <section className="mt-6" aria-labelledby="homework-proposals-title">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 id="homework-proposals-title" className="text-sm font-bold text-on-surface">선생님이 보낸 숙제</h2>
              <p className="mt-0.5 text-[11px] text-on-surface-variant">내용을 확인하고 오늘 계획에 받을 수 있어요</p>
            </div>
            <span className="text-[11px] font-semibold text-primary">{state.homeworkProposals.length}개</span>
          </div>
          <div className="space-y-2">
            {state.homeworkProposals.map((p) => (
              <article key={p.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-container-low px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <h3 className="text-sm font-bold text-on-surface">{getSubject(p.subjectId).label}</h3>
                    <span className="text-[10px] font-medium text-tertiary">{proposalManagerLabel(p.managerId)}</span>
                  </div>
                  <p className="mt-0.5 break-words text-xs leading-relaxed text-on-surface-variant">
                    {[p.material, p.pageRange].filter(Boolean).join(' · ') || '할 일'}
                  </p>
                  <p className="mt-1 text-[11px] font-medium text-on-surface-variant">{formatProposalDate(p.date)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button onClick={() => actions.respondToHomeworkProposal(p.id, false)} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-surface-container px-3 text-xs font-bold text-on-surface-variant transition active:scale-[0.96]">
                    거절
                  </button>
                  <button onClick={() => actions.respondToHomeworkProposal(p.id, true)} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-3 text-xs font-bold text-on-primary transition active:scale-[0.96]">
                    받기
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {missedYesterday.length > 0 && (
        <div className="mt-5 rounded-2xl bg-surface-container-low px-4 py-3.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-on-surface">어제 남은 공부</p>
            <button onClick={onNavigateToCalendar} className="min-h-11 rounded-xl px-2 text-[11px] font-semibold text-on-surface-variant">
              남은 계획 보기
            </button>
          </div>
          <div className="space-y-1.5">
            {missedYesterday.map((it) => (
              <div key={it.id} className="flex min-w-0 items-center justify-between gap-2">
                <p className="min-w-0 break-words text-xs leading-relaxed">
                  {getSubject(it.subjectId).label} · {itemDetails(it) || '할 일'}
                  {managerLabelFor(it) && <span className="text-[10px] text-tertiary ml-1">· {managerLabelFor(it)}</span>}
                </p>
                {(!isPageRangeItem(it) || !hasFutureIncompleteInSameRange(it)) && (
                  <button onClick={() => handleAddToToday(it)} className="min-h-11 shrink-0 rounded-xl px-2 text-[11px] font-semibold text-primary">
                    오늘 일정에 추가
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <HomeBanner />
      <section className="mt-6" aria-labelledby="study-tools-title">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h2 id="study-tools-title" className="text-sm font-bold text-on-surface">학습 도구</h2>
            <p className="mt-0.5 text-[11px] text-on-surface-variant">필요할 때만 가볍게 꺼내 써요</p>
          </div>
          {state.linkedManagers.length > 0 && <span className="text-[11px] font-semibold text-tertiary">{state.linkedManagers.length}명 연결됨</span>}
        </div>
        <div className="rounded-2xl bg-surface-container-low px-4 py-3.5">
          {state.profile?.inviteCode && (
            <div className="flex items-center gap-2 text-xs text-on-surface-variant">
              <Icon name="link" className="!text-[17px] text-primary" />
              <span>초대코드</span>
              <span className="font-mono font-bold tracking-wider text-on-surface">{state.profile.inviteCode}</span>
            </div>
          )}
          <LinkedManagerChips />
          <div className={`mt-3 grid gap-2 ${onOpenMockExam ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {onOpenMockExam && (
              <button onClick={onOpenMockExam} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-surface-container-lowest px-3 text-xs font-bold text-primary transition active:scale-[0.98]">
                <Icon name="timer" className="!text-[18px]" /> 모의고사
              </button>
            )}
            <button
              ref={todoTriggerRef}
              onClick={() => setShowTodo(true)}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-surface-container-lowest px-3 text-xs font-bold text-on-surface-variant transition active:scale-[0.98]"
            >
              <Icon name="checklist" className="!text-[18px] text-primary" />
              오늘의 할 일
            </button>
          </div>
        </div>
      </section>
      {showTodo && (
        <div className="fixed inset-0 z-40 flex items-end bg-on-surface/45 backdrop-blur-[2px]" onClick={closeTodo} onKeyDown={(e) => { if (e.key === 'Escape') closeTodo(); if (e.key === 'Tab') { e.preventDefault(); (e.currentTarget.querySelector('button') as HTMLButtonElement | null)?.focus(); } }}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="today-todo-title"
            className="mx-auto max-h-[78dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[1.75rem] bg-surface-container-lowest px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-outline-variant" aria-hidden="true" />
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 id="today-todo-title" className="text-lg font-extrabold tracking-tight text-on-surface">오늘의 할 일</h2>
                <p className="mt-0.5 text-xs text-on-surface-variant">{homeModel.completedCount}개 완료 · {homeModel.totalCount - homeModel.completedCount}개 남음</p>
              </div>
              <button autoFocus onClick={closeTodo} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-on-surface-variant transition hover:bg-surface-container active:scale-[0.96]" aria-label="오늘의 할 일 닫기">
                <Icon name="close" className="!text-[20px]" />
              </button>
            </div>

            {allTodayItems.length > 0 ? (
              <div className="mt-4 divide-y divide-outline-variant/40 border-y border-outline-variant/40">
                {allTodayItems.map((it) => {
                  const completed = it.status === 'completed';
                  return (
                    <article key={it.id} className={`flex items-start gap-3 py-3.5 ${completed ? 'text-on-surface-variant' : 'text-on-surface'}`}>
                      <Icon name={completed ? 'task_alt' : 'radio_button_unchecked'} className={`mt-0.5 !text-[20px] ${completed ? 'text-primary' : 'text-outline'}`} filled={completed} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <h3 className={`text-sm font-bold ${completed ? 'line-through decoration-outline' : ''}`}>{getSubject(it.subjectId).label}</h3>
                          <span className="text-[10px] font-medium text-tertiary">{itemOriginLabel(it)}</span>
                        </div>
                        <p className="mt-0.5 break-words text-xs leading-relaxed text-on-surface-variant">{itemDetails(it) || '학습 내용 미입력'}</p>
                      </div>
                      <span className="shrink-0 pt-0.5 text-[11px] font-semibold text-on-surface-variant">{completed ? '완료' : '남음'}</span>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="py-10 text-center">
                <Icon name="event_available" className="!text-[30px] text-primary" filled />
                <p className="mt-2 text-sm font-bold text-on-surface">오늘 등록된 공부가 없어요</p>
                <p className="mt-1 text-xs text-on-surface-variant">캘린더에서 오늘 계획을 만들 수 있어요.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
