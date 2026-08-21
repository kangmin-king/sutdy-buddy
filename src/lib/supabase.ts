import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/db';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in values.');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    // 소셜 로그인 콜백과 비밀번호 재설정 링크는 둘 다 토큰을 URL 해시에 담아 돌아온다. 이게
    // 꺼져 있으면 supabase-js가 그 해시를 읽지 않아서, 재설정 링크를 눌러도 세션이 안 생기고
    // PASSWORD_RECOVERY 이벤트도 안 떠서 그냥 로그인 화면만 보인다.
    detectSessionInUrl: true,
    // implicit 유지(PKCE 쓰지 않음). PKCE는 code_verifier를 요청을 시작한 쪽 저장소에서 찾는데,
    // 비밀번호 재설정은 앱 웹뷰에서 요청하고 링크는 폰 기본 브라우저에서 열리므로 저장소가 달라
    // 교환이 실패한다. implicit은 링크 자체에 토큰이 담겨 와서 브라우저가 달라도 동작한다.
    flowType: 'implicit',
  },
});
