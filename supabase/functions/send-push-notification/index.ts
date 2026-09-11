import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateRequest, AuthError } from '../_shared/authClient.ts';
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { sendFcmMessage } from '../_shared/fcm.ts';

/**
 * 푸시 알림. **문구도 수신자도 서버가 정한다.**
 *
 * 예전에는 `{ userId, title, body }`를 그대로 받아서 보냈다. 인증은 "로그인했는지"만 봤으므로
 * 로그인한 아무나 임의 사용자에게 임의 문구를 보낼 수 있었고, 관계 확인을 넣은 뒤에도
 * **연결된 쌍 안에서는 여전히 아무 문구나 보낼 수 있었다** — 학생이 자기 선생님에게 가짜
 * "숙제를 완료했어요"를 보내는 것이 가능했다는 뜻이다.
 *
 * 이 앱의 전제는 "숙제를 했는지를 기록으로 증명한다"이다. 알림이 기록과 무관하게 만들어질 수
 * 있으면 그 전제가 무너진다. 그래서 클라이언트는 **어떤 행에 대한 어떤 사건인지만** 말하고,
 * 서버가 그 행을 직접 읽어 ① 사건이 사실인지 ② 누가 받아야 하는지 ③ 뭐라고 쓸지를 전부 정한다.
 * 클라이언트가 보낸 문구·수신자는 아예 받지 않는다.
 */

type EventName =
  | 'planner_item_created_self'
  | 'planner_item_completed'
  | 'homework_assigned'
  | 'homework_updated'
  | 'homework_proposed'
  | 'exam_range_assigned'
  | 'exam_range_updated';

interface RequestBody {
  event: EventName;
  /** 이 사건이 가리키는 행의 id. 사건 종류에 따라 planner item / assignment / proposal / range. */
  refId: string;
}

