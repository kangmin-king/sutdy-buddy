// "누구에게 알림을 보낼지"만 계산하는 순수 함수. index.ts에서 분리한 이유는 이 판정이
// 이 기능의 전부이기 때문이다 — DB·FCM 없이 테스트할 수 있어야 한다(reminderTargets.test.ts).
//
// Deno API를 쓰지 않는다(vitest가 이 파일을 그대로 돌린다). 다만 supabase/는 앱의 tsconfig
// include 밖이라 `npx tsc -b`의 타입체크 대상이 아니다 — 나머지 Edge Function과 같은 처지다.

import { minutesSinceDayStart } from '../_shared/day.ts';

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

// 대상에서 빠진 학생 수를 이유별로 센다. 응답에 실어 보내려고 만든 값이다 — 2026-09-03 테스트에서
// "대상 없음"과 "오늘 이미 보냄"이 똑같이 notified: 0으로 나와서, 원인을 찾으려면 매번 DB를
// 뒤져야 했다. 이유가 보이면 응답 한 줄로 끝난다.
export interface ReminderSkipCounts {
  /** 매니저가 알림을 끔 */
  disabled: number;
  /** 아직 알림 시각이 되지 않음 */
  beforeTime: number;
  /** 하나라도 시작했거나 완료함 */
  started: number;
  /** 알림 시각 설정을 읽을 수 없음(형식이 깨짐) */
  invalidSetting: number;
}

export interface ReminderSelection {
  targets: ReminderTarget[];
  skipped: ReminderSkipCounts;
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
}): ReminderSelection {
  const { now, homeworkItems, settings, defaultRemindAt } = params;
  const started = new Set(params.startedItemIds);

  const byStudent = new Map<string, HomeworkItem[]>();
  for (const item of homeworkItems) {
    const list = byStudent.get(item.studentId) ?? [];
    list.push(item);
    byStudent.set(item.studentId, list);
  }

  const targets: ReminderTarget[] = [];
  const skipped: ReminderSkipCounts = { disabled: 0, beforeTime: 0, started: 0, invalidSetting: 0 };

  for (const [studentId, items] of byStudent) {
    const setting = settings[studentId];
    if (setting && !setting.enabled) {
      skipped.disabled += 1;
      continue;
    }

    // Postgres time은 "21:00:00"으로 오므로 "HH:MM"으로 자른다.
    const remindAt = (setting?.remindAt ?? defaultRemindAt).slice(0, 5);
    // 하루가 새벽 4시에 시작하므로 벽시계 문자열을 그대로 비교하면 안 된다. 예전엔 사전순으로
    // 비교했는데, 그러면 00:01로 걸어둔 알림이 `"04:00" >= "00:01"`에 걸려 하루가 시작하자마자
    // 새벽 4시에 발송된다. 둘 다 "하루 시작으로부터 몇 분"으로 바꿔서 순서를 맞춘다.
    // 시각 파싱은 학생 단위로 감싼다. remind_at은 Postgres time 컬럼이라 형식이 보장되지만,
    // 한 학생의 값이 깨졌다고 배치 전체가 죽으면 나머지 학생이 전부 알림을 못 받는다.
    let isBeforeTime: boolean;
    try {
      isBeforeTime = minutesSinceDayStart(now) < minutesSinceDayStart(remindAt);
    } catch {
      skipped.invalidSetting += 1;
      continue;
    }
    if (isBeforeTime) {
      skipped.beforeTime += 1;
      continue;
    }

    // 세션 행은 학생이 "시작"을 눌러야 생긴다. planned가 아닌 모든 상태는 학생이 이미 손을 댄 것이다:
    //   completed   — 다 했다
    //   partial     — 일부 했다. **여기에 "아직 시작 안 했어요"를 보내면 명백히 틀린 알림이다.**
    //   carried_over— 내일로 미뤘다. 무시한 게 아니라 의도적으로 미룬 것이라 문구가 안 맞는다.
    // (구버전 앱에서 세션 없이 상태만 바뀐 기록이 남아 있을 수 있어 세션과 함께 본다.)
    const startedAny = items.some((i) => started.has(i.id) || i.status !== 'planned');
    if (startedAny) {
      skipped.started += 1;
      continue;
    }

    targets.push({ studentId, remindAt, homeworkCount: items.length });
  }

  return { targets, skipped };
}
