import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateRequest, AuthError } from '../_shared/authClient.ts';
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { sendFcmMessage } from '../_shared/fcm.ts';

interface RequestBody {
  title: string;
  body: string;
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
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: caller, error: callerError } = await admin.from('sb_admin_users').select('role').eq('id', callerId).maybeSingle();
    if (callerError) throw callerError;
    if (!caller || caller.role !== 'admin') {
      return new Response(JSON.stringify({ error: '관리자만 전체 공지를 보낼 수 있어요' }), { status: 403, headers: corsHeaders });
    }

    const { title, body }: RequestBody = await req.json();
    if (!title || !body) {
      return new Response(JSON.stringify({ error: 'title, body가 필요해요' }), { status: 400, headers: corsHeaders });
    }

    const { data: tokens, error: tokensError } = await admin.from('sb_device_tokens').select('id, fcm_token');
    if (tokensError) throw tokensError;

    let sent = 0;
    const staleIds: string[] = [];
    for (const row of tokens ?? []) {
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

    return new Response(JSON.stringify({ sent, total: (tokens ?? []).length }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: corsHeaders });
  }
});
