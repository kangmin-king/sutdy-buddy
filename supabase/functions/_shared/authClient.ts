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

// cron(pg_net)이 부르는 함수에는 사용자 세션이 없다. 플랫폼의 JWT 검증은 서비스 롤 키로
// 통과하지만 authenticateRequest는 통과하지 못한다 — auth.getUser가 돌려줄 사용자가 없다.
// 그래서 이 경로는 서비스 롤 키 자체를 확인한다. 사람이 손으로 호출해 시험할 때도 같은 키를 쓴다.
export function authenticateServiceRole(req: Request): void {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  if (req.headers.get('Authorization') !== `Bearer ${serviceRoleKey}`) {
    throw new AuthError('This function is callable with the service role key only');
  }
}
