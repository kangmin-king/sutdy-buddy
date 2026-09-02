// "누구에게 알림을 보낼지"만 계산하는 순수 함수. index.ts에서 분리한 이유는 이 판정이
// 이 기능의 전부이기 때문이다 — DB·FCM 없이 테스트할 수 있어야 한다(reminderTargets.test.ts).
//
// Deno API를 쓰지 않는다(vitest가 이 파일을 그대로 돌린다). 다만 supabase/는 앱의 tsconfig
// include 밖이라 `npx tsc -b`의 타입체크 대상이 아니다 — 나머지 Edge Function과 같은 처지다.

export interface ReminderSetting {
  remindAt: string; // "HH:MM" 또는 "HH:MM:SS"
  enabled: boolean;
}

export interface HomeworkItem {
  id: string;
  studentId: string;
  status: string;
}

export interface ReminderTarget {
  studentId: string;
  remindAt: string; // "HH:MM"
  homeworkCount: number;
}

export function selectReminderTargets(params: {
  /** Asia/Seoul 기준 현재 시각 "HH:MM" */
  now: string;
  /** 오늘 날짜의 숙제 항목(source: 'homework')만 */
  homeworkItems: HomeworkItem[];
  /** 학생별 설정. 없는 학생은 defaultRemindAt · 켜짐으로 본다 */
  settings: Record<string, ReminderSetting>;
  /** 오늘 숙제 항목 중 학습 세션이 한 번이라도 붙은 항목 id */
  startedItemIds: Iterable<string>;
  defaultRemindAt: string;
}): ReminderTarget[] {
  const { now, homeworkItems, settings, defaultRemindAt } = params;
  const started = new Set(params.startedItemIds);

  const byStudent = new Map<string, HomeworkItem[]>();
  for (const item of homeworkItems) {
    const list = byStudent.get(item.studentId) ?? [];
    list.push(item);
    byStudent.set(item.studentId, list);
  }

  const targets: ReminderTarget[] = [];
  for (const [studentId, items] of byStudent) {
    const setting = settings[studentId];
    if (setting && !setting.enabled) continue;

    // Postgres time은 "21:00:00"으로 오므로 "HH:MM"으로 자른다. 둘 다 0으로 패딩된 24시간
    // 표기라서 문자열 사전순 비교가 곧 시각 비교다.
    const remindAt = (setting?.remindAt ?? defaultRemindAt).slice(0, 5);
    if (now < remindAt) continue;

    // 세션 행은 학생이 "시작"을 눌러야 생긴다. 완료 처리된 항목도 당연히 시작한 것이다
    // (구버전 앱에서 세션 없이 상태만 바뀐 기록이 남아 있을 수 있어 함께 본다).
    const startedAny = items.some((i) => started.has(i.id) || i.status === 'completed');
    if (startedAny) continue;

    targets.push({ studentId, remindAt, homeworkCount: items.length });
  }

  return targets;
}
