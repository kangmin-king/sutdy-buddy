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
      // 아직 열려 있는 세션만 지금까지의 시간을 더한다. 쉬는 시간 표식 처리(usePendingStudyPause)가
      // 세션을 닫아도 화면의 runningSessionId는 그대로 남을 수 있는데, endedAt을 보지 않으면
      // durationSeconds와 실시간 경과가 둘 다 더해져 표시 시간이 두 배로 뛰고 쉬는 동안 계속 올라간다.
      if (runningSession && runningSession.endedAt == null) {
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
export interface ItemGroup {
  header: string | null;
  items: PlannerItem[];
}

// 연결이 끊긴 선생님이 낸 숙제도 managerId는 그대로 남는다. 연결된 선생님 목록만으로 그룹을
// 만들면 그런 항목이 어느 그룹에도 속하지 못해 목록에서 조용히 사라진다 — 실제로 존재하는
// managerId를 기준으로 그룹을 만들어 항목이 누락될 수 없게 한다.
export function groupItemsByManager(
  items: readonly PlannerItem[],
  managerIdOf: (item: PlannerItem) => string | null,
  linkedManagerIds: readonly string[],
  labelFor: (managerId: string) => string,
): ItemGroup[] {
  const itemsByManagerId = new Map<string, PlannerItem[]>();
  const selfAdded: PlannerItem[] = [];
  for (const item of items) {
    const managerId = managerIdOf(item);
    if (managerId == null) {
      selfAdded.push(item);
      continue;
    }
    const grouped = itemsByManagerId.get(managerId);
    if (grouped) grouped.push(item);
    else itemsByManagerId.set(managerId, [item]);
  }

  // 연결된 선생님을 화면에 보이는 순서대로 먼저 두고, 연결이 끊긴 선생님은 항목 등장 순서대로 뒤에 붙인다.
  const orderedManagerIds = [
    ...linkedManagerIds.filter((managerId) => itemsByManagerId.has(managerId)),
    ...[...itemsByManagerId.keys()].filter((managerId) => !linkedManagerIds.includes(managerId)),
  ];
  const groups = orderedManagerIds.map((managerId) => ({
    header: labelFor(managerId),
    items: itemsByManagerId.get(managerId) ?? [],
  }));
  return selfAdded.length > 0 ? [...groups, { header: '직접 추가', items: selfAdded }] : groups;
}
