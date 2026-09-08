// @amplitude/unified이 아니라 analytics-browser를 직접 쓴다. unified의 존재 이유는
// analytics·Engagement·Experiment를 initAll로 한 번에 켜주는 것인데, 이 앱은 Engagement와
// Experiment를 쓰지 않는다. 그런데도 unified를 쓰던 동안 매 세션 Engagement SDK 로딩을
// 10초 기다렸다 실패했고("Engagement SDK failed to load within 10000ms"), 쓰지 않는 두
// SDK가 번들에도 들어갔다. unified는 모듈 레벨에 initAll만 내놓아서 analytics만 켤 방법이
// 없다 — 그래서 한 겹 아래로 내려왔다.
import * as amplitude from '@amplitude/analytics-browser';
import { sessionReplayPlugin, type SessionReplayPlugin } from '@amplitude/plugin-session-replay-browser';
import { Capacitor } from '@capacitor/core';

/**
 * Amplitude 연동 지점. 이벤트 이름·속성 규칙은 docs/analytics-taxonomy.md에 정리돼 있다.
 *
 * 화면 코드에서 amplitude를 직접 import하지 말고 여기 track/setUserProperties만 쓴다 —
 * 키가 없을 때(로컬에서 .env 안 채운 경우)의 분기와 공통 속성 부착을 한 곳에서만 처리하려는
 * 것이다. 여기서 걸러두면 분석 코드 때문에 앱이 죽는 경로가 생기지 않는다.
 */

const AMPLITUDE_API_KEY = import.meta.env.VITE_AMPLITUDE_API_KEY as string | undefined;

// 'web' | 'android' | 'ios'. 네이티브 앱은 페이지 이동이 없어서 오토캡처 Page viewed가 거의
// 안 잡힌다 — 웹/앱 구분은 이 값으로 한다.
export const APP_PLATFORM = Capacitor.getPlatform();

// 모든 이벤트에 공통으로 붙는 속성. 프로필을 읽은 뒤 setCommonProperties로 채운다. 로그인
// 전에 나가는 이벤트에는 app_platform만 붙는다.
interface CommonProperties {
  role?: 'student' | 'manager';
  is_onboarded?: boolean;
}

let commonProperties: CommonProperties = {};
let initialized = false;

// 세션 리플레이 플러그인. 관리자 세션에서만 붙이므로 처음에는 null이다 — 아래
// applySessionReplayPolicy 주석 참고.
let sessionReplay: SessionReplayPlugin | null = null;

