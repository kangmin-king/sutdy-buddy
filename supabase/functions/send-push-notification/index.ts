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

  try {
    await authenticateRequest(req);
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

    // 수신자는 이 요청을 보낸 사람이 아니므로(예: 선생님이 학생에게), RLS를 우회하는
    // service-role 클라이언트로 수신자의 기기 토큰을 조회해야 한다.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
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
