import React from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import { isNativePlatform } from './distractionStop';

// 안드로이드 네이티브에서만 동작(딴짓 멈춰와 같은 게이팅 재사용 — 이 앱은 아직 iOS 푸시를 지원하지
// 않는다). 권한을 요청하고 등록하면 'registration' 이벤트로 FCM 토큰이 온다 — 그걸 그대로
// 서버(sb_device_tokens)에 저장하면 된다. 실패해도(권한 거부 등) 조용히 무시한다 — 알림은
// 부가 기능이라 사용자가 막혀서는 안 된다.
export function usePushRegistration(onToken: (token: string) => void) {
  React.useEffect(() => {
    if (!isNativePlatform()) return;
    let cancelled = false;

    const registrationListener = PushNotifications.addListener('registration', (token) => {
      if (!cancelled) onToken(token.value);
    });
    const errorListener = PushNotifications.addListener('registrationError', (err) => {
      console.error('push registration failed:', err);
    });

    PushNotifications.requestPermissions().then((result) => {
      if (cancelled || result.receive !== 'granted') return;
      PushNotifications.register();
    });

    return () => {
      cancelled = true;
      registrationListener.then((h) => h.remove());
      errorListener.then((h) => h.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
