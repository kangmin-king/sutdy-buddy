import { describe, it, expect } from 'vitest';
import { getHomeTip, recommendedDifficultyFor, getScheduleTip, getTomorrowRecommendation, getWeeklyPattern } from './ai';
import type { DailyCondition, PlannerItem, ScheduleBlock } from './types';

function condition(overrides: Partial<DailyCondition>): DailyCondition {
  return { date: '2026-07-30', sleepHours: 7, fatigue: 3, focus: 3, mood: 'neutral', notes: '', ...overrides };
}

function item(overrides: Partial<PlannerItem>): PlannerItem {
  return {
    id: 'p1', date: '2026-07-30', order: 1, subjectId: 'math', startTime: '19:00',
    studyType: null, material: '', unit: '', pageRange: '', endTime: null, difficulty: null,
    restPattern: null, mustDo: false, status: 'planned', actualMinutes: null, understanding: null,
    partialReason: null, incompleteReason: null, source: 'self', homeworkAssignmentId: null, examSubjectRangeId: null, ...overrides,
  };
}

describe('getHomeTip', () => {
  it('asks for condition input when none exists', () => {
    expect(getHomeTip(null, [], null).tone).toBe('neutral');
  });
  it('asks to plan when planner is empty', () => {
    const tip = getHomeTip(condition({}), [], null);
    expect(tip.message).toContain('플래너가 비어있어요');
  });
  it('celebrates when everything is completed', () => {
    const items = [item({ status: 'completed' })];
    expect(getHomeTip(condition({}), items, null).tone).toBe('encouraging');
  });
  it('suggests only the must-do item when fatigue is high', () => {
    const mustDo = item({ mustDo: true, id: 'm1' });
    const tip = getHomeTip(condition({ fatigue: 5 }), [mustDo, item({ id: 'p2' })], mustDo);
    expect(tip.message).toContain('수학');
  });
});

describe('recommendedDifficultyFor', () => {
  it('recommends hard when focus is high and fatigue is low', () => {
    expect(recommendedDifficultyFor(condition({ focus: 5, fatigue: 1 }))).toBe('hard');
  });
  it('recommends easy when fatigue is high', () => {
    expect(recommendedDifficultyFor(condition({ fatigue: 5 }))).toBe('easy');
  });
  it('defaults to medium', () => {
    expect(recommendedDifficultyFor(condition({}))).toBe('medium');
  });
  it('defaults to medium when there is no condition yet', () => {
    expect(recommendedDifficultyFor(null)).toBe('medium');
  });
});

function block(overrides: Partial<ScheduleBlock>): ScheduleBlock {
  return { id: 'b1', date: '2026-07-30', type: 'school', label: '학교', startTime: '08:00', endTime: '16:00', ...overrides };
}

describe('getScheduleTip', () => {
  it('asks to register a schedule when there are no blocks', () => {
    expect(getScheduleTip([], null)).toContain('일정을 등록');
  });
  it('asks for condition when blocks exist but condition is missing', () => {
    expect(getScheduleTip([block({})], null)).toContain('컨디션');
  });
  it('names the postponed subject and a difficulty in the tip', () => {
    const result = getScheduleTip([block({})], condition({}), '영어');
    expect(result).toContain('영어');
  });
  it('never claims a specific amount of free time', () => {
    const result = getScheduleTip([block({})], condition({ fatigue: 5 }));
    expect(result).not.toMatch(/\d+분|\d+시간/);
  });
});

