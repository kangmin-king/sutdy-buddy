import { describe, expect, it } from 'vitest';
import {
  classifySessionStop,
  distractionStatus,
  extendedEndTime,
  formatRemaining,
  isBreakActive,
  isSessionActive,
  SESSION_MAX_MILLIS,
  statusMessage,
} from './distractionStopModel';
import type { DistractionState } from '../types/distraction';

const BASE: DistractionState = {
  endTimeMillis: null,
  exitMode: 'IMMEDIATE',
  gracePeriodSeconds: 0,
  enabledApps: ['INSTAGRAM'],
  featureEnabled: true,
  allowedApps: [],
  sessionActive: false,
  sessionStartedAtMillis: null,
};

const studying = (startedAt = 0): DistractionState => ({
  ...BASE,
  sessionActive: true,
  sessionStartedAtMillis: startedAt,
});

describe('isBreakActive', () => {
  it('is active while now is before the end time', () => {
    expect(isBreakActive(10_000, 8_000)).toBe(true);
  });

  it('is not active once the end time has passed', () => {
    expect(isBreakActive(10_000, 10_000)).toBe(false);
  });

  it('is not active when there is no break', () => {
    expect(isBreakActive(null, 8_000)).toBe(false);
  });
});

describe('extendedEndTime', () => {
  it('extends from the existing end while the break is still running', () => {
    expect(extendedEndTime(10_000, 5_000, 8_000)).toBe(15_000);
  });

  // 회귀: 이미 끝난 쉬는 시간에 +5분을 더하면 "과거 + 5분"이라 여전히 과거였고,
  // 화면은 계속 '종료됨'이라 버튼이 안 눌리는 것처럼 보였다.
  it('extends from now when the break already ended', () => {
    expect(extendedEndTime(10_000, 5_000, 100_000)).toBe(105_000);
  });

  it('extends from now when there is no break at all', () => {
    expect(extendedEndTime(null, 5_000, 100_000)).toBe(105_000);
  });
});

describe('formatRemaining', () => {
  it('has no text when there is no break', () => {
    expect(formatRemaining(null, 0)).toBeNull();
  });

  it('rounds the remaining time up to whole minutes', () => {
    expect(formatRemaining(5 * 60_000, 0)).toBe('5분 남음');
    expect(formatRemaining(4 * 60_000 + 1, 0)).toBe('5분 남음');
  });

  it('reports an expired break as ended', () => {
    expect(formatRemaining(10_000, 100_000)).toBe('종료됨');
  });
});

describe('isSessionActive', () => {
  it('is active within the three hour window', () => {
    expect(isSessionActive(studying(0), SESSION_MAX_MILLIS - 1)).toBe(true);
  });

  it('expires once the three hour window has elapsed', () => {
    expect(isSessionActive(studying(0), SESSION_MAX_MILLIS)).toBe(false);
  });

  it('is inactive when the flag is set but the start time is missing', () => {
    expect(isSessionActive({ ...BASE, sessionActive: true }, 1_000)).toBe(false);
  });

  it('is inactive when not studying', () => {
    expect(isSessionActive(BASE, 1_000)).toBe(false);
  });
});

describe('distractionStatus', () => {
  it('is off when the feature is disabled', () => {
    expect(distractionStatus({ ...studying(0), featureEnabled: false }, 1_000)).toBe('off');
  });

  it('is break while a break is running', () => {
    expect(distractionStatus({ ...BASE, endTimeMillis: 60_000 }, 1_000)).toBe('break');
  });

  it('is blocking while studying', () => {
    expect(distractionStatus(studying(0), 1_000)).toBe('blocking');
  });

  it('is idle when not studying', () => {
    expect(distractionStatus(BASE, 1_000)).toBe('idle');
  });

  it('is idle once the session has expired', () => {
    expect(distractionStatus(studying(0), SESSION_MAX_MILLIS)).toBe('idle');
  });
});

describe('statusMessage', () => {
  it('explains that studying turns blocking on', () => {
    expect(statusMessage(BASE, 1_000)).toBe('차단 대기 중 — 공부를 시작하면 인스타·유튜브·틱톡이 막혀요');
  });

  it('says blocking is on while studying', () => {
    expect(statusMessage(studying(0), 1_000)).toBe('차단 중 — 지금 인스타·유튜브·틱톡을 열면 막혀요');
  });

  it('shows the remaining break time and that study time is not counting', () => {
    expect(statusMessage({ ...BASE, endTimeMillis: 5 * 60_000 }, 0)).toBe(
      '쉬는 시간 5분 남음 — 이 동안은 공부 시간이 쌓이지 않아요'
    );
  });

  it('says the feature is off', () => {
    expect(statusMessage({ ...BASE, featureEnabled: false }, 1_000)).toBe('딴짓 멈춰가 꺼져 있어요');
  });
});

describe('classifySessionStop', () => {
  it('is self when the student pressed stop or complete', () => {
    expect(classifySessionStop(BASE, 1_000, true)).toBe('self');
  });

  // 쉬는 시간을 시작하면 네이티브가 세션을 내린다. 그건 이탈이 아니라 정상 일시정지다.
  it('is break when a break became active at the same time', () => {
    expect(classifySessionStop({ ...BASE, endTimeMillis: 60_000 }, 1_000, false)).toBe('break');
  });

  it('is deviation when the session dropped with no break running', () => {
    expect(classifySessionStop(BASE, 1_000, false)).toBe('deviation');
  });

  it('prefers self over break when the student stopped during a break', () => {
    expect(classifySessionStop({ ...BASE, endTimeMillis: 60_000 }, 1_000, true)).toBe('self');
  });
});
