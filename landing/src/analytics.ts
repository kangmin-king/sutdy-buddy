import * as amplitude from '@amplitude/unified';

/**
 * 랜딩 페이지의 Amplitude 연동. 본앱(src/lib/analytics.ts)과 같은 프로젝트 키를 쓴다 —
 * 유입(랜딩)에서 가입(앱)까지 한 사람으로 이어 봐야 하기 때문이다.
 *
 * 랜딩은 로그인이 없어서 user property를 직접 세팅할 일이 없다. 오토캡처의 Marketing
 * attribution이 붙여주는 utm/referrer user property가 사실상 전부다.
 */

// Amplitude ingestion key — public by design; move to an env var when you set up environments.
const AMPLITUDE_API_KEY = 'bebf2227715e7463b76c1e33236370fd';

let initialized = false;

export function initAnalytics(): void {
  if (initialized) return;
  initialized = true;

  void amplitude.initAll(AMPLITUDE_API_KEY, {
    analytics: {
      // 오토캡처는 5가지만 — Page viewed / Start session / End session / Marketing attribution
      // (+ attribution이 세팅하는 user properties). formInteractions·fileDownloads는 기본값이
      // true라서 명시적으로 끄지 않으면 딸려 들어온다.
      autocapture: {
        pageViews: true,
        sessions: true,
        attribution: true,
        formInteractions: false,
        fileDownloads: false,
        elementInteractions: false,
        frustrationInteractions: false,
        networkTracking: false,
        webVitals: false,
      },
    },
    sessionReplay: { sampleRate: 1 },
  });
}

export function track(event: string, properties?: Record<string, unknown>): void {
  amplitude.track(event, { app_platform: 'landing', ...properties });
}
