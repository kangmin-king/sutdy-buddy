import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateServiceRole, AuthError } from '../_shared/authClient.ts';
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { sendFcmMessage } from '../_shared/fcm.ts';
import { selectReminderTargets } from './reminderTargets.ts';
import { DEFAULT_HOMEWORK_REMIND_AT } from '../_shared/homeworkReminder.ts';

// 앱의 날짜·시간 계산은 전부 학생이 실제로 겪는 로컬 시각 기준이다(todayKey, toMinutesOfDay).
// 서버는 UTC로 돌기 때문에 여기서 명시적으로 변환해야 "오늘"과 알림 시각이 학생과 같은 뜻이 된다.
const TIME_ZONE = 'Asia/Seoul';

function nowInSeoul(): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    authenticateServiceRole(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return new Response(JSON.stringify({ error: err.message }), { status: 401, headers: corsHeaders });
    }
    throw err;
  }

  try {
    // 전 학생을 훑어야 하고 수신자도 자기 자신이 아니므로 처음부터 service-role로 돈다.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { date: today, time: now } = nowInSeoul();

    // 자기계획(source: 'self')은 세지 않는다 — 매니저에게 알릴 신호는 "시킨 숙제를 시작했는지"다.
    // 오늘 숙제가 아예 없으면 알릴 것도 없다(아무것도 배정하지 않은 날).
    const { data: items, error: itemsError } = await admin
      .from('sb_planner_items')
      .select('id, user_id, status')
      .eq('date', today)
      .eq('source', 'homework');
    if (itemsError) throw itemsError;
    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ today, now, checked: 0, notified: 0, sent: 0, alreadySent: 0, skipped: { disabled: 0, beforeTime: 0, started: 0 } }),
        { status: 200, headers: corsHeaders }
      );
    }

    const homeworkItems = items.map((item) => ({ id: item.id, studentId: item.user_id, status: item.status }));
    const studentIds = Array.from(new Set(homeworkItems.map((i) => i.studentId)));

    const { data: settingRows, error: settingsError } = await admin
      .from('sb_homework_reminder_settings')
      .select('student_id, remind_at, enabled')
      .in('student_id', studentIds);
    if (settingsError) throw settingsError;
    const settings: Record<string, { remindAt: string; enabled: boolean }> = {};
    for (const row of settingRows ?? []) {
      settings[row.student_id] = { remindAt: row.remind_at, enabled: row.enabled };
    }

    // 오늘 숙제 항목에 붙은 학습 세션. 세션 행은 학생이 "시작"을 눌러야 생기므로, 한 건이라도
    // 있으면 시작한 것이다(일시정지·재시작으로 여러 행이 쌓여도 판정은 같다).
    const { data: sessions, error: sessionsError } = await admin
      .from('sb_study_sessions')
      .select('planner_item_id')
      .in('planner_item_id', items.map((i) => i.id));
    if (sessionsError) throw sessionsError;
    const startedItemIds = (sessions ?? []).map((s) => s.planner_item_id);

    // 누가 대상인지의 판정은 전부 순수 함수에 있다(reminderTargets.ts + 그 테스트).
    const { targets, skipped } = selectReminderTargets({
      now,
      homeworkItems,
      settings,
      startedItemIds,
      defaultRemindAt: DEFAULT_HOMEWORK_REMIND_AT,
    });

    // 응답을 한 곳에서 만든다. skipped와 alreadySent를 늘 실어 보내는 이유: notified가 0일 때
    // "대상이 없었다"와 "오늘 이미 보냈다"를 구분하려고 DB를 뒤지는 일이 없어야 한다.
    const summary = (counts: { notified: number; sent: number; alreadySent: number }) =>
      new Response(JSON.stringify({ today, now, checked: studentIds.length, ...counts, skipped }), {
        status: 200,
        headers: corsHeaders,
      });

    if (targets.length === 0) return summary({ notified: 0, sent: 0, alreadySent: 0 });

    // 발송 기록을 **보내기 전에** 남긴다. (student_id, date) 유니크에 걸려 이미 있으면 빈 배열이
    // 돌아오므로, 15분마다 도는 cron 중 하루 첫 번째만 통과한다.
    // 트레이드오프: FCM이 일시적으로 실패해도 오늘은 다시 시도하지 않는다 — 매니저에게 같은
    // 잔소리를 여러 번 보내는 쪽이 한 번 놓치는 쪽보다 나쁘다고 봤다. 실패는 로그에 남는다.
    const { data: claimed, error: claimError } = await admin
      .from('sb_homework_reminder_log')
      .upsert(
        targets.map((t) => ({ student_id: t.studentId, date: today })),
        { onConflict: 'student_id,date', ignoreDuplicates: true }
      )
      .select('student_id');
    if (claimError) throw claimError;

    const claimedIds = new Set((claimed ?? []).map((row) => row.student_id));
    const toNotify = targets.filter((t) => claimedIds.has(t.studentId));
    if (toNotify.length === 0) return summary({ notified: 0, sent: 0, alreadySent: targets.length });

    const { data: links, error: linksError } = await admin
      .from('sb_student_manager_links')
      .select('student_id, manager_id, label')
      .in('student_id', toNotify.map((t) => t.studentId));
    if (linksError) throw linksError;

    const managerIds = Array.from(new Set((links ?? []).map((l) => l.manager_id)));
    const { data: tokens, error: tokensError } = await admin
      .from('sb_device_tokens')
      .select('id, user_id, fcm_token')
      .in('user_id', managerIds.length > 0 ? managerIds : ['00000000-0000-0000-0000-000000000000']);
    if (tokensError) throw tokensError;

    const tokensByManager = new Map<string, { id: string; fcm_token: string }[]>();
    for (const row of tokens ?? []) {
      const list = tokensByManager.get(row.user_id) ?? [];
      list.push({ id: row.id, fcm_token: row.fcm_token });
      tokensByManager.set(row.user_id, list);
    }

    const targetById = new Map(toNotify.map((t) => [t.studentId, t]));
    let sent = 0;
    const staleIds: string[] = [];

    for (const link of links ?? []) {
      const target = targetById.get(link.student_id);
      if (!target) continue;

      // 매니저가 자기 화면에서 쓰는 별칭을 그대로 쓴다 — 알림에서도 앱 안에서 부르던 이름으로
      // 보여야 누구 얘기인지 바로 안다. 별칭이 없으면 담당 학생이 한 명인 경우가 대부분이다.
      const label = link.label || '학생';
      const title = '오늘 숙제를 아직 시작하지 않았어요';
      const body = `${label} · ${target.remindAt} 기준, 오늘 숙제 ${target.homeworkCount}개 중 시작한 게 없어요`;

      for (const token of tokensByManager.get(link.manager_id) ?? []) {
        const result = await sendFcmMessage(token.fcm_token, title, body);
        if (result.ok) sent += 1;
        else if (result.staleToken) staleIds.push(token.id);
      }
    }

    if (staleIds.length > 0) {
      try {
        await admin.from('sb_device_tokens').delete().in('id', staleIds);
      } catch (cleanupErr) {
        console.error('stale device token cleanup failed:', cleanupErr);
      }
    }

    return summary({ notified: toNotify.length, sent, alreadySent: targets.length - toNotify.length });
  } catch (err) {
    console.error('homework-not-started-reminder failed:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: corsHeaders });
  }
});
