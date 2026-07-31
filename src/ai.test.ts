import { describe, it, expect } from 'vitest';
import { getHomeTip, recommendedDifficultyFor, getFreeTimeAndSuggestion } from './ai';
import type { DailyCondition, PlannerItem, ScheduleBlock } from './types';

function condition(overrides: Partial<DailyCondition>): DailyCondition {
  return { date: '2026-07-30', sleepHours: 7, fatigue: 3, focus: 3, mood: 'neutral', notes: '', ...overrides };
}

function item(overrides: Partial<PlannerItem>): PlannerItem {
  return {
    id: 'p1', date: '2026-07-30', order: 1, subjectId: 'math', startTime: '19:00',
    studyType: null, material: '', unit: '', pageRange: '', endTime: null, difficulty: null,
    restPattern: null, mustDo: false, status: 'planned', actualMinutes: null, understanding: null,
    partialReason: null, incompleteReason: null, ...overrides,
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

describe('getFreeTimeAndSuggestion', () => {
  it('suggests a short review session when there is no free gap', () => {
    const result = getFreeTimeAndSuggestion([block({ startTime: '00:00', endTime: '23:59' })], null);
    expect(result.bestGap).toBeNull();
    expect(result.suggestionText).toContain('복습');
  });
  it('names the best gap and a subject in the suggestion', () => {
    const result = getFreeTimeAndSuggestion([block({})], condition({}), '영어');
    expect(result.suggestionText).toContain('영어');
    expect(result.bestGap?.start).toBe('16:00');
  });
});
