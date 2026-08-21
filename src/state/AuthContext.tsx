import React from 'react';
import type { Session } from '@supabase/supabase-js';
import { App as CapacitorApp } from '@capacitor/app';
import { supabase } from '../lib/supabase';
import { completeNativeSignIn, isNativeApp } from '../lib/socialAuth';

interface AuthValue {
  session: Session | null;
  loading: boolean;
  // 이메일의 "비밀번호 재설정" 링크를 타고 들어온 세션인지 여부. true인 동안은 평소 앱 대신
  // 새 비밀번호 설정 화면을 보여줘야 한다 — 그냥 로그인된 것처럼 홈으로 들여보내면 안 된다.
  passwordRecovery: boolean;
  clearPasswordRecovery: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [passwordRecovery, setPasswordRecovery] = React.useState(false);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
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

  const clearPasswordRecovery = React.useCallback(() => setPasswordRecovery(false), []);

  return (
    <AuthContext.Provider value={{ session, loading, passwordRecovery, clearPasswordRecovery, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
