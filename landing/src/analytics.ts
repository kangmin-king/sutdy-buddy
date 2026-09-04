// unified가 아니라 analytics-browser를 직접 쓴다 — 이유는 본앱 src/lib/analytics.ts의
// 같은 자리 주석과 같다(쓰지 않는 Engagement·Experiment SDK를 켜지 않기 위해).
import * as amplitude from '@amplitude/analytics-browser';
import { sessionReplayPlugin } from '@amplitude/plugin-session-replay-browser';

/**
 * 랜딩 페이지의 Amplitude 연동. 본앱(src/lib/analytics.ts)과 같은 프로젝트 키를 쓴다 —
 * 유입(랜딩)에서 가입(앱)까지 한 사람으로 이어 봐야 하기 때문이다. 그래서 로컬은 개발용
 * 프로젝트, 배포본은 프로덕션 프로젝트로 앱과 짝을 맞춰야 한다.
 *
 * 랜딩은 로그인이 없어서 user property를 직접 세팅할 일이 없다. 오토캡처의 Marketing
 * attribution이 붙여주는 utm/referrer user property가 사실상 전부다.
 */

// VITE_ 접두어가 붙은 값은 빌드 시점에 번들로 박힌다. 배포 환경에 이 변수가 없으면 조용히
// 분석이 꺼진 채로 나가므로, 아래에서 경고를 남겨 눈에 띄게 한다.
const AMPLITUDE_API_KEY = import.meta.env.VITE_AMPLITUDE_API_KEY as string | undefined;

let initialized = false;

export function initAnalytics(): void {
  if (initialized) return;
  initialized = true;

  if (!AMPLITUDE_API_KEY) {
    console.warn('Amplitude API key missing — analytics disabled');
    return;
  }

  void amplitude.init(AMPLITUDE_API_KEY, {
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
  });

  // 세션 리플레이는 initAll이 켜주던 것이라 직접 붙인다. 랜딩은 로그인이 없고 개인정보를
  // 다루지 않는 공개 페이지라 전량 기록해도 문제가 없다 — 본앱과 달리 학생 화면이 아니다.
  // (본앱은 관리자 세션에만 켠다. src/lib/analytics.ts의 applySessionReplayPolicy 참고)
  void amplitude.add(sessionReplayPlugin({ sampleRate: 1 }));
}

export function track(event: string, properties?: Record<string, unknown>): void {
  if (!AMPLITUDE_API_KEY) return;
  amplitude.track(event, { app_platform: 'landing', ...properties });
}
