import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateRequest, AuthError } from '../_shared/authClient.ts';
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

interface RequestBody {
  userId: string;
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
      return new Response(JSON.stringify({ error: '관리자만 운영자 계정을 삭제할 수 있어요' }), { status: 403, headers: corsHeaders });
    }

    const { userId }: RequestBody = await req.json();
    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId가 필요해요' }), { status: 400, headers: corsHeaders });
    }
    if (userId === callerId) {
      return new Response(JSON.stringify({ error: '자기 자신은 삭제할 수 없어요' }), { status: 400, headers: corsHeaders });
    }

    // sb_admin_users 행은 auth.users에 on delete cascade가 걸려있어 auth 계정을 지우면 같이 지워진다.
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: corsHeaders });
  }
});
