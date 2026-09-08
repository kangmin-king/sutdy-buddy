import { describe, expect, it } from 'vitest';
import type { PlannerItem, StudySession } from '../../types';
import { buildStudentHomeModel, canStartStudyItem, deriveRunningSessionIds, filterOpenRunningSessions, findStaleRunningSessions, groupItemsByManager } from './studentHomeModel';
import { SESSION_MAX_MILLIS } from '../distractionStopModel';
import { MAX_SESSION_SECONDS } from './studySessionModel';

function item(id: string, order: number, status: PlannerItem['status'] = 'planned'): PlannerItem {
  return {
    id,
    date: '2026-08-21',
    order,
    subjectId: 'math',
    startTime: '18:00',
    studyType: null,
    material: id,
    unit: '',
    pageRange: '',
    endTime: null,
    difficulty: null,
    restPattern: null,
    mustDo: false,
    status,
    actualMinutes: null,
    understanding: null,
    partialReason: null,
    incompleteReason: null,
    source: 'self',
    homeworkAssignmentId: null,
    examSubjectRangeId: null,
  };
}

function session(id: string, plannerItemId: string, overrides: Partial<StudySession> = {}): StudySession {
  return {
    id,
    plannerItemId,
    startedAt: '2026-08-21T09:00:00.000Z',
    endedAt: '2026-08-21T09:10:00.000Z',
    durationSeconds: 600,
    autoClosed: false,
    ...overrides,
  };
}