interface Message {
  recipientIds: string[];
  title: string;
  body: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 학생과 연결된 매니저 전원. 배정자를 특정할 수 없는 사건(자기계획)에서 수신자로 쓴다. */
async function linkedManagerIds(admin: SupabaseClient, studentId: string): Promise<string[]> {
  const { data, error } = await admin.from('sb_student_manager_links').select('manager_id').eq('student_id', studentId);
  if (error) throw error;
  return (data ?? []).map((r) => r.manager_id as string);
}

/** 교재명이 있으면 "쎈 수학 학습을 완료했어요", 없으면 일반 문구. */
function withMaterial(material: string | null, withText: (m: string) => string, fallback: string): string {
  const m = (material ?? '').trim();
  return m ? withText(m) : fallback;
}

/**
 * 사건이 사실인지 DB로 확인하고, 수신자와 문구를 만든다.
 * 사실이 아니거나 호출자가 그 사건의 주체가 아니면 null — 그러면 아무것도 보내지 않는다.
 */
async function buildMessage(admin: SupabaseClient, callerId: string, body: RequestBody): Promise<Message | null> {
  switch (body.event) {
    // ── 학생이 주체인 사건. 항목이 **호출자 본인의 것**이어야 한다. ──────────────────────
    case 'planner_item_created_self':
    case 'planner_item_completed': {
      const { data: item, error } = await admin
        .from('sb_planner_items')
        .select('user_id, status, material, source, homework_assignment_id, exam_subject_range_id')
        .eq('id', body.refId)
        .maybeSingle();
      if (error) throw error;
      if (!item || item.user_id !== callerId) return null;

      if (body.event === 'planner_item_created_self') {
        // "스스로 계획을 세웠다"는 주장은 source가 실제로 self일 때만 참이다.
        if (item.source !== 'self') return null;
        return {
          recipientIds: await linkedManagerIds(admin, callerId),
          title: '학생이 스스로 계획을 세웠어요',
          body: withMaterial(item.material, (m) => `${m} 계획을 새로 추가했어요`, '새 계획을 추가했어요'),
        };
      }

      // **완료 알림은 DB가 실제로 completed일 때만 나간다.** 여기가 이 함수의 핵심이다 —
      // 예전에는 클라이언트가 문구를 만들어 보냈으므로 아무 때나 "완료했어요"를 보낼 수 있었다.
      if (item.status !== 'completed') return null;

      // 배정한 사람이 있으면 그 사람에게, 자기계획이면 연결된 매니저 전원에게.
      // (클라이언트가 수신자를 고르지 않는다 — 체인을 서버가 탄다.)
      let assignerId: string | null = null;
      if (item.homework_assignment_id) {
        const { data: a, error: e } = await admin
          .from('sb_homework_assignments')
          .select('created_by')
          .eq('id', item.homework_assignment_id)
          .maybeSingle();
        if (e) throw e;
        assignerId = (a?.created_by as string) ?? null;
      } else if (item.exam_subject_range_id) {
        const { data: r, error: e } = await admin
          .from('sb_exam_subject_ranges')
          .select('sb_exam_subjects!inner(sb_exam_records!inner(created_by))')
          .eq('id', item.exam_subject_range_id)
          .maybeSingle();
        if (e) throw e;
        // PostgREST 중첩 결과는 배열/객체가 섞여 오므로 방어적으로 푼다.
        const subj = (r as Record<string, unknown> | null)?.['sb_exam_subjects'];
        const subjOne = Array.isArray(subj) ? subj[0] : subj;
        const rec = (subjOne as Record<string, unknown> | undefined)?.['sb_exam_records'];
        const recOne = Array.isArray(rec) ? rec[0] : rec;
        assignerId = ((recOne as Record<string, unknown> | undefined)?.['created_by'] as string) ?? null;
      }

      const isSelf = item.source === 'self' || assignerId === null;
      return {
        recipientIds: assignerId ? [assignerId] : await linkedManagerIds(admin, callerId),
        title: isSelf ? '학생이 세운 계획을 완료했어요' : '학생이 숙제를 완료했어요',
        body: withMaterial(
          item.material,
          (m) => `${m} 학습을 완료했어요`,
          isSelf ? '스스로 세운 계획을 완료했어요' : '배정한 학습을 완료했어요'
        ),
      };
    }

    // ── 매니저가 주체인 사건. 그 행을 **호출자가 만든** 것이어야 한다. ────────────────────
    case 'homework_assigned':
    case 'homework_updated': {
      const { data: a, error } = await admin
        .from('sb_homework_assignments')
        .select('student_id, created_by, material')
        .eq('id', body.refId)
        .maybeSingle();
      if (error) throw error;
      if (!a || a.created_by !== callerId) return null;
      return {
        recipientIds: [a.student_id as string],
        title: body.event === 'homework_assigned' ? '숙제가 등록됐어요' : '숙제 내용이 바뀌었어요',
        body:
          body.event === 'homework_assigned'
            ? withMaterial(a.material as string, (m) => `${m} 숙제가 새로 등록됐어요`, '새 숙제가 등록됐어요')
            : '숙제 내용이 수정됐어요. 확인해보세요',
      };
    }

    case 'homework_proposed': {
      const { data: p, error } = await admin
        .from('sb_homework_proposals')
        .select('student_id, manager_id, material')
        .eq('id', body.refId)
        .maybeSingle();
      if (error) throw error;
      if (!p || p.manager_id !== callerId) return null;
      return {
        recipientIds: [p.student_id as string],
        title: '숙제 제안이 왔어요',
        body: withMaterial(p.material as string, (m) => `${m} 숙제를 제안했어요. 확인해보세요`, '새 숙제를 제안했어요'),
      };
    }

    case 'exam_range_assigned':
    case 'exam_range_updated': {
      const { data: r, error } = await admin
        .from('sb_exam_subject_ranges')
        .select('material, sb_exam_subjects!inner(sb_exam_records!inner(student_id, created_by))')
        .eq('id', body.refId)
        .maybeSingle();
      if (error) throw error;
      if (!r) return null;
      const subj = (r as Record<string, unknown>)['sb_exam_subjects'];
      const subjOne = Array.isArray(subj) ? subj[0] : subj;
      const rec = (subjOne as Record<string, unknown> | undefined)?.['sb_exam_records'];
      const recOne = (Array.isArray(rec) ? rec[0] : rec) as Record<string, unknown> | undefined;
      if (!recOne || recOne['created_by'] !== callerId) return null;
      return {
        recipientIds: [recOne['student_id'] as string],
        title: body.event === 'exam_range_assigned' ? '숙제가 등록됐어요' : '숙제 내용이 바뀌었어요',
        body:
          body.event === 'exam_range_assigned'
            ? withMaterial(r.material as string, (m) => `${m} 숙제가 새로 등록됐어요`, '새 숙제가 등록됐어요')
            : '숙제 내용이 수정됐어요. 확인해보세요',
      };
    }

    default:
      return null;
  }
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  let callerId: string;
  try {
    const authed = await authenticateRequest(req);
    callerId = authed.userId;
  } catch (err) {
    if (err instanceof AuthError) {
      return new Response(JSON.stringify({ error: err.message }), { status: 401, headers: corsHeaders });
    }
    throw err;
  }

  try {
    const parsed: Partial<RequestBody> = await req.json();
    if (!parsed.event || !parsed.refId || !UUID_RE.test(parsed.refId)) {
      // 구버전 앱은 { userId, title, body }를 보낸다. 그 형태는 **의도적으로 더 이상 받지 않는다** —
      // 그 경로가 바로 가짜 알림을 만들 수 있던 구멍이다. 구버전 사용자는 v1.2.8을 설치하면 된다
      // (어차피 legacy 키를 끄면 구버전은 서버에 못 붙는다).
      return new Response(JSON.stringify({ error: 'event와 refId가 필요해요' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const message = await buildMessage(admin, callerId, parsed as RequestBody);
    if (!message) {
      // 사건이 사실이 아니거나 호출자가 그 사건의 주체가 아니다. 클라이언트에는 200으로
      // 조용히 돌려준다(알림은 부가 동작이고, 무엇이 틀렸는지 알려주면 탐색에 쓰인다).
      // 다만 정상 경로에서는 안 나와야 하는 값이므로 서버 로그에는 남긴다.
      console.warn(`push skipped: caller=${callerId.slice(0, 8)} event=${parsed.event} ref=${String(parsed.refId).slice(0, 8)}`);
      return new Response(JSON.stringify({ sent: 0, skipped: true }), { status: 200, headers: corsHeaders });
    }

    if (message.recipientIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers: corsHeaders });
    }

    // 수신자는 이 요청을 보낸 사람이 아니므로(예: 선생님이 학생에게), RLS를 우회하는
    // service-role 클라이언트로 수신자의 기기 토큰을 조회해야 한다.
    const { data: tokens, error: tokensError } = await admin
      .from('sb_device_tokens')
      .select('id, fcm_token')
      .in('user_id', message.recipientIds);
    if (tokensError) throw tokensError;
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers: corsHeaders });
    }

    let sent = 0;
    const staleIds: string[] = [];
    for (const row of tokens) {
      const result = await sendFcmMessage(row.fcm_token, message.title, message.body);
      if (result.ok) sent += 1;
      else if (result.staleToken) staleIds.push(row.id);
    }

    if (staleIds.length > 0) {
      try {
        await admin.from('sb_device_tokens').delete().in('id', staleIds);
      } catch (cleanupErr) {
        console.error('stale device token cleanup failed:', cleanupErr);
      }
    }

    return new Response(JSON.stringify({ sent }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: corsHeaders });
  }
});
