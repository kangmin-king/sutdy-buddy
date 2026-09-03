import React from 'react';
import { useAppState } from '../../state/AppStateContext';
import { todayKey, addDaysToKey, resolvePlannerItemManagerId, managerDisplayLabel } from '../../lib';
import { getSubject } from '../../constants';
import { TopAppBar, Icon, useConfirm } from '../../primitives';
import { DistractionStop, isNativePlatform } from '../../native/distractionStop';
import HomeBanner from '../shared/HomeBanner';
import TodayList from './TodayList';
import type { PlannerItem, SubjectId } from '../../types';
import { buildStudentHomeModel, canStartStudyItem, deriveRunningSessionIds, findStaleRunningSessions } from './studentHomeModel';

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
}: { onNavigateToCalendar?: () => void } = {}) {
  const { state, actions } = useAppState();
  const { confirm, confirmDialog } = useConfirm();
  const today = todayKey();
  const yesterday = addDaysToKey(today, -1);
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
  const didRecoverRunningSession = React.useRef(false);

  React.useEffect(() => {
    if (state.loading || didRecoverRunningSession.current) return;
    didRecoverRunningSession.current = true;
    const visibleItemIds = new Set(
      allTodayItems.filter((item) => item.status !== 'completed').map((item) => item.id),
    );
    const recovered = deriveRunningSessionIds(state.studySessions, visibleItemIds);
    for (const stale of findStaleRunningSessions(state.studySessions, visibleItemIds)) {
      void actions.endStudySession(stale.itemId, stale.sessionId, stale.durationSeconds);
    }
    setRunningSessionId(recovered);
  }, [actions, allTodayItems, state.loading, state.studySessions]);

  const homeModel = React.useMemo(
    () => buildStudentHomeModel(allTodayItems, state.studySessions, runningSessionId, now),
    [allTodayItems, state.studySessions, runningSessionId, now],
  );
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

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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
    // 쉬는 시간 표식 처리(usePendingStudyPause)가 이 세션을 이미 쉬는 시간 시작 시각까지로
    // 닫아둔 경우가 있다 — 알림의 +5분/+30분이나 경고의 '5분 쉬기'는 학생 홈을 언마운트하지
    // 않아서 화면의 runningSessionId가 그대로 남는다. 그때 다시 쓰면 쉬는 시간이 포함된 전체
    // 벽시계 값이 올바른 값을 덮어쓴다 — 이 변경이 애초에 없애려던 그 시간이다.
    if (running == null || running.endedAt == null) {
      // 화면에 이미 보이고 있던 값을 그대로 저장한다. 정지 시각 기준으로 다시 정밀 계산하면
      // 1초 주기로만 갱신되는 화면 표시값과 어긋나, 정지하는 순간 숫자가 위아래로 튀어 보인다.
      const displayedSeconds = running ? Math.floor((now - Date.parse(running.startedAt)) / 1000) : undefined;
      actions.endStudySession(itemId, sessionId, displayedSeconds);
    }
    if (isNativePlatform()) {
      // 네이티브 호출은 다음 틱으로 미뤄 화면 갱신을 막지 않게 한다.
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
  // 목록의 체크는 되돌릴 수 있어야 한다 — 잘못 눌렀을 때 복구할 방법이 없으면 체크박스를 못 쓴다.
  const handleToggleComplete = (item: PlannerItem) => {
    if (item.status === 'completed') {
      actions.updatePlannerItem(today, item.id, { status: 'planned' });
    } else {
      handleComplete(item.id);
    }
  };

  const handleAddSelfPlan = (draft: { subjectId: SubjectId; material: string; startTime: string; endTime: string }) => {
    actions.addPlannerItem(today, {
      date: today,
      subjectId: draft.subjectId,
      startTime: draft.startTime,
      studyType: null,
      material: draft.material,
      unit: '',
      pageRange: '',
      endTime: draft.endTime || null,
      difficulty: null,
      restPattern: null,
      mustDo: false,
      status: 'planned',
      actualMinutes: null,
      understanding: null,
      partialReason: null,
      incompleteReason: null,
      source: 'self',
      homeworkAssignmentId: null,
      examSubjectRangeId: null,
    });
  };

  const currentItem = homeModel.currentItem;
  const currentIsRunning = currentItem ? Boolean(runningSessionId[currentItem.id]) : false;
  const itemOriginLabel = (item: PlannerItem) =>
    item.source === 'homework'
      ? ['숙제', managerLabelFor(item)].filter(Boolean).join(' · ')
      : '내 계획';
  const itemDetails = (item: PlannerItem) => [item.material, item.unit, item.pageRange].filter(Boolean).join(' · ');
  const completionPercent = homeModel.totalCount > 0 ? (homeModel.completedCount / homeModel.totalCount) * 100 : 0;
  const completedItems = allTodayItems.filter((item) => item.status === 'completed');

  return (
    <div className="px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <TopAppBar className="-mx-5" compact />

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

      {/*
        아래 카드는 라이트에선 파란 면 위 흰 글씨다. 다크에서 같은 밝기의 파란 면을 쓰면
        화면에서 가장 눈부신 덩어리가 되어버려(승인된 B안이 피하려던 지점) 떠 있는 어두운
        면으로 바꾸고, 강조는 CTA 버튼 하나에만 남긴다.
      */}
      {currentItem && (
        <section className="mt-6" aria-labelledby="current-study-title">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="current-study-title" className="text-sm font-bold text-on-surface">지금 할 공부</h2>
            {currentIsRunning && <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary"><span className="h-2 w-2 rounded-full bg-primary motion-safe:animate-pulse" />집중 중</span>}
          </div>
          <article className="overflow-hidden rounded-[1.75rem] bg-primary text-on-primary shadow-card dark:bg-surface-container-lowest dark:text-on-surface">
            <div className="p-5 pb-4">
              <p className="text-xs font-semibold text-on-primary/70 dark:text-on-surface-variant">{itemOriginLabel(currentItem)}</p>
              <h3 className="mt-2 break-words text-2xl font-extrabold tracking-tight">{getSubject(currentItem.subjectId).label}</h3>
              <p className="mt-1 min-h-5 break-words text-sm leading-relaxed text-on-primary/80 dark:text-on-surface-variant">{itemDetails(currentItem) || '학습 내용을 확인하고 바로 시작해 보세요.'}</p>
              <div className="mt-5 flex items-end justify-between gap-3">
                <div><p className="text-[10px] font-semibold tracking-[0.1em] text-on-primary/60 dark:text-on-surface-variant">오늘 쌓은 시간</p><p className="mt-1 font-mono text-4xl font-bold leading-none tabular-nums">{formatElapsed(homeModel.currentElapsedSeconds)}</p></div>
                <button onClick={() => currentIsRunning ? handleStop(currentItem.id, false) : handleStart(currentItem.id)} disabled={Boolean(startPending[currentItem.id])} className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-2xl bg-surface-container-lowest px-4 py-3 text-sm font-bold text-primary transition active:scale-[0.98] disabled:opacity-50 dark:bg-primary dark:text-on-primary">
                  <Icon name={currentIsRunning ? 'pause' : 'play_arrow'} className="!text-[18px]" />
                  {currentIsRunning ? '잠깐 멈춤' : homeModel.currentElapsedSeconds > 0 ? '이어서 하기' : '시작하기'}
                </button>
              </div>
            </div>
            {homeModel.currentElapsedSeconds > 0 && <button onClick={() => handleComplete(currentItem.id)} className="w-full border-t border-on-primary/15 px-5 py-3.5 text-sm font-bold transition hover:bg-on-primary/10 active:bg-on-primary/15 dark:border-outline-variant dark:hover:bg-surface-container dark:active:bg-surface-container-high">오늘 학습 완료</button>}
          </article>
        </section>
      )}

      <TodayList
        pending={homeModel.nextItems}
        completed={completedItems}
        managerIdOf={managerIdFor}
        linkedManagerIds={state.linkedManagers.map((manager) => manager.id)}
        managerLabelOf={proposalManagerLabel}
        elapsedSecondsByItemId={homeModel.elapsedSecondsByItemId}
        isRunning={(itemId) => Boolean(runningSessionId[itemId])}
        canStart={(itemId) => canStartStudyItem(runningSessionId, itemId)}
        startPending={startPending}
        onStart={handleStart}
        onPause={(itemId) => handleStop(itemId, false)}
        onToggleComplete={handleToggleComplete}
        onDelete={async (item) => {
          const label = `${getSubject(item.subjectId).label}${itemDetails(item) ? ` · ${itemDetails(item)}` : ''}`;
          if (await confirm(`"${label}" 계획을 삭제할까요?`)) actions.deletePlannerItem(today, item.id);
        }}
        onAdd={handleAddSelfPlan}
        originLabel={itemOriginLabel}
        details={itemDetails}
        isSelfPlan={(item) => item.source !== 'homework'}
      />

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
        <section className="mt-6" aria-labelledby="missed-yesterday-title">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 id="missed-yesterday-title" className="text-sm font-bold text-on-surface">어제 남은 공부</h2>
              <p className="mt-0.5 text-[11px] text-on-surface-variant">오늘로 넘겨서 마무리할 수 있어요</p>
            </div>
            <button onClick={onNavigateToCalendar} className="min-h-11 shrink-0 rounded-xl px-2 text-[11px] font-semibold text-on-surface-variant">
              캘린더에서 보기
            </button>
          </div>
          <div className="space-y-2">
            {missedYesterday.map((it) => (
              <article key={it.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-container-low px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <h3 className="text-sm font-bold text-on-surface">{getSubject(it.subjectId).label}</h3>
                    <span className="text-[10px] font-medium text-tertiary">{itemOriginLabel(it)}</span>
                  </div>
                  <p className="mt-0.5 break-words text-xs leading-relaxed text-on-surface-variant">{itemDetails(it) || '할 일'}</p>
                </div>
                {(!isPageRangeItem(it) || !hasFutureIncompleteInSameRange(it)) && (
                  <button onClick={() => handleAddToToday(it)} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-primary px-3 text-xs font-bold text-on-primary transition active:scale-[0.96]">
                    오늘로
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <HomeBanner />
      {confirmDialog}
    </div>
  );
}