describe('buildStudentHomeModel', () => {
  it('returns an empty home state when there are no items', () => {
    expect(buildStudentHomeModel([], {}, {}, Date.parse('2026-08-21T09:20:00.000Z'))).toEqual({
      currentItem: null,
      nextItems: [],
      completedCount: 0,
      totalCount: 0,
      currentElapsedSeconds: 0,
      elapsedSecondsByItemId: {},
    });
  });

  it('prioritizes the running item over an earlier incomplete item', () => {
    const first = item('first', 1);
    const running = item('running', 2);

    const model = buildStudentHomeModel(
      [first, running],
      { running: [session('active', 'running', { endedAt: null, durationSeconds: null })] },
      { running: 'active' },
      Date.parse('2026-08-21T09:05:00.000Z'),
    );

    expect(model.currentItem).toBe(running);
  });

  it('falls back to the first incomplete item in order', () => {
    const later = item('later', 5);
    const completed = item('done', 1, 'completed');
    const firstIncomplete = item('first-incomplete', 3, 'partial');

    const model = buildStudentHomeModel([later, completed, firstIncomplete], {}, {}, Date.now());

    expect(model.currentItem).toBe(firstIncomplete);
  });

  it('returns remaining incomplete items as next items in order', () => {
    const third = item('third', 3);
    const first = item('first', 1);
    const done = item('done', 2, 'completed');
    const fourth = item('fourth', 4, 'carried_over');

    const model = buildStudentHomeModel([third, first, done, fourth], {}, {}, Date.now());

    expect(model.nextItems).toEqual([third, fourth]);
  });

  it('counts completed and total items independently of the visible queue', () => {
    const model = buildStudentHomeModel(
      [item('one', 1, 'completed'), item('two', 2), item('three', 3, 'completed')],
      {},
      {},
      Date.now(),
    );

    expect(model.completedCount).toBe(2);
    expect(model.totalCount).toBe(3);
  });

  it('accumulates ended sessions and the current running session for the current item', () => {
    const current = item('current', 1);
    const now = Date.parse('2026-08-21T09:05:30.000Z');
    const model = buildStudentHomeModel(
      [current],
      {
        current: [
          session('ended', 'current', { durationSeconds: 125 }),
          session('active', 'current', { startedAt: '2026-08-21T09:03:00.000Z', endedAt: null, durationSeconds: null }),
        ],
      },
      { current: 'active' },
      now,
    );

    expect(model.currentElapsedSeconds).toBe(275);
  });

  // 회귀: 쉬는 시간 표식 처리(usePendingStudyPause)가 세션을 닫아도, 화면이 마운트된 채라면
  // runningSessionId는 닫힌 세션을 계속 가리킨다. endedAt을 보지 않으면 저장된 durationSeconds에
  // 실시간 경과까지 더해져 표시 시간이 두 배가 되고 쉬는 동안 계속 올라갔다.
  it('does not add live elapsed time for a running id that points at a closed session', () => {
    const current = item('current', 1);
    const model = buildStudentHomeModel(
      [current],
      {
        current: [
          session('paused', 'current', {
            startedAt: '2026-08-21T09:00:00.000Z',
            endedAt: '2026-08-21T09:03:00.000Z',
            durationSeconds: 180,
          }),
        ],
      },
      { current: 'paused' },
      Date.parse('2026-08-21T09:20:00.000Z'),
    );

    expect(model.currentElapsedSeconds).toBe(180);
  });

  it('returns accumulated study time for every visible item', () => {
    const current = item('current', 1);
    const next = item('next', 2);
    const model = buildStudentHomeModel(
      [current, next],
      {
        current: [session('current-ended', 'current', { durationSeconds: 125 })],
        next: [session('next-ended', 'next', { durationSeconds: 360 })],
      },
      {},
      Date.parse('2026-08-21T09:20:00.000Z'),
    );

    expect(model.elapsedSecondsByItemId).toEqual({ current: 125, next: 360 });
  });

  it('recovers only the newest unfinished session from visible items', () => {
    const sessions = {
      current: [
        session('older-active', 'current', {
          startedAt: '2026-08-21T09:03:00.000Z',
          endedAt: null,
          durationSeconds: null,
        }),
      ],
      next: [
        session('newer-active', 'next', {
          startedAt: '2026-08-21T09:05:00.000Z',
          endedAt: null,
          durationSeconds: null,
        }),
      ],
      hidden: [
        session('hidden-newest', 'hidden', {
          startedAt: '2026-08-21T09:07:00.000Z',
          endedAt: null,
          durationSeconds: null,
        }),
      ],
    };

    const visibleItemIds = new Set(['current', 'next']);
    expect(deriveRunningSessionIds(sessions, visibleItemIds)).toEqual({ next: 'newer-active' });
    expect(findStaleRunningSessions(sessions, visibleItemIds)).toEqual([
      {
        itemId: 'current',
        sessionId: 'older-active',
        endedAt: '2026-08-21T09:05:00.000Z',
        durationSeconds: 120,
      },
    ]);
  });

  it('uses the same deterministic winner when unfinished sessions share a start time', () => {
    const startedAt = '2026-08-21T09:05:00.000Z';
    const sessions = {
      current: [session('session-a', 'current', { startedAt, endedAt: null, durationSeconds: null })],
      next: [session('session-b', 'next', { startedAt, endedAt: null, durationSeconds: null })],
    };
    const visibleItemIds = new Set(['current', 'next']);

    expect(deriveRunningSessionIds(sessions, visibleItemIds)).toEqual({ next: 'session-b' });
    expect(findStaleRunningSessions(sessions, visibleItemIds)).toEqual([
      { itemId: 'current', sessionId: 'session-a', endedAt: startedAt, durationSeconds: 0 },
    ]);
  });

  // 회귀: 월요일에 열어둔 세션을 수요일에 다시 시작하면, 다음 세션 시작까지의 벽시계 간격을
  // 그대로 쓸 경우 이틀치가 학습 시간으로 잡힌다. 화면 표시/자동 마감과 같은 상한을 걸어야 한다.
  it('caps a stale session gap of multiple days at the session max', () => {
    const sessions = {
      current: [
        session('older-active', 'current', {
          startedAt: '2026-08-17T09:00:00.000Z',
          endedAt: null,
          durationSeconds: null,
        }),
      ],
      next: [
        session('newer-active', 'next', {
          startedAt: '2026-08-19T09:00:00.000Z',
          endedAt: null,
          durationSeconds: null,
        }),
      ],
    };
    const visibleItemIds = new Set(['current', 'next']);

    expect(findStaleRunningSessions(sessions, visibleItemIds)).toEqual([
      {
        itemId: 'current',
        sessionId: 'older-active',
        // 상한이 걸렸으므로 ended_at은 다음 세션의 실제 시작 시각(08-19)이 아니라
        // started_at + 3시간(08-17)이다 — duration_seconds와 항상 같은 순간을 가리켜야 한다.
        endedAt: '2026-08-17T12:00:00.000Z',
        durationSeconds: MAX_SESSION_SECONDS,
      },
    ]);
  });

  it('preserves an honest gap under the session max unchanged', () => {
    const sessions = {
      current: [
        session('older-active', 'current', {
          startedAt: '2026-08-21T09:00:00.000Z',
          endedAt: null,
          durationSeconds: null,
        }),
      ],
      next: [
        session('newer-active', 'next', {
          startedAt: '2026-08-21T10:00:00.000Z',
          endedAt: null,
          durationSeconds: null,
        }),
      ],
    };
    const visibleItemIds = new Set(['current', 'next']);

    expect(findStaleRunningSessions(sessions, visibleItemIds)).toEqual([
      {
        itemId: 'current',
        sessionId: 'older-active',
        endedAt: '2026-08-21T10:00:00.000Z',
        durationSeconds: 3600,
      },
    ]);
  });

  // I4: 방치된 세션을 autoCloseStudySession(항상 auto_closed=true)으로 닫으려면, 이 함수가
  // 내려주는 endedAt이 durationSeconds와 항상 같은 순간을 가리켜야 한다 — 둘 중 하나만 상한이
  // 걸리면 ChecklistTimeline의 합계(durationSeconds)와 막대(startedAt~endedAt)가 다시 갈라진다.
  // 세 개가 연달아 방치된 경우까지 이 불변식이 항목마다 유지되는지 확인한다.
  it('derives endedAt so it always agrees with durationSeconds, across a chain of stale sessions', () => {
    const sessions = {
      first: [
        session('s1', 'first', { startedAt: '2026-08-17T09:00:00.000Z', endedAt: null, durationSeconds: null }),
      ],
      second: [
        session('s2', 'second', { startedAt: '2026-08-19T09:00:00.000Z', endedAt: null, durationSeconds: null }),
      ],
      third: [
        session('s3', 'third', { startedAt: '2026-08-19T09:30:00.000Z', endedAt: null, durationSeconds: null }),
      ],
      newest: [
        session('s4', 'newest', { startedAt: '2026-08-21T09:00:00.000Z', endedAt: null, durationSeconds: null }),
      ],
    };
    const visibleItemIds = new Set(['first', 'second', 'third', 'newest']);

    const stale = findStaleRunningSessions(sessions, visibleItemIds);
    expect(stale).toHaveLength(3);
    expect(stale).toEqual([
      // 08-17 → 08-19 간격은 3시간을 훌쩍 넘으므로 상한이 걸려 endedAt이 다음 세션의 실제
      // 시작 시각이 아니라 startedAt + 3시간이다.
      { itemId: 'first', sessionId: 's1', endedAt: '2026-08-17T12:00:00.000Z', durationSeconds: MAX_SESSION_SECONDS },
      // 08-19 09:00 → 08-19 09:30 간격(30분)은 상한 밑이라 endedAt이 다음 세션의 시작 시각과
      // 정확히 같다.
      { itemId: 'second', sessionId: 's2', endedAt: '2026-08-19T09:30:00.000Z', durationSeconds: 1800 },
      // 08-19 09:30 → 08-21 09:00 간격도 3시간을 훌쩍 넘어 다시 상한이 걸린다.
      { itemId: 'third', sessionId: 's3', endedAt: '2026-08-19T12:30:00.000Z', durationSeconds: MAX_SESSION_SECONDS },
    ]);
  });

  it('allows starting only when no other item is running', () => {
    expect(canStartStudyItem({}, 'next')).toBe(true);
    expect(canStartStudyItem({ current: 'active' }, 'current')).toBe(true);
    expect(canStartStudyItem({ current: 'active' }, 'next')).toBe(false);
  });

  it('does not mutate item order, item objects, sessions, or running-session input', () => {
    const later = item('later', 2);
    const first = item('first', 1);
    const items = [later, first];
    const sessions = { first: [session('ended', 'first')] };
    const runningSessionIds = { first: 'missing-active-session' };
    const itemsBefore = structuredClone(items);
    const sessionsBefore = structuredClone(sessions);
    const runningBefore = structuredClone(runningSessionIds);

    buildStudentHomeModel(items, sessions, runningSessionIds, Date.now());

    expect(items).toEqual(itemsBefore);
    expect(items[0]).toBe(later);
    expect(items[1]).toBe(first);
    expect(sessions).toEqual(sessionsBefore);
    expect(runningSessionIds).toEqual(runningBefore);
  });
});

