import { computeFreeGaps, sumFreeMinutes, getBestGap, withEul, timeToMinutes, minutesToTime } from './lib';
import { getSubject } from './constants';
import type { DailyCondition, PlannerItem, ScheduleBlock, DifficultyId, SubjectId, StudyTypeId, TomorrowRecommendation, TomorrowRecommendationItem } from './types';

export function getHomeTip(condition: DailyCondition | null, plannerItems: PlannerItem[], mustDoItem: PlannerItem | null) {
  if (!condition) {
    return { message: '오늘 컨디션을 입력하면 더 정확한 조언을 드릴 수 있어요!', tone: 'neutral' as const };
  }
  if (!plannerItems || plannerItems.length === 0) {
    return { message: '아직 오늘 플래너가 비어있어요. 지금 계획을 세워볼까요?', tone: 'neutral' as const };
  }
  const completed = plannerItems.filter((i) => i.status === 'completed').length;
  if (completed === plannerItems.length) {
    return { message: '오늘 계획을 모두 완료했어요! 정말 잘했어요 🎉', tone: 'encouraging' as const };
  }
  if (condition.fatigue >= 4) {
    const label = mustDoItem ? `${getSubject(mustDoItem.subjectId).label} 과제` : '필수 과제';
    return { message: `오늘은 피로도가 높아요. ${label}만 마쳐도 충분해요.`, tone: 'encouraging' as const };
  }
  if (mustDoItem && mustDoItem.status !== 'completed') {
    return {
      message: `${mustDoItem.material || getSubject(mustDoItem.subjectId).label}: ${mustDoItem.unit || ''}만 마치면 오늘 목표 달성이에요.`,
      tone: 'encouraging' as const,
    };
  }
  return { message: '오늘도 한 걸음씩 나아가고 있어요. 화이팅!', tone: 'encouraging' as const };
}

export function recommendedDifficultyFor(condition: DailyCondition | null): DifficultyId {
  if (!condition) return 'medium';
  if (condition.focus >= 4 && condition.fatigue <= 2) return 'hard';
  if (condition.fatigue >= 4 || condition.focus <= 2) return 'easy';
  return 'medium';
}

export function getFreeTimeAndSuggestion(blocks: ScheduleBlock[], condition: DailyCondition | null, mostPostponedSubjectLabel?: string) {
  const gaps = computeFreeGaps(blocks);
  const totalFreeMinutes = sumFreeMinutes(gaps);
  const bestGap = getBestGap(gaps);
  const recommendedDifficulty = recommendedDifficultyFor(condition);

  let suggestionText: string;
  if (!bestGap) {
    suggestionText = '오늘은 빈 시간이 거의 없어요. 짧게라도 복습해볼까요?';
  } else {
    const hours = (bestGap.minutes / 60).toFixed(1).replace(/\.0$/, '');
    const firstBlock = Math.min(90, bestGap.minutes);
    const subjectPhrase = mostPostponedSubjectLabel || '핵심 과목';
    suggestionText = `오늘 ${bestGap.start} 이후로 ${hours}시간이 비어 있어요. 첫 ${firstBlock}분은 ${withEul(subjectPhrase)} 학습을 추천해요.`;
  }

  return { freeGaps: gaps, totalFreeMinutes, bestGap, recommendedDifficulty, suggestionText };
}

