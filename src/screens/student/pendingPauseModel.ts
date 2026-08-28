import type { StudySession } from '../../types';

export interface OpenStudySession {
  itemId: string;
  sessionId: string;
  startedAt: string;
}

// 열린 학습 세션 = durationSeconds가 아직 없는 행. 표식 시각보다 나중에 시작된 세션은
// 이 표식이 닫아야 할 대상이 아니므로 제외한다 — 표식이 남아 있는 동안 학생이 새로 공부를
// 시작했다면 그 세션은 계속 돌아야 한다.
export function findOpenStudySessionsBefore(
  studySessions: Record<string, StudySession[]>,
  atMillis: number
): OpenStudySession[] {
  const open: OpenStudySession[] = [];
  for (const [itemId, sessions] of Object.entries(studySessions)) {
    for (const session of sessions) {
      if (session.durationSeconds != null) continue;
      if (Date.parse(session.startedAt) > atMillis) continue;
      open.push({ itemId, sessionId: session.id, startedAt: session.startedAt });
    }
  }
  return open;
}

// 표식 시각까지 실제로 공부한 초. 지금 시각이 아니라 표식 시각을 쓰는 것이 요점이다 —
// 웹이 늦게 알아차린 지연이 학습 시간에 더해지면 쉬는 시간이 공부 시간으로 들어간다.
export function secondsUntil(startedAt: string, atMillis: number): number {
  return Math.max(0, Math.floor((atMillis - Date.parse(startedAt)) / 1000));
}
