import React from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { supabase } from './supabase';

export type SocialProvider = 'kakao' | 'google';

// 버튼에 보여줄 순서. 중고등학생에게는 카카오가 가장 익숙해서 위에 둔다.
const PROVIDER_ORDER: SocialProvider[] = ['kakao', 'google'];

// 네이티브 앱은 웹처럼 리다이렉트로 돌아올 수 없어서, 앱 전용 스킴으로 돌려받는다.
// AndroidManifest.xml의 intent-filter, Supabase의 Redirect URL 허용목록 양쪽에 같은 값이 있어야 한다.
const NATIVE_CALLBACK = 'com.studybuddy.app://auth-callback';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * 대시보드에서 켜진 provider만 버튼으로 보여준다. 코드에 목록을 박아두면 카카오를 켤 때마다
 * 앱을 다시 배포해야 해서, 실행 시점에 물어본다.
 */
export function useEnabledSocialProviders(): SocialProvider[] {
  // 구글은 이미 켜져 있는 게 확인된 상태라, 조회가 끝나기 전 빈 화면이 깜빡이지 않도록 기본값으로 둔다.
  const [providers, setProviders] = React.useState<SocialProvider[]>(['google']);

  React.useEffect(() => {
    let cancelled = false;
    const url = import.meta.env.VITE_SUPABASE_URL as string;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const external = (data?.external ?? {}) as Record<string, boolean>;
        setProviders(PROVIDER_ORDER.filter((p) => external[p]));
      })
      .catch(() => {
        // 조회 실패는 무시하고 기본값(구글)을 유지한다. 로그인 자체를 막을 이유는 없다.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return providers;
}

// 카카오 주의: Supabase(GoTrue)가 서버에서 scope에 account_email을 항상 붙인다. 클라이언트에서
// options.scopes로 줄일 수 없고(덧붙기만 된다), 카카오 앱에 이메일 동의항목 권한이 없으면
// KOE205로 거절당한다. 이메일 권한은 비즈 앱 전환(본인인증 필요)을 해야 열린다.
// 그때까지는 대시보드에서 Kakao provider를 꺼두면 버튼도 자동으로 사라진다.

export async function signInWithProvider(provider: SocialProvider): Promise<void> {
  const native = isNativeApp();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: native ? NATIVE_CALLBACK : window.location.origin,
      // 네이티브에서는 웹뷰를 그대로 구글로 보내면 안 된다(구글이 임베디드 웹뷰 로그인을 막는다).
      // URL만 받아서 시스템 브라우저로 연다.
      skipBrowserRedirect: native,
    },
  });
  if (error) throw error;
  if (native && data?.url) await Browser.open({ url: data.url });
}

/**
 * 딥링크로 앱에 돌아왔을 때 URL 해시의 토큰으로 세션을 세운다.
 * 로그인 콜백이 아니면 아무것도 하지 않고 false를 돌려준다.
 */
export async function completeNativeSignIn(url: string): Promise<boolean> {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return false;

  const params = new URLSearchParams(url.slice(hashIndex + 1));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return false;

  const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  // 로그인 창은 성공이든 실패든 닫는다. 열려 있으면 앱 위에 브라우저가 남는다.
  await Browser.close().catch(() => undefined);
  return !error;
}