// 규칙 기반 "내일 추천" — OpenAI 크레딧이 없어도 동작하는 무료 폴백.
// study-buddy 프로토타입의 getTomorrowRecommendation을 이 프로젝트의 타입에 맞게 이식했다.
// TomorrowRecommendationScreen이 Edge Function 대신 이 함수를 직접 호출한다.
export function getTomorrowRecommendation({
  todayPlannerItems,
  todayCondition,
  tomorrowScheduleBlocks,
  recentPlannerItems,
  mainSubjects,
}: {
  todayPlannerItems: PlannerItem[];
  todayCondition: DailyCondition | null;
  tomorrowScheduleBlocks: ScheduleBlock[];
  recentPlannerItems: PlannerItem[];
  mainSubjects: SubjectId[];
}): TomorrowRecommendation {
  const total = todayPlannerItems.length;
  const completed = todayPlannerItems.filter((i) => i.status === 'completed').length;
  const completionRate = total === 0 ? 0 : Math.round((completed / total) * 100);
  const incompleteItems = todayPlannerItems.filter((i) => i.status === 'partial' || i.status === 'carried_over');

  const reasons: string[] = [];

  // 1) 미룬 과목 분석
  const subjectTally: Partial<Record<SubjectId, number>> = {};
  for (const i of [...incompleteItems, ...recentPlannerItems.filter((i) => i.status === 'partial' || i.status === 'carried_over')]) {
    subjectTally[i.subjectId] = (subjectTally[i.subjectId] ?? 0) + 1;
  }
  const topSubjects = (Object.entries(subjectTally) as [SubjectId, number][]).sort((a, b) => b[1] - a[1]).map(([id]) => id);
  if (topSubjects.length) {
    reasons.push(`미완료된 ${withEul(getSubject(topSubjects[0]).label)} 우선 배치하여 흐름을 유지했어요.`);
  }

  // 2) 미룬 시간대 분석 (2시간 단위 버킷)
  const windowTally: Record<number, number> = {};
  for (const i of incompleteItems) {
    const bucket = Math.floor(timeToMinutes(i.startTime || '00:00') / 120) * 120;
    windowTally[bucket] = (windowTally[bucket] ?? 0) + 1;
  }
  let lowFocusWindow: string | null = null;
  const windowEntries = Object.entries(windowTally).sort((a, b) => b[1] - a[1]);
  if (windowEntries.length) {
    const bucketStart = Number(windowEntries[0][0]);
    lowFocusWindow = `${minutesToTime(bucketStart)}~${minutesToTime(bucketStart + 120)}`;
    reasons.push('낮은 집중도 시간을 피해 휴식 시간을 조정했어요.');
  }

  // 3) 컨디션 반영
  const baseDifficulty = recommendedDifficultyFor(todayCondition);
  const cappedDifficulty: DifficultyId = todayCondition && todayCondition.fatigue >= 4 ? 'medium' : baseDifficulty;
  if (todayCondition && todayCondition.fatigue >= 4) {
    reasons.push("컨디션 분석: 피로도가 높아 난이도를 '보통'으로 하향 조정했어요.");
  }

  // 4) 내일 빈 시간
  const gaps = computeFreeGaps(tomorrowScheduleBlocks)
    .slice()
    .sort((a, b) => b.minutes - a.minutes);
  const availableMinutesTomorrow = sumFreeMinutes(gaps);

  // 5) 우선순위: 미완료 항목을 미룬 과목 순으로 정렬
  const ordered = incompleteItems.slice().sort((a, b) => {
    const ai = topSubjects.indexOf(a.subjectId);
    const bi = topSubjects.indexOf(b.subjectId);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const items: TomorrowRecommendationItem[] = [];
  let gapIndex = 0;
  let remainingInGap = gaps[0] ? gaps[0].minutes : 0;
  let cursorTime = gaps[0] ? gaps[0].start : '19:00';

  function takeSlot(estimatedMinutes: number) {
    while (gapIndex < gaps.length && remainingInGap < 20) {
      gapIndex++;
      remainingInGap = gaps[gapIndex] ? gaps[gapIndex].minutes : 0;
      cursorTime = gaps[gapIndex] ? gaps[gapIndex].start : cursorTime;
    }
    const minutes = Math.min(estimatedMinutes, Math.max(remainingInGap, 20));
    const startTime = cursorTime;
    const endTime = minutesToTime(timeToMinutes(startTime) + minutes);
    remainingInGap -= minutes;
    cursorTime = endTime;
    return { startTime, endTime, minutes };
  }

  ordered.slice(0, 3).forEach((item, idx) => {
    const slot = takeSlot(idx === 0 ? 90 : 60);
    const studyType: StudyTypeId = item.status === 'carried_over' ? 'practice' : (item.studyType ?? 'concept');
    items.push({
      subjectId: item.subjectId,
      studyType,
      material: item.material,
      unit: item.unit,
      pageRange: item.pageRange,
      difficulty: cappedDifficulty,
      mustDo: idx === 0,
      startTime: slot.startTime,
      endTime: slot.endTime,
      estimatedMinutes: slot.minutes,
      reason: idx === 0 ? '오늘 미완료된 항목이라 뇌가 가장 맑을 때 배치했어요.' : '이전 학습 후 리프레시를 위해 복습 위주로 배치했어요.',
    });
  });

  // 6) 항목이 2개 미만이면 아직 안 다룬 주요 과목으로 채운다
  if (items.length < 2 && mainSubjects.length) {
    const studiedToday = new Set(todayPlannerItems.map((i) => i.subjectId));
    const candidate = mainSubjects.find((s) => !studiedToday.has(s) && !items.some((i) => i.subjectId === s));
    if (candidate) {
      const slot = takeSlot(45);
      items.push({
        subjectId: candidate,
        studyType: 'concept',
        material: '',
        unit: '',
        pageRange: '',
        difficulty: 'easy',
        mustDo: false,
        startTime: slot.startTime,
        endTime: slot.endTime,
        estimatedMinutes: slot.minutes,
        reason: `아직 학습하지 않은 ${withEul(getSubject(candidate).label)} 가볍게 시작해봐요.`,
      });
    }
  }

  return {
    completionRate,
    incompleteCount: incompleteItems.length,
    lowFocusWindow,
    availableMinutesTomorrow,
    reasons: [...new Set(reasons)],
    items: items.slice(0, 4),
  };
}
