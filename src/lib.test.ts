import { describe, it, expect } from 'vitest';
import {
  timeToMinutes,
  minutesToTime,
  formatMinutes,
  computeFreeGaps,
  sumFreeMinutes,
  getBestGap,
  getPlannerProgress,
  withEul,
  resolveQuickTimeChip,
  computeMaterialPace,
  addDaysToKey,
  uid,
} from './lib';
import type { ScheduleBlock, PlannerItem, StudyMaterial } from './types';

describe('timeToMinutes / minutesToTime', () => {
  it('converts HH:MM to minutes and back', () => {
    expect(timeToMinutes('09:30')).toBe(570);
    expect(minutesToTime(570)).toBe('09:30');
  });
});

describe('formatMinutes', () => {
  it('formats minutes into 시간/분 Korean text', () => {
    expect(formatMinutes(0)).toBe('0분');
    expect(formatMinutes(45)).toBe('45분');
    expect(formatMinutes(60)).toBe('1시간');
    expect(formatMinutes(125)).toBe('2시간 5분');
  });
});

function block(overrides: Partial<ScheduleBlock>): ScheduleBlock {
  return {
    id: 'b1',
    date: '2026-07-30',
    type: 'school',
    label: '학교',
    startTime: '08:00',
    endTime: '16:00',
    ...overrides,
  };
}

describe('computeFreeGaps', () => {
  it('returns the whole window when there are no blocks', () => {
    const gaps = computeFreeGaps([], '07:00', '23:00');
    expect(gaps).toEqual([{ start: '07:00', end: '23:00', minutes: 960 }]);
  });

  it('excludes busy ranges and merges overlaps', () => {
    const blocks = [block({ startTime: '08:00', endTime: '16:00' }), block({ id: 'b2', startTime: '15:30', endTime: '17:00' })];
    const gaps = computeFreeGaps(blocks, '07:00', '23:00');
    expect(gaps).toEqual([
      { start: '07:00', end: '08:00', minutes: 60 },
      { start: '17:00', end: '23:00', minutes: 360 },
    ]);
  });

  it('drops gaps shorter than 10 minutes', () => {
    const blocks = [block({ startTime: '07:00', endTime: '07:55' }), block({ id: 'b2', startTime: '08:00', endTime: '23:00' })];
    const gaps = computeFreeGaps(blocks, '07:00', '23:00');
    expect(gaps).toEqual([]);
  });
});

describe('sumFreeMinutes / getBestGap', () => {
  const gaps = [
    { start: '07:00', end: '08:00', minutes: 60 },
    { start: '17:00', end: '23:00', minutes: 360 },
  ];
  it('sums minutes across gaps', () => {
    expect(sumFreeMinutes(gaps)).toBe(420);
  });
  it('returns the largest gap', () => {
    expect(getBestGap(gaps)).toEqual(gaps[1]);
  });
  it('returns null for an empty gap list', () => {
    expect(getBestGap([])).toBeNull();
  });
});

function plannerItem(overrides: Partial<PlannerItem>): PlannerItem {
  return {
    id: 'p1',
    date: '2026-07-30',
    order: 1,
    subjectId: 'math',
    startTime: '19:00',
    studyType: null,
    material: '',
    unit: '',
    pageRange: '',
    endTime: null,
    difficulty: null,
    restPattern: null,
    mustDo: false,
    status: 'planned',
    actualMinutes: null,
    understanding: null,
    partialReason: null,
    incompleteReason: null,
    ...overrides,
  };
}

describe('getPlannerProgress', () => {
  it('returns 0 percent for an empty list', () => {
    expect(getPlannerProgress([])).toEqual({ percent: 0, completed: 0, total: 0 });
  });
  it('computes percent completed', () => {
    const items = [plannerItem({ id: 'a', status: 'completed' }), plannerItem({ id: 'b', status: 'planned' })];
    expect(getPlannerProgress(items)).toEqual({ percent: 50, completed: 1, total: 2 });
  });
});

describe('withEul', () => {
  it('appends 을 after a syllable with batchim', () => {
    expect(withEul('수학')).toBe('수학을');
  });
  it('appends 를 after a syllable without batchim', () => {
    expect(withEul('영어')).toBe('영어를');
  });
});

describe('resolveQuickTimeChip', () => {
  const blocks = [block({ type: 'school', label: '학교', startTime: '08:00', endTime: '16:00' })];

  it('resolves "now" to the current time', () => {
    expect(resolveQuickTimeChip('now', blocks, '14:00')).toBe('14:00');
  });

  it('resolves "after_school" to 10 minutes after the last matching block today', () => {
    expect(resolveQuickTimeChip('after_school', blocks, '10:00')).toBe('16:10');
  });

  it('falls back to a constant when there is no matching block', () => {
    expect(resolveQuickTimeChip('after_school', [], '10:00')).toBe('17:00');
  });

  it('resolves the remaining presets to their constants', () => {
    expect(resolveQuickTimeChip('after_dinner', [], '10:00')).toBe('19:30');
    expect(resolveQuickTimeChip('before_sleep', [], '10:00')).toBe('22:00');
  });
});

function material(overrides: Partial<StudyMaterial>): StudyMaterial {
  return {
    id: 'm1',
    subjectId: 'math',
    materialName: '개념원리',
    totalScope: 220,
    currentProgress: 0,
    targetPasses: 1,
    targetDate: '2026-08-18', // today(07-30) + 19 days
    sessionIntervalDays: 3,
    createdAt: '2026-07-30T00:00:00.000Z',
    ...overrides,
  };
}

describe('computeMaterialPace', () => {
  it('computes remaining sessions and per-session scope', () => {
    const pace = computeMaterialPace(material({}), '2026-07-30');
    // 19일 남음, 3일에 1번 -> floor(19/3) = 6세션, 220p 남음 -> ceil(220/6) = 37
    expect(pace).toEqual({ remainingDays: 19, remainingSessions: 6, remainingScope: 220, scopePerSession: 37, isOverdue: false });
  });

  it('accounts for progress and multiple passes', () => {
    const pace = computeMaterialPace(material({ totalScope: 120, currentProgress: 24, targetPasses: 2, targetDate: '2026-08-11' }), '2026-07-30');
    // 12일 남음, 3일에 1번 -> 4세션. 남은분량 = 120*2 - 24 = 216 -> ceil(216/4) = 54
    expect(pace).toEqual({ remainingDays: 12, remainingSessions: 4, remainingScope: 216, scopePerSession: 54, isOverdue: false });
  });

  it('flags overdue targets instead of dividing by zero', () => {
    const pace = computeMaterialPace(material({ targetDate: '2026-07-29' }), '2026-07-30');
    expect(pace).toEqual({ remainingDays: -1, remainingSessions: 0, remainingScope: 220, scopePerSession: 0, isOverdue: true });
  });
});

describe('addDaysToKey', () => {
  it('adds days across a month boundary', () => {
    expect(addDaysToKey('2026-07-30', 3)).toBe('2026-08-02');
  });
});

describe('uid', () => {
  it('generates a valid UUID (DB primary key columns are typed uuid)', () => {
    expect(uid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