describe('filterOpenRunningSessions', () => {
  it('keeps an entry whose session is still open', () => {
    const sessions = { 'item-1': [session('s1', 'item-1', { endedAt: null, durationSeconds: null })] };
    expect(filterOpenRunningSessions({ 'item-1': 's1' }, sessions)).toEqual({ 'item-1': 's1' });
  });

  it('drops an entry whose session was closed elsewhere', () => {
    // 셸의 자동 마감이나 쉬는 시간 처리가 닫은 경우. 남겨두면 canStartStudyItem이
    // 키 개수만 보기 때문에 학생이 다른 항목을 시작할 수 없다.
    expect(filterOpenRunningSessions({ 'item-1': 's1' }, { 'item-1': [session('s1', 'item-1')] })).toEqual({});
  });

  it('drops an entry whose session is not in state at all', () => {
    expect(filterOpenRunningSessions({ 'item-1': 's-missing' }, {})).toEqual({});
  });
});

describe('buildStudentHomeModel elapsed cap', () => {
  it('caps the live elapsed time of a forgotten session at three hours', () => {
    const startedAt = '2026-08-21T09:00:00.000Z';
    const nowMs = Date.parse(startedAt) + SESSION_MAX_MILLIS * 4;
    const model = buildStudentHomeModel(
      [item('item-1', 1)],
      { 'item-1': [session('s1', 'item-1', { startedAt, endedAt: null, durationSeconds: null })] },
      { 'item-1': 's1' },
      nowMs,
    );
    expect(model.elapsedSecondsByItemId['item-1']).toBe(MAX_SESSION_SECONDS);
  });
});

