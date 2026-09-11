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
    // 엣지 함수는 UTC로 돈다. `toISOString().slice(0, 10)`은 **UTC 날짜**라, 한국 시간으로
    // 오늘 새벽에 가입한 사람과 어제 저녁에 가입한 사람이 같은 칸에 들어간다(9시간 밀린 창).
    // 이 화면을 보는 사람은 한국 날짜를 기대하므로 서울 기준으로 날짜 키를 만든다.
    // (앱의 "하루는 새벽 4시" 규칙은 학생의 공부 하루를 위한 것이고, 가입 통계는
    //  달력 날짜가 맞다 — 여기서 4시를 쓰면 관리자가 오히려 헷갈린다.)
    const dateKeyInSeoul = (date: Date): string =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

    const todayKey = dateKeyInSeoul(now);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const stats = {
      totalStudents: users.filter((u) => u.role === 'student').length,
      totalManagers: users.filter((u) => u.role === 'manager').length,
      signupsToday: users.filter((u) => dateKeyInSeoul(new Date(u.onboardedAt)) === todayKey).length,
      // 최근 7일은 "지금부터 168시간 전"이라 시간대와 무관하다 — 그대로 둔다.
      signupsThisWeek: users.filter((u) => u.onboardedAt >= weekAgo).length,
    };

    return new Response(JSON.stringify({ users, stats }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: corsHeaders });
  }
});
