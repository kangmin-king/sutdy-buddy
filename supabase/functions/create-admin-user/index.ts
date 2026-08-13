import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateRequest, AuthError } from '../_shared/authClient.ts';
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

interface RequestBody {
  email: string;
}

function randomPassword(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
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

    // 호출자가 관리자(role='admin')인지 서비스 롤로 직접 확인한다 — 운영자는 새 계정을 만들 수 없다.
    const { data: caller, error: callerError } = await admin.from('sb_admin_users').select('role').eq('id', callerId).maybeSingle();
    if (callerError) throw callerError;
    if (!caller || caller.role !== 'admin') {
      return new Response(JSON.stringify({ error: '관리자만 운영자 계정을 만들 수 있어요' }), { status: 403, headers: corsHeaders });
    }

    const { email }: RequestBody = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: 'email이 필요해요' }), { status: 400, headers: corsHeaders });
    }

    const password = randomPassword();
    const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (createError) throw createError;

    const { error: insertError } = await admin.from('sb_admin_users').insert({ id: created.user.id, role: 'operator' });
    if (insertError) throw insertError;

    return new Response(JSON.stringify({ email, password }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: corsHeaders });
  }
});
