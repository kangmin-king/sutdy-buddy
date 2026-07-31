import { computeFreeGaps, sumFreeMinutes, getBestGap, withEul } from './lib';
import { getSubject } from './constants';
import type { DailyCondition, PlannerItem, ScheduleBlock, DifficultyId } from './types';

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
  // Filter out gaps that are too small to be practically useful (less than 10 minutes)
  const usefulGaps = gaps.filter((g) => g.minutes >= 10);
  const bestGap = getBestGap(usefulGaps);
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
