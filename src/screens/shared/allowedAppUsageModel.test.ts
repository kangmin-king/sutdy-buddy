import { describe, expect, it } from 'vitest';
import {
  allowedAppSummary,
  intervalsToFlush,
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

describe('intervalsToFlush', () => {
  // 이 테스트가 지키는 불변식: 네이티브에서 지울 개수는 보낸 행 수가 아니라 스냅샷 길이다.
  // rows.length로 바꾸면 걸러진 0초 구간이 네이티브에 남아 flush 때마다 다시 읽힌다.
  it('clears the snapshot length, not the number of rows sent', () => {
    const { rows, count } = intervalsToFlush(
      [
        { startedAtMillis: 0, endedAtMillis: 60_000 },
        // 길이 0 — toIntervalRows가 걸러내므로 rows에는 안 들어간다.
        { startedAtMillis: 90_000, endedAtMillis: 90_000 },
        { startedAtMillis: 120_000, endedAtMillis: 180_000 },
      ],
      'student-1'
    );
    expect(rows).toHaveLength(2);
    expect(count).toBe(3);
    expect(count).toBeGreaterThan(rows.length);
  });

  it('sends the same rows toIntervalRows would', () => {
    const intervals = [{ startedAtMillis: 1_000, endedAtMillis: 2_000 }];
    expect(intervalsToFlush(intervals, 'student-1').rows).toEqual(toIntervalRows(intervals, 'student-1'));
  });

  it('is a no-op shape for an empty snapshot', () => {
    expect(intervalsToFlush([], 'student-1')).toEqual({ rows: [], count: 0 });
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

  // 경계값 쌍: RECENT_WINDOW_MILLIS 상수나 <= 비교 연산자 중 하나만 몰래 바뀌어도
  // (예: <=가 <로, 10분이 60초로) 이 두 테스트 중 하나가 반드시 깨진다.
  it('reads "10분 전까지" exactly at the 10-minute boundary (<=)', () => {
    const intervals = [interval('2026-08-28T10:58:00.000Z', '2026-08-28T11:03:00.000Z')];
    // now - endedAt === 10 * 60 * 1000 정확히
    expect(allowedAppSummary(intervals, now)).toBe('10분 전까지 허용앱 사용');
  });

  it('falls back to the daily total one millisecond past the 10-minute boundary', () => {
    const intervals = [interval('2026-08-28T10:47:59.999Z', '2026-08-28T11:02:59.999Z')];
    // now - endedAt === 10 * 60 * 1000 + 1; 구간 길이는 15분 = 900초 → 900/60 = 15
    expect(allowedAppSummary(intervals, now)).toBe('오늘 허용앱 15분');
  });

  // 기기 시각이 서버보다 뒤처지면 lastEnd가 미래로 보인다. 0에서 끊지 않으면 음수를 나눠
  // `-1분 전까지 허용앱 사용`이 매니저 화면에 그대로 렌더된다.
  it('reads 방금 when the last usage looks like it ends in the future', () => {
    const intervals = [interval('2026-08-28T11:12:00.000Z', '2026-08-28T11:20:00.000Z')];
    expect(allowedAppSummary(intervals, now)).toBe('방금 전까지 허용앱 사용');
  });

  it('is null when there is no usage', () => {
    expect(allowedAppSummary([], now)).toBeNull();
  });
});
