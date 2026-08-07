import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { todayKey, addDaysToKey } from '../lib';
import { getTomorrowRecommendation, getWeeklyPattern } from '../ai';
import { getSubject, STUDY_TYPES, DIFFICULTY_LEVELS, SUBJECTS } from '../constants';
import { BackBar, Card, Button, Icon, SectionTitle, ChipGroup, TextField } from '../primitives';
import type { PlannerItem, SubjectId } from '../types';

export default function TomorrowRecommendationScreen({ onBack }: { onBack: () => void }) {
  const { state, actions } = useAppState();
  const today = todayKey();
  const tomorrow = addDaysToKey(today, 1);
  const tomorrowItems = (state.plannerItems[tomorrow] ?? []).slice().sort((a, b) => a.order - b.order);

  const [showForm, setShowForm] = React.useState(false);
  const [subjectId, setSubjectId] = React.useState<SubjectId>('math');
  const [task, setTask] = React.useState('');
  const [startTime, setStartTime] = React.useState('09:00');
  const [endTime, setEndTime] = React.useState('');

  const recentPlannerItems = React.useMemo(() => {
    const recentDates = [1, 2, 3, 4, 5, 6, 7].map((n) => addDaysToKey(today, -n));
    return recentDates.flatMap((d) => state.plannerItems[d] ?? []);
  }, [state.plannerItems, today]);

  // 규칙 기반 무료 추천 — OpenAI 크레딧 없이도 즉시 계산된다. Edge Function으로 되돌리려면
  // 이 useMemo를 supabase.functions.invoke('tomorrow-recommendation', ...) 호출로 교체하면 된다.
  const recommendation = React.useMemo(
    () =>
      getTomorrowRecommendation({
        todayPlannerItems: state.plannerItems[today] ?? [],
        todayCondition: state.conditions[today] ?? null,
        tomorrowScheduleBlocks: state.scheduleBlocks[tomorrow] ?? [],
        recentPlannerItems,
        mainSubjects: state.profile?.mainSubjects ?? [],
      }),
    [state.plannerItems, state.conditions, state.scheduleBlocks, state.profile, today, tomorrow, recentPlannerItems]
  );

  const weeklyPattern = React.useMemo(
    () => getWeeklyPattern(recentPlannerItems, state.plannerItems[today] ?? []),
    [recentPlannerItems, state.plannerItems, today]
  );

  const addTask = () => {
    if (!task.trim()) return;
    actions.addPlannerItem(tomorrow, {
      date: tomorrow,
      subjectId,
      startTime,
      studyType: null,
      material: task,
      unit: '',
      pageRange: '',
      endTime: endTime || null,
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
    setTask('');
    setShowForm(false);
  };

  // 추천 항목을 그대로 "내일 계획" 목록에 담아준다 — 화면 전환 없이 이 자리에서 바로 확인/수정 가능.
  const applyRecommendation = () => {
    recommendation.items.forEach((it) => {
      const newItem: Omit<PlannerItem, 'id' | 'order'> = {
        date: tomorrow,
        subjectId: it.subjectId,
        startTime: it.startTime,
        studyType: it.studyType,
        material: it.material,
        unit: it.unit,
        pageRange: it.pageRange,
        endTime: it.endTime,
        difficulty: it.difficulty,
        restPattern: null,
        mustDo: it.mustDo,
        status: 'planned',
        actualMinutes: null,
        understanding: null,
        partialReason: null,
        incompleteReason: null,
        source: 'self',
        homeworkAssignmentId: null,
        examSubjectRangeId: null,
      };
      actions.addPlannerItem(tomorrow, newItem);
    });
  };

  return (
    <div className="pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <BackBar title="내일 하루 마무리" onBack={onBack} />
      <div className="px-5 pt-2">
        <Card tint="secondary" className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="insights" className="!text-[18px] text-secondary" />
            <span className="text-sm font-bold">이번주 나의 패턴</span>
          </div>
          <p className="text-sm text-on-surface-variant">
            최근 7일간 완료율 <span className="font-bold text-on-surface">{weeklyPattern.weeklyCompletionRate}%</span>
            {weeklyPattern.mostPostponedSubject && (
              <>
                , 가장 자주 미룬 과목은{' '}
                <span className="font-bold text-on-surface">{getSubject(weeklyPattern.mostPostponedSubject).label}</span>이었어요.
              </>
            )}
          </p>
        </Card>

        <div className="rounded-3xl bg-gradient-to-br from-tertiary-container/40 to-primary-container/30 p-5 mb-5">
          <span className="inline-block text-xs font-bold bg-white/60 rounded-full px-3 py-1 mb-2">AI 버디의 제안</span>
          <h1 className="text-xl font-extrabold mb-4">오늘 하루 분석</h1>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white/70 rounded-xl p-3">
              <p className="text-xs text-on-surface-variant">오늘 완료율</p>
              <p className="text-lg font-bold">{recommendation.completionRate}%</p>
            </div>
            <div className="bg-white/70 rounded-xl p-3">
              <p className="text-xs text-on-surface-variant">미완료 항목</p>
              <p className="text-lg font-bold">{recommendation.incompleteCount}개</p>
            </div>
            <div className="bg-white/70 rounded-xl p-3">
              <p className="text-xs text-on-surface-variant">집중 낮은 시간</p>
              <p className="text-lg font-bold">{recommendation.lowFocusWindow ?? '-'}</p>
            </div>
          </div>

          <div className="flex items-start gap-2 mb-1">
            <Icon name="info" className="!text-[18px] text-primary mt-0.5" />
            <span className="text-sm font-bold">분석 & 조정 포인트</span>
          </div>
          <ul className="list-disc list-inside text-sm text-on-surface-variant space-y-1">
            {recommendation.reasons.length ? recommendation.reasons.map((r, i) => <li key={i}>{r}</li>) : <li>오늘 계획을 잘 지켰어요. 내일도 비슷한 흐름으로 진행해요.</li>}
          </ul>
        </div>

        <SectionTitle
          action={
            <button onClick={() => setShowForm((s) => !s)} className="text-primary flex items-center gap-1 text-xs font-semibold">
              <Icon name="add_circle" className="!text-[18px]" /> 할 일 추가
            </button>
          }
        >
          내일 계획
        </SectionTitle>

        {showForm && (
          <Card className="mb-4 space-y-3">
            <ChipGroup options={SUBJECTS} value={subjectId} onChange={setSubjectId} />
            <TextField label="뭐 할지" value={task} onChange={setTask} placeholder="예: 수학 익힘책 2단원" />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="시작" type="time" value={startTime} onChange={setStartTime} />
              <TextField label="종료" type="time" value={endTime} onChange={setEndTime} />
            </div>
            <Button className="w-full" onClick={addTask}>
              추가하기
            </Button>
          </Card>
        )}

        <div className="space-y-2 mb-6">
          {tomorrowItems.length === 0 && <p className="text-sm text-on-surface-variant text-center py-6">아직 내일 계획이 없어요. 위에서 추가하거나 아래 추천을 적용해보세요.</p>}
          {tomorrowItems.map((it) => (
            <div key={it.id} className="flex items-center justify-between rounded-xl bg-surface-container-high px-4 py-3">
              <div>
                <p className="text-sm font-semibold">
                  {getSubject(it.subjectId).label} {it.material && `· ${it.material}`}
                </p>
                <p className="text-xs text-on-surface-variant">
                  {it.startTime}
                  {it.endTime ? ` - ${it.endTime}` : ''}
                </p>
              </div>
              <button onClick={() => actions.deletePlannerItem(tomorrow, it.id)} className="text-on-surface-variant">
                <Icon name="close" className="!text-[18px]" />
              </button>
            </div>
          ))}
        </div>

        <h2 className="text-base font-bold mb-3">내일의 추천 학습 순서 (총 {recommendation.items.length}개)</h2>
        <div className="space-y-3 mb-6">
          {recommendation.items.length === 0 && <p className="text-sm text-on-surface-variant text-center py-6">추천할 항목이 아직 없어요.</p>}
          {recommendation.items.map((it, idx) => (
            <Card key={idx}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-primary">{idx === 0 ? '가장 먼저 추천' : `학습 순서 ${idx + 1}`}</span>
                <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-surface-container">{DIFFICULTY_LEVELS.find((d) => d.id === it.difficulty)?.label}</span>
              </div>
              <p className="text-sm font-bold">
                {getSubject(it.subjectId).label} <span className="text-on-surface-variant font-normal">[{STUDY_TYPES.find((t) => t.id === it.studyType)?.label}]</span>
              </p>
              {(it.material || it.unit || it.pageRange) && (
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {it.material} {it.unit} {it.pageRange}
                </p>
              )}
              <p className="text-xs italic text-tertiary mt-2 bg-tertiary-container/20 rounded-lg px-2 py-1.5">💡 {it.reason}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-on-surface-variant">
                <span className="flex items-center gap-1">
                  <Icon name="alarm" className="!text-[16px]" /> {it.startTime} - {it.endTime}
                </span>
                <span className="flex items-center gap-1">
                  <Icon name="timer" className="!text-[16px]" /> {it.estimatedMinutes}분 예상
                </span>
              </div>
            </Card>
          ))}
        </div>

        {recommendation.items.length > 0 && (
          <>
            <p className="text-xs text-on-surface-variant text-center mb-3">위 "내일 계획"에 {recommendation.items.length}개 항목이 추가돼요.</p>
            <Button className="w-full" onClick={applyRecommendation}>
              추천 적용하기
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
