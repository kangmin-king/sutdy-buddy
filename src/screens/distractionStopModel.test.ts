import { describe, expect, it } from 'vitest';
import {
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
  featureEnabled: true,
  allowedApps: ['com.spotify.music'],
  sessionActive: false,
  sessionStartedAtMillis: null,
  pendingPauseAtMillis: null,
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

  // 쉬는 시간이 공부 중보다 먼저다 — 지금 차단이 풀려 있다는 사실이 더 급하다.
  it('is break while a break is running, even during study mode', () => {
    expect(distractionStatus({ ...studying(0), endTimeMillis: 60_000 }, 1_000)).toBe('break');
  });

  it('is blocking while studying', () => {
    expect(distractionStatus(studying(0), 1_000)).toBe('blocking');
  });

  // 이미 차단이 걸린 상태에서는 준비 안내보다 지금 벌어지는 일이 급하다.
  it('prefers blocking over the no-allowed-apps hint while studying', () => {
    expect(distractionStatus({ ...studying(0), allowedApps: [] }, 1_000)).toBe('blocking');
  });

  it('is noAllowedApps when not studying and nothing is allowed yet', () => {
    expect(distractionStatus({ ...BASE, allowedApps: [] }, 1_000)).toBe('noAllowedApps');
  });

  it('is idle when not studying but apps are already allowed', () => {
    expect(distractionStatus(BASE, 1_000)).toBe('idle');
  });

  it('is idle once the session has expired', () => {
    expect(distractionStatus(studying(0), SESSION_MAX_MILLIS)).toBe('idle');
  });
});

describe('statusMessage', () => {
  it('says the feature is off', () => {
    expect(statusMessage({ ...BASE, featureEnabled: false }, 1_000)).toBe('딴짓 멈춰가 꺼져 있어요');
  });

  it('shows the remaining break time and that study time is not counting', () => {
    expect(statusMessage({ ...BASE, endTimeMillis: 5 * 60_000 }, 0)).toBe(
      '쉬는 시간 5분 남음 — 이 동안은 공부 시간이 쌓이지 않아요'
    );
  });

  it('says only allowed apps open while studying', () => {
    expect(statusMessage(studying(0), 1_000)).toBe('차단 중 — 허용앱 외에는 열리지 않아요');
  });

  it('nudges the student to pick apps before studying', () => {
    expect(statusMessage({ ...BASE, allowedApps: [] }, 1_000)).toBe(
      '공부 중에 쓸 앱을 미리 골라두세요 — 지금은 전화·시계·설정만 열려요'
    );
  });

  it('explains that studying turns blocking on', () => {
    expect(statusMessage(BASE, 1_000)).toBe('차단 대기 중 — 공부를 시작하면 허용앱 외에는 열리지 않아요');
  });
});
