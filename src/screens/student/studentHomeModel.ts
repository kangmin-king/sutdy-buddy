import type { PlannerItem, StudySession } from '../../types';

export interface StudentHomeModel {
  currentItem: PlannerItem | null;
  nextItems: PlannerItem[];
  completedCount: number;
  totalCount: number;
  currentElapsedSeconds: number;
  elapsedSecondsByItemId: Record<string, number>;
}

export function buildStudentHomeModel(
  items: readonly PlannerItem[],
  studySessions: Readonly<Record<string, readonly StudySession[]>>,
  runningSessionIds: Readonly<Record<string, string>>,
  nowMs: number,
): StudentHomeModel {
  const orderedIncomplete = items
    .filter((item) => item.status !== 'completed')
    .slice()
    .sort((a, b) => a.order - b.order);
  const currentItem = orderedIncomplete.find((item) => runningSessionIds[item.id] != null) ?? orderedIncomplete[0] ?? null;

  const elapsedSecondsByItemId = Object.fromEntries(
    orderedIncomplete.map((item) => {
      const sessions = studySessions[item.id] ?? [];
      let elapsedSeconds = sessions.reduce((total, session) => total + (session.durationSeconds ?? 0), 0);
      const runningSessionId = runningSessionIds[item.id];
      const runningSession = runningSessionId ? sessions.find((session) => session.id === runningSessionId) : undefined;
      if (runningSession) {
        elapsedSeconds += Math.max(0, Math.floor((nowMs - Date.parse(runningSession.startedAt)) / 1000));
      }
      return [item.id, elapsedSeconds];
    }),
  );
  const currentElapsedSeconds = currentItem ? (elapsedSecondsByItemId[currentItem.id] ?? 0) : 0;

  return {
    currentItem,
    nextItems: currentItem ? orderedIncomplete.filter((item) => item.id !== currentItem.id) : [],
    completedCount: items.filter((item) => item.status === 'completed').length,
    totalCount: items.length,
    currentElapsedSeconds,
    elapsedSecondsByItemId,
  };
}
function compareRunningSessions(
  left: { itemId: string; session: StudySession },
  right: { itemId: string; session: StudySession },
): number {
  const startedAtDifference = Date.parse(left.session.startedAt) - Date.parse(right.session.startedAt);
  if (startedAtDifference !== 0) return startedAtDifference;
  const sessionIdDifference = left.session.id.localeCompare(right.session.id);
  return sessionIdDifference !== 0 ? sessionIdDifference : left.itemId.localeCompare(right.itemId);
}

export function deriveRunningSessionIds(
  studySessions: Readonly<Record<string, readonly StudySession[]>>,
  visibleItemIds: ReadonlySet<string>,
): Record<string, string> {
  let newest: { itemId: string; session: StudySession } | null = null;
  for (const [itemId, sessions] of Object.entries(studySessions)) {
    if (!visibleItemIds.has(itemId)) continue;
    for (const session of sessions) {
      if (session.endedAt != null) continue;
      const candidate = { itemId, session };
      if (!newest || compareRunningSessions(candidate, newest) > 0) {
        newest = candidate;
      }
    }
  }
  return newest ? { [newest.itemId]: newest.session.id } : {};
}
export interface StaleRunningSession {
  itemId: string;
  sessionId: string;
  durationSeconds: number;
}

export function findStaleRunningSessions(
  studySessions: Readonly<Record<string, readonly StudySession[]>>,
  visibleItemIds: ReadonlySet<string>,
): StaleRunningSession[] {
  const running = Object.entries(studySessions)
    .filter(([itemId]) => visibleItemIds.has(itemId))
    .flatMap(([itemId, sessions]) =>
      sessions
        .filter((session) => session.endedAt == null)
        .map((session) => ({ itemId, session })),
    )
    .sort(compareRunningSessions);

  return running.slice(0, -1).map(({ itemId, session }, index) => ({
    itemId,
    sessionId: session.id,
    durationSeconds: Math.max(
      0,
      Math.floor((Date.parse(running[index + 1].session.startedAt) - Date.parse(session.startedAt)) / 1000),
    ),
  }));
}

export function canStartStudyItem(
  runningSessionIds: Readonly<Record<string, string>>,
  itemId: string,
): boolean {
  const runningItemIds = Object.keys(runningSessionIds);
  return runningItemIds.length === 0 || (runningItemIds.length === 1 && runningItemIds[0] === itemId);
}