export function initAnalytics(): void {
  // 앱 수명 동안 딱 한 번만. StrictMode의 이중 마운트나 HMR로 두 번 불려도 안전해야 한다.
  if (initialized) return;
  initialized = true;

  if (!AMPLITUDE_API_KEY) {
    console.warn('Amplitude API key missing — analytics disabled');
    return;
  }

  // 세션 리플레이는 예전에 initAll이 켜주던 것이라, 이제 applySessionReplayPolicy에서 직접
  // 붙인다. 그게 오히려 필요한 구조다 — 로그인해서 역할을 알기 전에는 켜면 안 된다.
  void amplitude.init(AMPLITUDE_API_KEY, {
    // 오토캡처는 5가지만 켠다 — Page viewed / Start session / End session /
    // Marketing attribution(+그게 세팅하는 User properties).
    // formInteractions·fileDownloads는 기본값이 true라서 명시적으로 끄지 않으면 딸려 들어온다.
    // 나머지 행동 데이터는 아래 track()으로 의도한 것만 보낸다.
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
}

/**
 * 세션 리플레이는 **관리자(과외쌤·학부모) 세션에만** 켠다.
 *
 * 이 앱의 학생은 중1부터라 만 14세 미만이 포함되고, 학생 화면에는 숙제·목표·이행률이 그대로
 * 떠 있다. 그 화면 조작을 재생 가능한 형태로 남기는 것은 플레이 가족 정책과 부딪치고,
 * 마스킹을 걸어도 "아동 화면을 녹화한다"는 사실 자체는 남는다. 그래서 학생 세션은 아예
 * 기록하지 않고, 성인인 관리자 세션에서만 진단용으로 켠다.
 *
 * 프로필을 읽어 역할이 확정될 때마다 불린다(syncUserProperties). 한 기기에서 관리자가
 * 로그아웃하고 학생이 로그인하는 경우가 실제 위험이라, 관리자가 아니면 매번 stop()을 부른다.
 */
export function applySessionReplayPolicy(role: 'student' | 'manager'): void {
  if (!AMPLITUDE_API_KEY) return;

  if (role !== 'manager') {
    sessionReplay?.stop();
    return;
  }

  if (!sessionReplay) {
    // add()가 플러그인 setup()을 돌리면서 녹화를 시작한다. 그래서 관리자로 확인된 뒤에만
    // 붙인다 — 미리 붙여두고 끄는 방식은 붙는 순간과 끄는 순간 사이가 비게 된다.
    sessionReplay = sessionReplayPlugin({ sampleRate: 1 });
    void amplitude.add(sessionReplay);
    return;
  }

  void sessionReplay.start();
}

export function setCommonProperties(next: CommonProperties): void {
  commonProperties = { ...commonProperties, ...next };
}

export function track(event: string, properties?: Record<string, unknown>): void {
  if (!AMPLITUDE_API_KEY) return;
  // undefined는 빼고 보낸다. 값이 없을 때 호출부에서 undefined를 그대로 넘겨도 Amplitude
  // 차트에 "(none)" 버킷이 생기지 않게 하려는 것이다.
  const merged: Record<string, unknown> = { ...commonProperties, app_platform: APP_PLATFORM };
  for (const [key, value] of Object.entries(properties ?? {})) {
    if (value !== undefined) merged[key] = value;
  }
  amplitude.track(event, merged);
}

/** 로그인 시점에 부른다. 익명 이벤트와 로그인 후 이벤트가 한 사람으로 이어진다. */
export function identifyUser(userId: string): void {
  if (!AMPLITUDE_API_KEY) return;
  amplitude.setUserId(userId);
}

/** 로그아웃 시점. userId와 deviceId를 함께 끊어서 다음 사용자와 섞이지 않게 한다. */
export function resetIdentity(): void {
  if (!AMPLITUDE_API_KEY) return;
  // 녹화를 먼저 멈춘다. 같은 기기에서 관리자가 나가고 학생이 들어오는 경우, 학생의 프로필을
  // 읽기 전까지의 화면(로그인·온보딩)이 관리자 세션의 연장으로 녹화될 수 있다.
  sessionReplay?.stop();
  amplitude.reset();
  commonProperties = {};
}

/** 현재 값으로 덮어쓰는 user property (학년, 역할, 연결된 사람 수처럼 "지금 상태"인 것들). */
export function setUserProperties(properties: Record<string, unknown>): void {
  if (!AMPLITUDE_API_KEY) return;
  const identify = new amplitude.Identify();
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined) continue;
    identify.set(key, value as string | number | boolean | string[]);
  }
  amplitude.identify(identify);
}

/** 처음 한 번만 기록되는 user property (가입 경로, 가입 시각처럼 나중에 바뀌면 안 되는 것들). */
export function setOnceUserProperties(properties: Record<string, unknown>): void {
  if (!AMPLITUDE_API_KEY) return;
  const identify = new amplitude.Identify();
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined) continue;
    identify.setOnce(key, value as string | number | boolean | string[]);
  }
  amplitude.identify(identify);
}

/** 누적 카운터 user property (총 학습 세션 수, 총 학습 분 등). */
export function incrementUserProperty(name: string, value = 1): void {
  if (!AMPLITUDE_API_KEY) return;
  amplitude.identify(new amplitude.Identify().add(name, value));
}
