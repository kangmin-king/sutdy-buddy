import { describe, expect, it } from 'vitest';
import { findOpenStudySessionsBefore, secondsUntil } from './pendingPauseModel';
import type { StudySession } from '../../types';

const session = (over: Partial<StudySession> & { id: string; startedAt: string }): StudySession => ({
  plannerItemId: 'item-1',
  endedAt: null,
  durationSeconds: null,
  deviated: false,
  ...over,
});

describe('findOpenStudySessionsBefore', () => {
  const at = Date.parse('2026-08-27T10:00:00.000Z');

  it('finds a session that is still open', () => {
    const sessions = { 'item-1': [session({ id: 's1', startedAt: '2026-08-27T09:50:00.000Z' })] };
    expect(findOpenStudySessionsBefore(sessions, at)).toEqual([
      { itemId: 'item-1', sessionId: 's1', startedAt: '2026-08-27T09:50:00.000Z' },
    ]);
  });

  it('ignores a session that already has a duration', () => {
    const sessions = {
      'item-1': [session({ id: 's1', startedAt: '2026-08-27T09:50:00.000Z', durationSeconds: 600 })],
    };
    expect(findOpenStudySessionsBefore(sessions, at)).toEqual([]);
  });

  // 표식이 남아 있는 동안 학생이 새로 공부를 시작하면, 그 새 세션은 이 표식이 닫아야 할
  // 대상이 아니다. 닫으면 방금 시작한 공부가 0초로 기록된다.
  it('ignores a session that started after the mark', () => {
    const sessions = { 'item-1': [session({ id: 's2', startedAt: '2026-08-27T10:05:00.000Z' })] };
    expect(findOpenStudySessionsBefore(sessions, at)).toEqual([]);
  });

  it('finds open sessions across several planner items', () => {
    const sessions = {
      'item-1': [session({ id: 's1', startedAt: '2026-08-27T09:50:00.000Z' })],
      'item-2': [session({ id: 's2', plannerItemId: 'item-2', startedAt: '2026-08-27T09:55:00.000Z' })],
    };
    expect(findOpenStudySessionsBefore(sessions, at).map((s) => s.sessionId)).toEqual(['s1', 's2']);
  });

  it('returns nothing when there are no sessions at all', () => {
    expect(findOpenStudySessionsBefore({}, at)).toEqual([]);
  });
});

describe('secondsUntil', () => {
  it('counts the whole seconds up to the mark', () => {
    expect(secondsUntil('2026-08-27T09:50:00.000Z', Date.parse('2026-08-27T10:00:00.000Z'))).toBe(600);
  });

  it('clamps to zero when the mark is earlier than the start', () => {
    expect(secondsUntil('2026-08-27T10:00:00.000Z', Date.parse('2026-08-27T09:50:00.000Z'))).toBe(0);
  });
});