describe('getTomorrowRecommendation', () => {
  it('returns zeroed-out defaults when there is no data at all', () => {
    const result = getTomorrowRecommendation({
      todayPlannerItems: [],
      todayCondition: null,
      tomorrowScheduleBlocks: [],
      recentPlannerItems: [],
      mainSubjects: [],
    });
    expect(result).toEqual({
      completionRate: 0,
      incompleteCount: 0,
      lowFocusWindow: null,
      reasons: [],
      items: [],
    });
  });

  it('computes completion rate from today\'s items', () => {
    const items = [
      item({ id: '1', status: 'completed' }),
      item({ id: '2', status: 'completed' }),
      item({ id: '3', status: 'partial' }),
      item({ id: '4', status: 'planned' }),
    ];
    const result = getTomorrowRecommendation({
      todayPlannerItems: items,
      todayCondition: null,
      tomorrowScheduleBlocks: [],
      recentPlannerItems: [],
      mainSubjects: [],
    });
    expect(result.completionRate).toBe(50);
    expect(result.incompleteCount).toBe(1); // only the 'partial' one counts, 'planned' isn't incomplete-yet
  });

  it('prioritizes incomplete items into the recommendation, marking the first one must-do', () => {
    const items = [item({ id: '1', subjectId: 'math', status: 'partial', material: '쎈 수학', startTime: '19:00' })];
    const result = getTomorrowRecommendation({
      todayPlannerItems: items,
      todayCondition: null,
      tomorrowScheduleBlocks: [],
      recentPlannerItems: [],
      mainSubjects: [],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].subjectId).toBe('math');
    expect(result.items[0].material).toBe('쎈 수학');
    expect(result.items[0].mustDo).toBe(true);
    expect(result.reasons.some((r) => r.includes('수학'))).toBe(true);
  });

  it('caps difficulty to medium and explains why when fatigue is high', () => {
    const items = [item({ id: '1', status: 'partial' })];
    const result = getTomorrowRecommendation({
      todayPlannerItems: items,
      todayCondition: condition({ fatigue: 5 }), // high fatigue: base difficulty would be 'easy', capped to 'medium' either way
      tomorrowScheduleBlocks: [],
      recentPlannerItems: [],
      mainSubjects: [],
    });
    expect(result.items[0].difficulty).toBe('medium');
    expect(result.reasons.some((r) => r.includes('피로도'))).toBe(true);
  });

  it('backfills with an unstudied main subject when fewer than 2 items are recommended', () => {
    const items = [item({ id: '1', subjectId: 'math', status: 'completed' })];
    const result = getTomorrowRecommendation({
      todayPlannerItems: items,
      todayCondition: null,
      tomorrowScheduleBlocks: [],
      recentPlannerItems: [],
      mainSubjects: ['math', 'english'],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].subjectId).toBe('english'); // math was already studied today, skipped
    expect(result.items[0].difficulty).toBe('easy');
  });

  it('places recommended items after tomorrow\'s registered schedule, not today\'s', () => {
    const items = [item({ id: '1', status: 'partial' })];
    const result = getTomorrowRecommendation({
      todayPlannerItems: items,
      todayCondition: null,
      tomorrowScheduleBlocks: [block({ startTime: '08:00', endTime: '16:00' })],
      recentPlannerItems: [],
      mainSubjects: [],
    });
    expect(result.items[0].startTime >= '16:00').toBe(true);
  });
});

describe('getWeeklyPattern', () => {
  it('returns zeroed defaults when there is no data at all', () => {
    expect(getWeeklyPattern([], [])).toEqual({ weeklyCompletionRate: 0, mostPostponedSubject: null, totalItems: 0 });
  });

  it('computes completion rate across recent + today items combined', () => {
    const recent = [item({ id: '1', status: 'completed' }), item({ id: '2', status: 'planned' })];
    const today = [item({ id: '3', status: 'completed' })];
    const result = getWeeklyPattern(recent, today);
    expect(result.totalItems).toBe(3);
    expect(result.weeklyCompletionRate).toBe(67);
  });

  it('finds the most frequently postponed subject across the week', () => {
    const recent = [
      item({ id: '1', subjectId: 'math', status: 'partial' }),
      item({ id: '2', subjectId: 'math', status: 'carried_over' }),
      item({ id: '3', subjectId: 'english', status: 'partial' }),
    ];
    const result = getWeeklyPattern(recent, []);
    expect(result.mostPostponedSubject).toBe('math');
  });

  it('has no postponed subject when nothing was postponed', () => {
    const recent = [item({ id: '1', status: 'completed' }), item({ id: '2', status: 'planned' })];
    expect(getWeeklyPattern(recent, []).mostPostponedSubject).toBeNull();
  });
});
