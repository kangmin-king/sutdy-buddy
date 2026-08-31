import { describe, expect, it } from 'vitest';
import {
  allowedAppSummary,
  lastUsageEndMillis,
  toIntervalRows,
  totalUsageSeconds,
} from './allowedAppUsageModel';
import type { AllowedAppInterval } from '../../types';

const interval = (startedAt: string, endedAt: string): AllowedAppInterval => ({
  id: `${startedAt}-${endedAt}`,
  userId: 'student-1',
  startedAt,
  endedAt,
});

describe('toIntervalRows', () => {
  it('converts native millisecond intervals into insertable rows', () => {
    const rows = toIntervalRows([{ startedAtMillis: 0, endedAtMillis: 60_000 }], 'student-1');
    expect(rows).toEqual([
      {
        user_id: 'student-1',
        started_at: new Date(0).toISOString(),
        ended_at: new Date(60_000).toISOString(),
      },
    ]);
  });

  // 같은 started_at을 안정적으로 만들어야 재전송 시 unique 인덱스가 중복을 걸러낸다.
  it('produces the same started_at for the same input', () => {
    const once = toIntervalRows([{ startedAtMillis: 1_000, endedAtMillis: 2_000 }], 'student-1');
    const twice = toIntervalRows([{ startedAtMillis: 1_000, endedAtMillis: 2_000 }], 'student-1');
    expect(once[0].started_at).toBe(twice[0].started_at);
  });

  it('drops intervals with no length', () => {
    const rows = toIntervalRows(
      [
        { startedAtMillis: 0, endedAtMillis: 0 },
        { startedAtMillis: 5_000, endedAtMillis: 1_000 },
      ],
      'student-1'
    );
    expect(rows).toEqual([]);
  });
});

describe('totalUsageSeconds', () => {
  it('adds every interval', () => {
    const total = totalUsageSeconds([
      interval('2026-08-28T10:00:00.000Z', '2026-08-28T10:05:00.000Z'),
      interval('2026-08-28T11:00:00.000Z', '2026-08-28T11:10:00.000Z'),
    ]);
    expect(total).toBe(900);
  });

  it('is zero with no intervals', () => {
    expect(totalUsageSeconds([])).toBe(0);
  });
});

describe('lastUsageEndMillis', () => {
  it('takes the latest end, not the last element', () => {
    const last = lastUsageEndMillis([
      interval('2026-08-28T11:00:00.000Z', '2026-08-28T11:10:00.000Z'),
      interval('2026-08-28T10:00:00.000Z', '2026-08-28T10:05:00.000Z'),
    ]);
    expect(last).toBe(Date.parse('2026-08-28T11:10:00.000Z'));
  });

  it('is null with no intervals', () => {
    expect(lastUsageEndMillis([])).toBeNull();
  });
});

describe('allowedAppSummary', () => {
  const now = Date.parse('2026-08-28T11:13:00.000Z');

  it('says how long ago when the usage just ended', () => {
    const intervals = [interval('2026-08-28T11:05:00.000Z', '2026-08-28T11:10:00.000Z')];
    expect(allowedAppSummary(intervals, now)).toBe('3분 전까지 허용앱 사용');
  });

  it('says 방금 when the usage ended less than a minute ago', () => {
    const intervals = [interval('2026-08-28T11:10:00.000Z', '2026-08-28T11:12:30.000Z')];
    expect(allowedAppSummary(intervals, now)).toBe('방금 전까지 허용앱 사용');
  });

  // 10분이 넘으면 "방금까지"라고 부르기 어렵다. 그때부터는 오늘 총량이 더 쓸모 있다.
  it('falls back to the daily total once the usage is old', () => {
    const intervals = [interval('2026-08-28T09:00:00.000Z', '2026-08-28T09:40:00.000Z')];
    expect(allowedAppSummary(intervals, now)).toBe('오늘 허용앱 40분');
  });

  it('is null when there is no usage', () => {
    expect(allowedAppSummary([], now)).toBeNull();
  });
});
