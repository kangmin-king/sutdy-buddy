import { describe, expect, it } from 'vitest';
import type { StudySession } from '../../types';
import { SESSION_MAX_MILLIS } from '../distractionStopModel';
import { cappedSessionSeconds, findExpiredOpenSessions, MAX_SESSION_SECONDS } from './studySessionModel';

const T0 = Date.parse('2026-09-01T09:00:00.000Z');

// 캐스트를 쓰지 않는다. Task 2가 StudySession에 autoClosed를 필수로 더할 때, 캐스트가
// 있으면 tsc가 이 헬퍼를 짚어주지 못하고 필드가 빠진 객체가 조용히 남는다.
function session(overrides: Partial<StudySession> & { id: string; startedAt: string }): StudySession {
  return {
    plannerItemId: 'item-1',
    endedAt: null,
    durationSeconds: null,
    ...overrides,
  };
}

describe('cappedSessionSeconds', () => {
  it('counts the seconds actually elapsed below the cap', () => {
    expect(cappedSessionSeconds(new Date(T0).toISOString(), T0 + 90_000)).toBe(90);
  });

  it('caps at three hours', () => {
    expect(cappedSessionSeconds(new Date(T0).toISOString(), T0 + SESSION_MAX_MILLIS * 5)).toBe(MAX_SESSION_SECONDS);
  });

  it('returns exactly the cap at the boundary', () => {
    expect(cappedSessionSeconds(new Date(T0).toISOString(), T0 + SESSION_MAX_MILLIS)).toBe(MAX_SESSION_SECONDS);
  });

  it('never goes negative when the device clock jumps backwards', () => {
    expect(cappedSessionSeconds(new Date(T0).toISOString(), T0 - 60_000)).toBe(0);
  });

  it('returns 0 for an unparsable timestamp rather than NaN', () => {
    expect(cappedSessionSeconds('not-a-date', T0)).toBe(0);
  });
});

describe('findExpiredOpenSessions', () => {
  it('finds an open session whose planner item is not in today list', () => {
    // 결함 2의 회귀 테스트. deriveRunningSessionIds/findStaleRunningSessions는 오늘 항목만
    // 보기 때문에 어제 열린 세션을 영영 닫지 않는다. 이 함수는 항목 가시성을 보지 않는다.
    const yesterday = new Date(T0 - 20 * 60 * 60 * 1000).toISOString();
    const found = findExpiredOpenSessions({ 'item-from-yesterday': [session({ id: 's1', startedAt: yesterday })] }, T0);
    expect(found).toEqual([
      {
        itemId: 'item-from-yesterday',
        sessionId: 's1',
        endedAt: new Date(Date.parse(yesterday) + SESSION_MAX_MILLIS).toISOString(),
        durationSeconds: MAX_SESSION_SECONDS,
      },
    ]);
  });

  it('does not return a session that is still within three hours', () => {
    const startedAt = new Date(T0 - SESSION_MAX_MILLIS + 1).toISOString();
    expect(findExpiredOpenSessions({ 'item-1': [session({ id: 's1', startedAt })] }, T0)).toEqual([]);
  });

  it('returns a session at exactly three hours', () => {
    const startedAt = new Date(T0 - SESSION_MAX_MILLIS).toISOString();
    expect(findExpiredOpenSessions({ 'item-1': [session({ id: 's1', startedAt })] }, T0)).toHaveLength(1);
  });

  it('ignores sessions that are already closed', () => {
    const startedAt = new Date(T0 - SESSION_MAX_MILLIS * 2).toISOString();
    const closed = session({ id: 's1', startedAt, endedAt: new Date(T0).toISOString(), durationSeconds: 120 });
    expect(findExpiredOpenSessions({ 'item-1': [closed] }, T0)).toEqual([]);
  });

  it('returns every expired session across items', () => {
    const old = new Date(T0 - SESSION_MAX_MILLIS * 2).toISOString();
    const found = findExpiredOpenSessions(
      { 'item-1': [session({ id: 's1', startedAt: old })], 'item-2': [session({ id: 's2', startedAt: old })] },
      T0,
    );
    expect(found.map((f) => f.sessionId).sort()).toEqual(['s1', 's2']);
  });

  it('skips a session whose startedAt cannot be parsed', () => {
    expect(findExpiredOpenSessions({ 'item-1': [session({ id: 's1', startedAt: 'nope' })] }, T0)).toEqual([]);
  });
});
