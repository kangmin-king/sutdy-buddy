import type { AllowedAppInterval } from '../../types';
import type { NativeAllowedAppInterval } from '../../types/distraction';

// 마지막 사용이 이 시간 안에 끝났으면 "N분 전까지", 넘으면 오늘 총량을 보여준다.
const RECENT_WINDOW_MILLIS = 10 * 60 * 1000;

// 네이티브가 밀리초로 준 구간을 삽입용 행으로 바꾼다. started_at은 (user_id, started_at)
// unique 인덱스의 절반이므로 같은 입력에서 항상 같은 값이 나와야 재전송이 안전하다.
export function toIntervalRows(
  intervals: NativeAllowedAppInterval[],
  userId: string
): { user_id: string; started_at: string; ended_at: string }[] {
  return intervals
    .filter((i) => i.endedAtMillis > i.startedAtMillis)
    .map((i) => ({
      user_id: userId,
      started_at: new Date(i.startedAtMillis).toISOString(),
      ended_at: new Date(i.endedAtMillis).toISOString(),
    }));
}

// flush 한 번의 결정 전체. 보낼 행과 네이티브에서 지울 개수를 한 곳에서 정한다.
//
// count가 rows.length가 아니라 intervals.length여야 하는 것이 이 함수의 존재 이유다.
// toIntervalRows는 길이가 0 이하인 구간을 걸러내므로 rows가 스냅샷보다 짧을 수 있는데,
// rows.length만 지우면 걸러진 구간이 네이티브에 영영 남아 flush 때마다 다시 읽힌다.
// 반대로 스냅샷보다 많이 지우면, 전송하는 동안 서비스가 새로 append한 구간이 서버로
// 가보지도 못하고 사라진다. 주석이 아니라 테스트가 지키도록 순수 함수로 뽑아 두었다.
export function intervalsToFlush(
  intervals: NativeAllowedAppInterval[],
  userId: string
): { rows: { user_id: string; started_at: string; ended_at: string }[]; count: number } {
  return { rows: toIntervalRows(intervals, userId), count: intervals.length };
}

export function totalUsageSeconds(intervals: AllowedAppInterval[]): number {
  return intervals.reduce(
    (sum, i) => sum + Math.max(0, Math.floor((Date.parse(i.endedAt) - Date.parse(i.startedAt)) / 1000)),
    0
  );
}

// 배열 순서를 믿지 않는다 — 서버 정렬이 바뀌어도 맞아야 한다.
export function lastUsageEndMillis(intervals: AllowedAppInterval[]): number | null {
  if (intervals.length === 0) return null;
  return intervals.reduce((max, i) => Math.max(max, Date.parse(i.endedAt)), 0);
}

// 매니저 학생 목록의 두 번째 줄. "지금 사용 중"이라고 쓰지 않는 이유는, 학생이 허용앱을
// 쓰는 동안 우리 앱은 백그라운드라 서버 값이 그만큼 늦기 때문이다. 문구가 그 지연을
// 정직하게 드러내야 매니저가 잘못 믿지 않는다.
export function allowedAppSummary(intervals: AllowedAppInterval[], nowMillis: number): string | null {
  const lastEnd = lastUsageEndMillis(intervals);
  if (lastEnd == null) return null;

  // 0에서 끊는다. 기기 시각이 서버보다 뒤처져 있으면 lastEnd가 미래로 보여 차이가 음수가
  // 되고, 그대로 나누면 `-1분 전까지 허용앱 사용`이 렌더된다.
  const sinceMillis = Math.max(0, nowMillis - lastEnd);
  if (sinceMillis <= RECENT_WINDOW_MILLIS) {
    const minutes = Math.floor(sinceMillis / 60_000);
    return minutes === 0 ? '방금 전까지 허용앱 사용' : `${minutes}분 전까지 허용앱 사용`;
  }
  return `오늘 허용앱 ${Math.round(totalUsageSeconds(intervals) / 60)}분`;
}
