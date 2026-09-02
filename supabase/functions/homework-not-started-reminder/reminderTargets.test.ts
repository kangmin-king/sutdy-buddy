import { describe, it, expect } from 'vitest';
import { selectReminderTargets } from './reminderTargets';
import type { HomeworkItem } from './reminderTargets';
// 테스트도 실제 기본값을 그대로 쓴다 — 여기에 '21:00'을 또 적으면 기본값을 바꿨을 때
// 테스트만 옛 값으로 통과한다.
import { DEFAULT_HOMEWORK_REMIND_AT } from '../_shared/homeworkReminder';

function item(overrides: Partial<HomeworkItem>): HomeworkItem {
  return { id: 'h1', studentId: 's1', status: 'planned', ...overrides };
}

function select(params: {
  now: string;
  homeworkItems: HomeworkItem[];
  settings?: Record<string, { remindAt: string; enabled: boolean }>;
  startedItemIds?: string[];
}) {
  return selectReminderTargets({
    now: params.now,
    homeworkItems: params.homeworkItems,
    settings: params.settings ?? {},
    startedItemIds: params.startedItemIds ?? [],
    defaultRemindAt: DEFAULT_HOMEWORK_REMIND_AT,
  });
}

// 시각 비교 자체를 보는 테스트는 기본값에 기대지 않고 설정을 직접 넣는다 —
// 기본값을 바꿨을 때 무관한 테스트까지 깨지면 원인을 찾기 어렵다.
const AT_21 = { s1: { remindAt: '21:00', enabled: true } };

describe('selectReminderTargets', () => {
  it('알림 시각이 지났고 시작한 게 없으면 대상이다', () => {
    const targets = select({ now: '21:00', homeworkItems: [item({}), item({ id: 'h2' })], settings: AT_21 });
    expect(targets).toEqual([{ studentId: 's1', remindAt: '21:00', homeworkCount: 2 }]);
  });

  it('알림 시각 전에는 대상이 아니다', () => {
    expect(select({ now: '20:45', homeworkItems: [item({})], settings: AT_21 })).toEqual([]);
  });

  it('설정 행이 없으면 기본 시각을 쓴다', () => {
    // 기본값을 바꿔도 이 테스트는 그대로 유효해야 하므로 상수를 그대로 쓴다.
    expect(select({ now: '00:00', homeworkItems: [item({})] })).toEqual([]);
    expect(select({ now: DEFAULT_HOMEWORK_REMIND_AT, homeworkItems: [item({})] })).toEqual([
      { studentId: 's1', remindAt: DEFAULT_HOMEWORK_REMIND_AT, homeworkCount: 1 },
    ]);
  });

  it('숙제 하나라도 시작했으면 대상이 아니다', () => {
    const targets = select({
      now: '23:00',
      homeworkItems: [item({ id: 'h1' }), item({ id: 'h2' })],
      startedItemIds: ['h2'],
    });
    expect(targets).toEqual([]);
  });

  it('완료된 항목이 있으면 세션 기록이 없어도 대상이 아니다', () => {
    const targets = select({ now: '23:00', homeworkItems: [item({ id: 'h1', status: 'completed' })] });
    expect(targets).toEqual([]);
  });

  it('알림을 끈 학생은 시각이 지나도 대상이 아니다', () => {
    const targets = select({
      now: '23:00',
      homeworkItems: [item({})],
      settings: { s1: { remindAt: '21:00', enabled: false } },
    });
    expect(targets).toEqual([]);
  });

  it('학생별로 설정한 시각을 따른다 (Postgres time "HH:MM:SS"도 받는다)', () => {
    const items = [item({ id: 'h1', studentId: 's1' }), item({ id: 'h2', studentId: 's2' })];
    const settings = {
      s1: { remindAt: '19:30:00', enabled: true },
      s2: { remindAt: '22:00:00', enabled: true },
    };
    const targets = select({ now: '20:00', homeworkItems: items, settings });
    expect(targets).toEqual([{ studentId: 's1', remindAt: '19:30', homeworkCount: 1 }]);
  });

  it('오늘 숙제가 없으면 아무도 대상이 아니다 — 아무것도 배정하지 않은 날은 잔소리할 것도 없다', () => {
    expect(select({ now: '23:59', homeworkItems: [] })).toEqual([]);
  });

  it('한 학생이 시작했어도 다른 학생은 따로 판정한다', () => {
    const items = [
      item({ id: 'h1', studentId: 's1' }),
      item({ id: 'h2', studentId: 's2' }),
      item({ id: 'h3', studentId: 's2' }),
    ];
    const settings = {
      s1: { remindAt: '21:00', enabled: true },
      s2: { remindAt: '21:00', enabled: true },
    };
    const targets = select({ now: '21:00', homeworkItems: items, settings, startedItemIds: ['h1'] });
    expect(targets).toEqual([{ studentId: 's2', remindAt: '21:00', homeworkCount: 2 }]);
  });
});
