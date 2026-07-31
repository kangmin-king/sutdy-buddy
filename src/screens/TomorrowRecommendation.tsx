import React from 'react';
import { useAppState } from '../state/AppStateContext';
import { supabase } from '../lib/supabase';
import { todayKey, addDaysToKey, timeToMinutes, minutesToTime, getPlannerProgress, computeFreeGaps, sumFreeMinutes, formatMinutes } from '../lib';
import { getSubject, SUBJECTS, STUDY_TYPES, DIFFICULTY_LEVELS } from '../constants';
import { BackBar, Card, Button, Icon } from '../primitives';
import type { TomorrowRecommendation, TomorrowRecommendationItem, StudyTypeId, DifficultyId } from '../types';

function subjectIdFromLabel(label: string) {
  return SUBJECTS.find((s) => s.label === label)?.id ?? SUBJECTS[0].id;
}

export default function TomorrowRecommendationScreen({ onBack, onApplied }: { onBack: () => void; onApplied: () => void }) {
  const { state, actions } = useAppState();
  const today = todayKey();
  const tomorrow = addDaysToKey(today, 1);

  const [loading, setLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [recommendation, setRecommendation] = React.useState<TomorrowRecommendation | null>(null);
  const [applied, setApplied] = React.useState(false);

  React.useEffect(() => {
    const fetchRecommendation = async () => {
      const todayItems = state.plannerItems[today] ?? [];
      const progress = getPlannerProgress(todayItems);
      const incomplete = todayItems.filter((i) => i.status === 'partial' || i.status === 'carried_over');

      const recentDates = [1, 2, 3, 4, 5, 6, 7].map((n) => addDaysToKey(today, -n));
      const recentIncomplete = recentDates.flatMap((d) => (state.plannerItems[d] ?? []).filter((i) => i.status === 'partial' || i.status === 'carried_over'));
      const tally: Record<string, number> = {};
      for (const i of [...incomplete, ...recentIncomplete]) tally[i.subjectId] = (tally[i.subjectId] ?? 0) + 1;
      const mostPostponed = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      const windowTally: Record<number, number> = {};
      for (const i of incomplete) {
        const bucket = Math.floor(timeToMinutes(i.startTime) / 120) * 120;
        windowTally[bucket] = (windowTally[bucket] ?? 0) + 1;
      }
      const topWindow = Object.entries(windowTally).sort((a, b) => b[1] - a[1])[0];
      const lowFocusWindow = topWindow ? `${minutesToTime(Number(topWindow[0]))}~${minutesToTime(Number(topWindow[0]) + 120)}` : null;

      const tomorrowBlocks = state.scheduleBlocks[tomorrow] ?? [];
      const gaps = computeFreeGaps(tomorrowBlocks);
      const availableMinutesTomorrow = sumFreeMinutes(gaps);
      const condition = state.conditions[today] ?? null;

      try {
        const { data, error } = await supabase.functions.invoke('tomorrow-recommendation', {
          body: {
            completion_rate: progress.percent,
            incomplete_items: incomplete.map((i) => ({ subject_label: getSubject(i.subjectId).label, material: i.material, unit: i.unit, page_range: i.pageRange })),
            most_postponed_subject_label: mostPostponed ? getSubject(mostPostponed as any).label : null,
            fatigue_high: (condition?.fatigue ?? 0) >= 4,
            tomorrow_free_gaps: gaps,
            main_subject_labels: (state.profile?.mainSubjects ?? []).map((s) => getSubject(s).label),
          },
        });

        if (error || !data || data.error) {
          throw new Error(data?.error ?? error?.message ?? 'unknown error');
        }

        const items: TomorrowRecommendationItem[] = (data.items as any[]).map((it) => ({
          subjectId: subjectIdFromLabel(it.subject_label),
          studyType: it.study_type as StudyTypeId,
          material: it.material,
          unit: it.unit,
          pageRange: it.page_range,
          difficulty: it.difficulty as DifficultyId,
          mustDo: it.must_do,
          startTime: it.start_time,
          endTime: it.end_time,
          estimatedMinutes: it.estimated_minutes,
          reason: it.reason,
        }));

        setRecommendation({
          completionRate: progress.percent,
          incompleteCount: incomplete.length,
          lowFocusWindow,
          availableMinutesTomorrow,
          reasons: data.reasons as string[],
          items,
        });
      } catch (err) {
        // AI 추천 실패해도 화면이 깨지지 않고 안내만 보여준다 — study-planner EveningPlanScreen과 동일한 폴백 원칙.
        setErrorMessage('AI 추천을 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
      } finally {
        setLoading(false);
      }
    };

    fetchRecommendation();
  }, []);

  const handleApply = () => {
    if (!recommendation) return;
    actions.applyTomorrowRecommendation(tomorrow, recommendation.items);
    setApplied(true);
    setTimeout(onApplied, 900);
  };

  return (
    <div className="pb-10">
      <BackBar title="AI 내일 플래너 추천" onBack={onBack} />
      <div className="px-5 pt-2">
        {loading && <p className="text-sm text-on-surface-variant text-center py-10">추천을 준비하고 있어요...</p>}

        {!loading && errorMessage && (
          <Card className="text-center py-6">
            <p className="text-sm text-on-surface-variant">{errorMessage}</p>
          </Card>
        )}

        {!loading && recommendation && (
          <>
            <div className="rounded-3xl bg-gradient-to-br from-tertiary-container/40 to-primary-container/30 p-5 mb-5">
              <span className="inline-block text-xs font-bold bg-white/60 rounded-full px-3 py-1 mb-2">AI 버디의 제안</span>
              <h1 className="text-xl font-extrabold mb-4">내일 학습 추천 초안</h1>

              <div className="grid grid-cols-2 gap-3 mb-4">
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
                <div className="bg-white/70 rounded-xl p-3">
                  <p className="text-xs text-on-surface-variant">내일 공부 가능</p>
                  <p className="text-lg font-bold">{formatMinutes(recommendation.availableMinutesTomorrow)}</p>
                </div>
              </div>

              <div className="flex items-start gap-2 mb-1">
                <Icon name="info" className="!text-[18px] text-primary mt-0.5" />
                <span className="text-sm font-bold">추천 근거 & 조정 포인트</span>
              </div>
              <ul className="list-disc list-inside text-sm text-on-surface-variant space-y-1">
                {recommendation.reasons.length ? recommendation.reasons.map((r, i) => <li key={i}>{r}</li>) : <li>오늘 계획을 잘 지켰어요. 내일도 비슷한 흐름으로 진행해요.</li>}
              </ul>
            </div>

            <h2 className="text-base font-bold mb-3">내일의 추천 학습 순서 (총 {recommendation.items.length}개)</h2>
            <div className="space-y-3 mb-6">
              {recommendation.items.length === 0 && <p className="text-sm text-on-surface-variant text-center py-6">추천할 항목이 아직 없어요. 오늘 플래너를 먼저 작성해보세요.</p>}
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
                <p className="text-xs text-on-surface-variant text-center mb-3">적용하면 내일 플래너에 {recommendation.items.length}개 항목이 추가돼요.</p>
                <Button className="w-full" onClick={handleApply} disabled={applied}>
                  {applied ? '완료! ✓' : '내일 플래너로 적용'}
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
