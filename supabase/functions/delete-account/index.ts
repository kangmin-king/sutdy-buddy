import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateRequest, AuthError } from '../_shared/authClient.ts';
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

/**
 * 로그인한 사용자가 **자기 계정**을 지운다. 클라이언트에서는 서비스 롤 키 없이 auth 계정을
 * 지울 수 없으므로 이 함수가 필요하다.
 *
 * 요청 본문에서 대상 id를 받지 않는 것이 이 함수의 핵심 안전장치다. 받는 순간, 서비스 롤 키를
 * 쥔 이 함수는 "로그인만 하면 누구든 지울 수 있는" 엔드포인트가 된다. 지울 대상은 항상
 * 게이트웨이가 검증한 JWT에서 나온 callerId 하나뿐이다.
 */
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

    // 운영자 계정은 이 경로로 지우지 않는다. 운영자 삭제는 delete-admin-user가 맡고 있고,
    // sb_banners.created_by가 auth.users를 on delete 규칙 없이 참조하므로 배너를 만든 운영자를
    // 여기서 지우면 FK에 막혀 실패한다. 실패를 사용자에게 500으로 던지지 않고 미리 막는다.
    const { data: adminRow, error: adminError } = await admin
      .from('sb_admin_users')
      .select('id')
      .eq('id', callerId)
      .maybeSingle();
    if (adminError) throw adminError;
    if (adminRow) {
      return new Response(
        JSON.stringify({ error: '운영자 계정은 이 방법으로 탈퇴할 수 없어요. 문의해 주세요.' }),
        { status: 403, headers: corsHeaders },
      );
    }

    // 학습 데이터 테이블은 전부 auth.users에 on delete cascade로 걸려 있다 — 프로필, 숙제 배정,
    // 숙제 제안, 학습 세션, 플래너, 학습 기록/자료, 시험 기록, 학교 시간표, 과외 일정,
    // 허용앱 사용 구간, 기기 토큰, 알림 설정/로그, 학생-관리자 연결. 그래서 auth 계정 하나를
    // 지우면 그 사람의 행이 함께 사라진다.
    const { error: deleteError } = await admin.auth.admin.deleteUser(callerId);
    if (deleteError) throw deleteError;

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: corsHeaders });
  }
});
