import type { StudySession } from '../../types';
import { SESSION_MAX_MILLIS } from '../distractionStopModel';

// 한 학습 세션이 기여할 수 있는 최대 시간. 딴짓 멈춰의 세션 자동 만료와 같은 값이라
// 학생이 겪는 규칙이 하나로 유지된다.
export const MAX_SESSION_SECONDS = SESSION_MAX_MILLIS / 1000;

// 화면의 실시간 경과와 자동 마감이 둘 다 이 함수를 쓴다. 각자 계산하면 언젠가 어긋나고,
// 어긋나면 학생이 본 숫자와 저장되는 숫자가 달라진다.
export function cappedSessionSeconds(startedAt: string, atMillis: number): number {
  const startedAtMillis = Date.parse(startedAt);
  if (Number.isNaN(startedAtMillis)) return 0;
  const seconds = Math.floor((atMillis - startedAtMillis) / 1000);
  return Math.min(MAX_SESSION_SECONDS, Math.max(0, seconds));
}

export interface ExpiredOpenSession {
  itemId: string;
  sessionId: string;
  endedAt: string;
  durationSeconds: number;
}

// 3시간이 지나도록 닫히지 않은 세션을 전부 찾는다.
//
// 요점은 **플래너 항목의 가시성으로 거르지 않는다**는 것이다. deriveRunningSessionIds와
// findStaleRunningSessions는 오늘 미완료 항목만 보기 때문에, 자정을 넘겨 남은 세션은
// 어느 쪽 대상도 되지 못하고 ended_at/duration_seconds가 null인 채로 영영 남는다.
// 그런 행은 매니저 화면에서 통째로 사라진다(합계는 ?? 0, 타임라인은 건너뜀).
export function findExpiredOpenSessions(
  studySessions: Readonly<Record<string, readonly StudySession[]>>,
  nowMillis: number,
): ExpiredOpenSession[] {
  const expired: ExpiredOpenSession[] = [];
  for (const [itemId, sessions] of Object.entries(studySessions)) {
    for (const session of sessions) {
      if (session.endedAt != null) continue;
      const startedAtMillis = Date.parse(session.startedAt);
      // 못 읽는 값에 마감을 써넣는 것보다 남겨두는 편이 안전하다.
      if (Number.isNaN(startedAtMillis)) continue;
      const expiresAtMillis = startedAtMillis + SESSION_MAX_MILLIS;
      if (expiresAtMillis > nowMillis) continue;
      expired.push({
        itemId,
        sessionId: session.id,
        endedAt: new Date(expiresAtMillis).toISOString(),
        durationSeconds: MAX_SESSION_SECONDS,
      });
    }
  }
  return expired;
}
