// 하루가 넘어가는 시각 — **이 파일이 유일한 정의다.**
//
// 브라우저 앱(src/lib.ts)과 Edge Function(알림 스케줄)이 같은 값을 읽어야 한다. 한쪽만
// 자정으로 남아 있으면 "학생 화면에 보이는 오늘"과 "서버가 알림을 거는 오늘"이 새벽에
// 하루씩 어긋난다.
//
// 왜 여기냐: `_shared/`는 두 런타임이 모두 확실히 집어가는 유일한 폴더다
// (DEFAULT_HOMEWORK_REMIND_AT이 같은 이유로 여기 있다 — homeworkReminder.ts 주석 참고).
//
// ⚠️ 이 파일은 브라우저 번들에도 들어간다 — Deno API를 여기 쓰면 앱 빌드가 깨진다.

/**
 * 하루가 넘어가는 시각(로컬 기준 시). 자정이 아니라 새벽 4시다.
 *
 * 학생이 타이머를 켜고 공부하다 밤 12시가 지나면 그때까지 한 공부가 전부 사라지던 문제 때문에
 * 옮겼다. 학생에게 "오늘"은 자정이 아니라 자기 전까지다. 자세한 배경은 src/lib.ts의 dayKeyOf에.
 */
export const DAY_ROLLOVER_HOUR = 4;

/**
 * "HH:MM"이 하루 시작(새벽 4시)으로부터 몇 분 지났는지. 0 이상 1440 미만.
 *
 * 하루가 04:00에 시작하므로 벽시계 문자열을 그대로 비교하면 새벽 시각이 뒤집힌다 —
 * 예를 들어 알림을 00:01로 걸어두면 `"04:00" >= "00:01"`이 참이라 하루가 시작하자마자
 * 새벽 4시에 발송된다. 두 시각을 다 이 값으로 바꿔서 비교하면 하루 안에서의 순서가 맞는다.
 *
 * 04:00 → 0, 21:00 → 1020, 00:01 → 1201, 03:59 → 1439.
 */
export function minutesSinceDayStart(time: string): number {
  // 잘못된 문자열은 조용히 넘기지 않고 던진다. 예전에는 `''`·`'abc'`·`'25:99'`가 그대로
  // NaN이 됐는데, 비교식이 `NaN < NaN`이면 false라 **"알림 시각 전" 판정이 통째로 무력화되어
  // 설정한 시각과 무관하게 알림이 나갔다.** 조용한 오작동보다 터지는 쪽이 낫다 —
  // 부르는 쪽에서 학생 단위로 잡아 그 학생만 건너뛴다.
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!match) throw new Error(`Invalid time: ${time}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error(`Invalid time: ${time}`);

  return (hour * 60 + minute - DAY_ROLLOVER_HOUR * 60 + 24 * 60) % (24 * 60);
}
