import { describe, expect, it } from 'vitest';
import type { PlannerItem, StudySession } from '../../types';
import { buildStudentHomeModel, canStartStudyItem, deriveRunningSessionIds, findStaleRunningSessions } from './studentHomeModel';

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
    deviated: false,
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
      { itemId: 'current', sessionId: 'older-active', durationSeconds: 120 },
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
      { itemId: 'current', sessionId: 'session-a', durationSeconds: 0 },
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
