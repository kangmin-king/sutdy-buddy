import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateRequest, AuthError } from '../_shared/authClient.ts';
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { sendFcmMessage } from '../_shared/fcm.ts';

interface RequestBody {
  userId: string;
  title: string;
  body: string;
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  // 호출자가 누구인지 반드시 붙잡아 둔다. 예전에는 결과를 버리고 "로그인했는지"만 봤는데,
  // 그러면 수신자를 요청 본문이 정하게 되어 **로그인한 아무나 임의 사용자에게 임의 문구의
  // 푸시를 보낼 수 있었다**(service role로 토큰을 조회하므로 RLS도 막지 못한다).
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
    const { userId, title, body }: RequestBody = await req.json();
    if (!userId || !title || !body) {
      return new Response(JSON.stringify({ error: 'userId, title, body are required' }), { status: 400, headers: corsHeaders });
    }

    // 알림 문구는 호출자가 보내오므로 길이를 제한한다. FCM 자체 한도와 무관하게,
    // 연결된 상대에게 긴 본문을 반복 전송하는 것을 막는 최소한의 상한이다.
    if (title.length > 100 || body.length > 300) {
      return new Response(JSON.stringify({ error: 'title/body too long' }), { status: 400, headers: corsHeaders });
    }

    // 수신자는 이 요청을 보낸 사람이 아니므로(예: 선생님이 학생에게), RLS를 우회하는
    // service-role 클라이언트로 수신자의 기기 토큰을 조회해야 한다.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // **수신자는 호출자와 연결된 사람이어야 한다.** 앱의 모든 호출부가 학생↔매니저 쌍이므로
    // (학생이 자기 매니저에게, 매니저가 자기 학생에게) 이 제약으로 정상 동작은 깨지지 않는다.
    //
    // 두 컬럼에 각각 `in [호출자, 수신자]`를 걸면 두 사람이 어느 쪽 역할이든 걸린다.
    // `.or()`에 UUID를 문자열로 보간하는 방식은 쓰지 않는다 — userId가 요청 본문에서 오므로
    // PostgREST 필터 구문을 주입할 수 있다. `.in()`은 값이 파라미터로 인코딩된다.
    if (userId !== callerId) {
      const pair = [callerId, userId];
      const { data: link, error: linkError } = await admin
        .from('sb_student_manager_links')
        .select('id')
        .in('student_id', pair)
        .in('manager_id', pair)
        .limit(1)
        .maybeSingle();
      if (linkError) throw linkError;
      if (!link) {
        // 정상 호출은 전부 학생↔매니저 쌍이므로 여기 걸리면 ① 공격이거나 ② 내가 놓친
        // 정상 경로다. 클라이언트는 푸시 실패를 콘솔에만 남기고 조용히 지나가므로,
        // ②를 나중에 알아챌 수 있도록 서버 로그에 남긴다.
        console.warn(`push rejected: ${callerId.slice(0, 8)} -> ${userId.slice(0, 8)} (not linked)`);
        return new Response(JSON.stringify({ error: '연결된 사용자에게만 보낼 수 있어요' }), { status: 403, headers: corsHeaders });
      }
    }

    const { data: tokens, error: tokensError } = await admin.from('sb_device_tokens').select('id, fcm_token').eq('user_id', userId);
    if (tokensError) throw tokensError;
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers: corsHeaders });
    }

    let sent = 0;
    const staleIds: string[] = [];
    for (const row of tokens) {
      const result = await sendFcmMessage(row.fcm_token, title, body);
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
