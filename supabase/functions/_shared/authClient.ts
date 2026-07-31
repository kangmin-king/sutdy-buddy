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