describe('groupItemsByManager', () => {
  const labelFor = (managerId: string) => `${managerId} 선생님`;

  it('groups items under their linked manager and keeps self-added items last', () => {
    const a = item('a', 1);
    const b = item('b', 2);
    const mine = item('mine', 3);
    const managerIdOf = (it: PlannerItem) => ({ a: 'm1', b: 'm2' } as Record<string, string>)[it.id] ?? null;

    expect(groupItemsByManager([a, b, mine], managerIdOf, ['m1', 'm2'], labelFor)).toEqual([
      { header: 'm1 선생님', items: [a] },
      { header: 'm2 선생님', items: [b] },
      { header: '직접 추가', items: [mine] },
    ]);
  });

  it('keeps items whose manager is no longer linked instead of dropping them', () => {
    const linked = item('linked', 1);
    const unlinked = item('unlinked', 2);
    const managerIdOf = (it: PlannerItem) =>
      ({ linked: 'm1', unlinked: 'gone' } as Record<string, string>)[it.id] ?? null;

    const groups = groupItemsByManager([linked, unlinked], managerIdOf, ['m1'], labelFor);

    expect(groups.flatMap((group) => group.items)).toEqual([linked, unlinked]);
    expect(groups).toContainEqual({ header: 'gone 선생님', items: [unlinked] });
  });

  it('omits empty groups', () => {
    const only = item('only', 1);
    expect(groupItemsByManager([only], () => 'm2', ['m1', 'm2'], labelFor)).toEqual([
      { header: 'm2 선생님', items: [only] },
    ]);
  });
});
