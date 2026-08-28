import type { StudySession } from '../../types';
import { SESSION_MAX_MILLIS } from '../distractionStopModel';

export interface OpenStudySession {
  itemId: string;
  sessionId: string;
  startedAt: string;
}

// 열린 학습 세션 = durationSeconds가 아직 없는 행. 두 개의 경계로 "지금 이 공부 세션에
// 속한 행"만 고른다.
//
// 위 경계(atMillis): 표식 시각보다 나중에 시작된 세션은 이 표식이 닫아야 할 대상이 아니다 —
// 표식이 남아 있는 동안 학생이 새로 공부를 시작했다면 그 세션은 계속 돌아야 한다.
//
// 아래 경계(sinceMillis, 네이티브 sessionStartedAtMillis): studySessions는 날짜 필터 없이
// 학생의 전체 이력이 들어온다. 오늘 항목만 보는 deriveRunningSessionIds/findStaleRunningSessions는
// 지난 날짜에 열린 채 남은 세션을 영영 건드리지 않으므로, 그런 고아 세션이 있는 것이 정상이다.
// 아래 경계가 없으면 쉬는 시간 한 번에 몇 주치가 한 세션의 학습 시간으로 기록된다.
export function findOpenStudySessionsBefore(
  studySessions: Record<string, StudySession[]>,
  atMillis: number,
  sinceMillis: number | null
): OpenStudySession[] {
  // sessionStartedAtMillis는 표식이 세워질 때 항상 함께 있어야 하지만, 없더라도 전체 이력을
  // 훑지는 않는다 — 정직한 세션 하나가 3시간(네이티브 자동 만료)을 넘길 수 없으므로 그만큼만 본다.
  const lowerBound = sinceMillis ?? atMillis - SESSION_MAX_MILLIS;
  const open: OpenStudySession[] = [];
  for (const [itemId, sessions] of Object.entries(studySessions)) {
    for (const session of sessions) {
      if (session.durationSeconds != null) continue;
      const startedAt = Date.parse(session.startedAt);
      if (startedAt > atMillis) continue;
      if (startedAt < lowerBound) continue;
      open.push({ itemId, sessionId: session.id, startedAt: session.startedAt });
    }
  }
  return open;
}

// 표식 시각까지 실제로 공부한 초. 지금 시각이 아니라 표식 시각을 쓰는 것이 요점이다 —
// 웹이 늦게 알아차린 지연이 학습 시간에 더해지면 쉬는 시간이 공부 시간으로 들어간다.
// 위쪽은 네이티브 세션 자동 만료(3시간)로 자른다: 정직한 한 세션이 그보다 길 수 없고,
// 기기 시계가 앞으로 튄 경우에도 말이 안 되는 값이 저장되지 않는다.
const MAX_SESSION_SECONDS = SESSION_MAX_MILLIS / 1000;

export function secondsUntil(startedAt: string, atMillis: number): number {
  const seconds = Math.floor((atMillis - Date.parse(startedAt)) / 1000);
  return Math.min(MAX_SESSION_SECONDS, Math.max(0, seconds));
}
