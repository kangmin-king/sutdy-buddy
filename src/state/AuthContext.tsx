import React from 'react';
import type { Session } from '@supabase/supabase-js';
import { App as CapacitorApp } from '@capacitor/app';
import { supabase } from '../lib/supabase';
import { completeNativeSignIn, isNativeApp } from '../lib/socialAuth';
import { track, identifyUser, resetIdentity, setOnceUserProperties } from '../lib/analytics';

// 소셜 로그인은 "가입"과 "재로그인"이 같은 콜백으로 돌아온다. 계정이 방금 만들어졌는지는
// user.created_at으로만 구분할 수 있어서, 이 창(초) 안에 만들어진 계정이면 가입으로 본다.
const SIGNUP_DETECTION_WINDOW_MS = 60_000;

interface AuthValue {
  session: Session | null;
  loading: boolean;
  // 이메일의 "비밀번호 재설정" 링크를 타고 들어온 세션인지 여부. true인 동안은 평소 앱 대신
  // 새 비밀번호 설정 화면을 보여줘야 한다 — 그냥 로그인된 것처럼 홈으로 들여보내면 안 된다.
  passwordRecovery: boolean;
  clearPasswordRecovery: () => void;
  signOut: () => Promise<void>;
  /**
   * 회원 탈퇴. 성공하면 계정과 학습 데이터가 지워지고 세션도 끊긴다.
   * 실패하면 사람이 읽을 메시지를 담아 throw한다 — 호출한 화면이 그걸 보여줘야 한다.
   */
  deleteAccount: () => Promise<void>;
}

const AuthContext = React.createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [passwordRecovery, setPasswordRecovery] = React.useState(false);

  // 이미 로그인된 사용자로 이 탭에서 이벤트를 보내고 있는지. 새로고침으로 세션이 "복구"된 것과
  // 실제로 방금 로그인한 것을 구분해서, 새로고침마다 Signed In이 찍히지 않게 한다.
  const signedInUserId = React.useRef<string | null>(null);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session) {
        signedInUserId.current = data.session.user.id;
        identifyUser(data.session.user.id);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);

      if (nextSession && signedInUserId.current !== nextSession.user.id) {
        const user = nextSession.user;
        signedInUserId.current = user.id;
        identifyUser(user.id);
        // 세션 복구(INITIAL_SESSION)나 토큰 갱신은 "로그인 행동"이 아니다.
        if (event !== 'SIGNED_IN') return;

        const method = (user.app_metadata.provider as string | undefined) ?? 'email';
        const isFreshAccount = Date.now() - Date.parse(user.created_at) < SIGNUP_DETECTION_WINDOW_MS;
        // 이메일 가입은 역할까지 아는 AuthScreen에서 이미 Signed Up을 보냈다. 여기서 또 보내면
        // 이중 집계가 된다 — 소셜 가입만 여기서 처리한다.
        if (isFreshAccount && method !== 'email') {
          setOnceUserProperties({ signup_method: method, signed_up_at: user.created_at });
          track('Signed Up', { method });
        }
        track('Signed In', { method });
        return;
      }

      if (!nextSession && signedInUserId.current) {
        signedInUserId.current = null;
        track('Signed Out');
        resetIdentity();
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // 네이티브 앱의 소셜 로그인은 시스템 브라우저에서 끝나고 com.studybuddy.app:// 딥링크로
  // 돌아온다. 웹처럼 페이지 로드가 일어나지 않으니 detectSessionInUrl이 잡아주지 못해서,
  // 여기서 직접 받아 세션을 세운다. 세션이 서면 위 onAuthStateChange가 이어받는다.
  React.useEffect(() => {
    if (!isNativeApp()) return;
    const handle = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      void completeNativeSignIn(url);
    });
    return () => {
      void handle.then((h) => h.remove());
    };
  }, []);

  const signOut = React.useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const deleteAccount = React.useCallback(async () => {
    // 계정이 사라지기 전에 이벤트를 보낸다 — 지운 다음에는 이 사용자로 아무것도 남길 수 없다.
    track('Deleted Account');

    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>('delete-account');
    // invoke는 4xx/5xx를 error로 주지만 본문의 error 메시지는 여기 담기지 않는다. 함수가 돌려준
    // 한국어 메시지를 살리려고 양쪽을 다 본다.
    if (error || data?.error || !data?.ok) {
      throw new Error(data?.error ?? '탈퇴 처리에 실패했어요. 잠시 후 다시 시도해 주세요.');
    }

    // 계정이 이미 없으므로 서버 쪽 로그아웃은 실패할 수 있다. 로컬 세션을 비우는 게 목적이라
    // 실패를 삼키고 넘어간다 — 안 그러면 지워진 계정으로 로그인된 화면에 남는다.
    try {
      await supabase.auth.signOut();
    } catch {
      /* 무시 */
    }
    resetIdentity();
  }, []);

  const clearPasswordRecovery = React.useCallback(() => setPasswordRecovery(false), []);

  return (
    <AuthContext.Provider value={{ session, loading, passwordRecovery, clearPasswordRecovery, signOut, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
