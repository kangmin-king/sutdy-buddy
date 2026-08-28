import { describe, expect, it } from 'vitest';
import { findOpenStudySessionsBefore, secondsUntil } from './pendingPauseModel';
import { SESSION_MAX_MILLIS } from '../distractionStopModel';
import type { StudySession } from '../../types';

const session = (over: Partial<StudySession> & { id: string; startedAt: string }): StudySession => ({
  plannerItemId: 'item-1',
  endedAt: null,
  durationSeconds: null,
  ...over,
});

describe('findOpenStudySessionsBefore', () => {
  const at = Date.parse('2026-08-27T10:00:00.000Z');
  const since = Date.parse('2026-08-27T09:40:00.000Z');

  it('finds a session that is still open', () => {
    const sessions = { 'item-1': [session({ id: 's1', startedAt: '2026-08-27T09:50:00.000Z' })] };
    expect(findOpenStudySessionsBefore(sessions, at, since)).toEqual([
      { itemId: 'item-1', sessionId: 's1', startedAt: '2026-08-27T09:50:00.000Z' },
    ]);
  });

  it('ignores a session that already has a duration', () => {
    const sessions = {
      'item-1': [session({ id: 's1', startedAt: '2026-08-27T09:50:00.000Z', durationSeconds: 600 })],
    };
    expect(findOpenStudySessionsBefore(sessions, at, since)).toEqual([]);
  });

  // 표식이 남아 있는 동안 학생이 새로 공부를 시작하면, 그 새 세션은 이 표식이 닫아야 할
  // 대상이 아니다. 닫으면 방금 시작한 공부가 0초로 기록된다.
  it('ignores a session that started after the mark', () => {
    const sessions = { 'item-1': [session({ id: 's2', startedAt: '2026-08-27T10:05:00.000Z' })] };
    expect(findOpenStudySessionsBefore(sessions, at, since)).toEqual([]);
  });

  it('closes a session that started exactly at the mark', () => {
    const sessions = { 'item-1': [session({ id: 's1', startedAt: '2026-08-27T10:00:00.000Z' })] };
    expect(findOpenStudySessionsBefore(sessions, at, since).map((s) => s.sessionId)).toEqual(['s1']);
  });

  // 회귀: studySessions는 날짜 필터 없이 학생의 전체 이력이다. 아래 경계가 없으면 몇 주 전
  // 열린 채 남은 고아 세션이 쉬는 시간 한 번에 수백 시간으로 기록됐다.
  it('ignores an open session that started before this study session', () => {
    const sessions = {
      'item-old': [session({ id: 'old', plannerItemId: 'item-old', startedAt: '2026-08-01T09:00:00.000Z' })],
      'item-1': [session({ id: 's1', startedAt: '2026-08-27T09:50:00.000Z' })],
    };
    expect(findOpenStudySessionsBefore(sessions, at, since).map((s) => s.sessionId)).toEqual(['s1']);
  });

  it('closes a session that started exactly at the lower bound', () => {
    const sessions = { 'item-1': [session({ id: 's1', startedAt: '2026-08-27T09:40:00.000Z' })] };
    expect(findOpenStudySessionsBefore(sessions, at, since).map((s) => s.sessionId)).toEqual(['s1']);
  });

  // 표식과 함께 시작 시각이 없는 상태는 원래 나오지 않아야 하지만, 나오더라도 전체 이력을
  // 훑지는 않는다 — 세션 자동 만료 창(3시간)만큼만 거슬러 본다.
  it('falls back to the session expiry window when there is no lower bound', () => {
    const sessions = {
      'item-old': [
        session({
          id: 'old',
          plannerItemId: 'item-old',
          startedAt: new Date(at - SESSION_MAX_MILLIS - 1).toISOString(),
        }),
      ],
      'item-1': [session({ id: 's1', startedAt: new Date(at - SESSION_MAX_MILLIS + 1).toISOString() })],
    };
    expect(findOpenStudySessionsBefore(sessions, at, null).map((s) => s.sessionId)).toEqual(['s1']);
  });

  it('finds open sessions across several planner items', () => {
    const sessions = {
      'item-1': [session({ id: 's1', startedAt: '2026-08-27T09:50:00.000Z' })],
      'item-2': [session({ id: 's2', plannerItemId: 'item-2', startedAt: '2026-08-27T09:55:00.000Z' })],
    };
    expect(findOpenStudySessionsBefore(sessions, at, since).map((s) => s.sessionId)).toEqual(['s1', 's2']);
  });

  it('returns nothing when there are no sessions at all', () => {
    expect(findOpenStudySessionsBefore({}, at, since)).toEqual([]);
  });
});

describe('secondsUntil', () => {
  it('counts the whole seconds up to the mark', () => {
    expect(secondsUntil('2026-08-27T09:50:00.000Z', Date.parse('2026-08-27T10:00:00.000Z'))).toBe(600);
  });

  it('clamps to zero when the mark is earlier than the start', () => {
    expect(secondsUntil('2026-08-27T10:00:00.000Z', Date.parse('2026-08-27T09:50:00.000Z'))).toBe(0);
  });

  // 반올림하면 화면에 보이던 값보다 1초 많은 값이 저장된다.
  it('floors a fractional second rather than rounding it', () => {
    expect(secondsUntil('2026-08-27T09:50:00.000Z', Date.parse('2026-08-27T10:00:00.900Z'))).toBe(600);
  });

  // 회귀: 기기 시계가 앞으로 튀거나 아래 경계를 빠져나간 세션이 있으면 말이 안 되는 값이
  // duration_seconds에 저장되고 선생님 화면에 수백 시간으로 보인다.
  it('clamps to the session expiry window', () => {
    const startedAt = '2026-08-01T00:00:00.000Z';
    const at = Date.parse(startedAt) + SESSION_MAX_MILLIS * 10;
    expect(secondsUntil(startedAt, at)).toBe(SESSION_MAX_MILLIS / 1000);
  });
});
