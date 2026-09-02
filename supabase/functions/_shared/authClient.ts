import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export class AuthError extends Error {}

export interface AuthedRequest {
  supabase: SupabaseClient;
  userId: string;
}

export async function authenticateRequest(req: Request): Promise<AuthedRequest> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new AuthError('Missing Authorization header');
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });

  const jwt = authHeader.replace('Bearer ', '');
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user) {
    throw new AuthError('Invalid or expired session');
  }
  return { supabase, userId: data.user.id };
}

// 서명 검증은 이미 끝난 토큰의 payload에서 role 클레임만 읽는다. 서명을 여기서 다시 검증하지
// 않으므로 **게이트웨이의 JWT 검증(verify_jwt, 배포 기본값)에 의존한다** — 이 함수를
// --no-verify-jwt로 배포하면 role 클레임을 위조할 수 있게 되니 그렇게 배포하지 말 것.
function readJwtRole(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded));
    return typeof claims.role === 'string' ? claims.role : null;
  } catch {
    return null;
  }
}

// cron(pg_net)이 부르는 함수에는 사용자 세션이 없다. 플랫폼의 JWT 검증은 서비스 롤 키로
// 통과하지만 authenticateRequest는 통과하지 못한다 — auth.getUser가 돌려줄 사용자가 없다.
//
// 판정을 두 갈래로 두는 이유: 프로젝트가 새 API 키 체계를 쓰면 런타임에 주입되는
// SUPABASE_SERVICE_ROLE_KEY가 `sb_secret_...` 형식인데, 호출자(cron)는 Vault에 넣어둔 legacy
// service_role JWT를 들고 온다. 그러면 문자열 비교는 영원히 어긋난다(2026-09-02에 실제로 겪음).
// 그래서 ① 주입된 키와 정확히 같은가, 아니면 ② 게이트웨이가 검증해준 JWT의 role이
// service_role인가 — 둘 중 하나면 통과시킨다. anon/publishable 키는 role이 다르므로 걸러진다.
export function authenticateServiceRole(req: Request): void {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new AuthError('Missing Authorization header');

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceRoleKey && token === serviceRoleKey) return;
  if (readJwtRole(token) === 'service_role') return;

  throw new AuthError('This function is callable with the service role key only');
}
