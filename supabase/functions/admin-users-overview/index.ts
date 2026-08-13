import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateRequest, AuthError } from '../_shared/authClient.ts';
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

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
      return new Response(JSON.stringify({ error: '관리자만 볼 수 있어요' }), { status: 403, headers: corsHeaders });
    }

    // 이메일은 sb_profiles에 없다(auth.users에만 있음) — 서비스 롤로 가입자 목록을 받아 id->email로 합친다.
    const emailById = new Map<string, string>();
    let page = 1;
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      for (const u of data.users) emailById.set(u.id, u.email ?? '');
      if (data.users.length < 1000) break;
      page += 1;
    }

    const [{ data: profiles, error: profilesError }, { data: links, error: linksError }] = await Promise.all([
      admin.from('sb_profiles').select('id, role, grade, onboarded_at'),
      admin.from('sb_student_manager_links').select('student_id, manager_id'),
    ]);
    if (profilesError) throw profilesError;
    if (linksError) throw linksError;

    const linkedCountByStudent = new Map<string, number>();
    const linkedCountByManager = new Map<string, number>();
    for (const l of links ?? []) {
      linkedCountByStudent.set(l.student_id, (linkedCountByStudent.get(l.student_id) ?? 0) + 1);
      linkedCountByManager.set(l.manager_id, (linkedCountByManager.get(l.manager_id) ?? 0) + 1);
    }

    const users = (profiles ?? []).map((p) => ({
      id: p.id,
      email: emailById.get(p.id) ?? '(알 수 없음)',
      role: p.role as 'student' | 'manager',
      grade: p.grade as string | null,
      onboardedAt: p.onboarded_at as string,
      linkedCount: p.role === 'student' ? (linkedCountByStudent.get(p.id) ?? 0) : (linkedCountByManager.get(p.id) ?? 0),
    }));

    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const stats = {
      totalStudents: users.filter((u) => u.role === 'student').length,
      totalManagers: users.filter((u) => u.role === 'manager').length,
      signupsToday: users.filter((u) => u.onboardedAt.slice(0, 10) === todayKey).length,
      signupsThisWeek: users.filter((u) => u.onboardedAt >= weekAgo).length,
    };

    return new Response(JSON.stringify({ users, stats }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: corsHeaders });
  }
});
