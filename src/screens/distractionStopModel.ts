// 딴짓 멈춰 쉬는 시간 표시·연장 계산. 화면에서 분리해 둔 이유는 "이미 끝난 쉬는 시간을
// 연장하면 어떻게 되는가"가 실제 버그가 났던 지점이라 테스트로 고정해두기 위함이다.

import type { DistractionState } from '../types/distraction';

export function isBreakActive(endTimeMillis: number | null, nowMillis: number): boolean {
  return endTimeMillis != null && nowMillis < endTimeMillis;
}

// 연장의 기준점은 "쉬는 시간이 아직 남아 있으면 그 끝, 이미 지났으면 지금"이다. 과거
// endTime을 기준으로 더하면 결과가 여전히 과거라 화면이 '종료됨'에서 벗어나지 못한다.
// 네이티브(TimerState.extendedEndTime)와 같은 식이어야 낙관적 업데이트가 튀지 않는다.
export function extendedEndTime(
  endTimeMillis: number | null,
  extraMillis: number,
  nowMillis: number
): number {
  return Math.max(endTimeMillis ?? nowMillis, nowMillis) + extraMillis;
}

export function formatRemaining(endTimeMillis: number | null, nowMillis: number): string | null {
  if (endTimeMillis == null) return null;
  const remainingMs = Math.max(0, endTimeMillis - nowMillis);
  const minutes = Math.ceil(remainingMs / 60_000);
  return remainingMs === 0 ? '종료됨' : `${minutes}분 남음`;
}

// 네이티브 TimerState.SESSION_MAX_MILLIS와 같은 값이어야 한다. 남은 시간 표시가
// endTimeMillis로 계산되는 것과 같은 방식으로, 만료도 화면이 자기 now로 계산한다.
export const SESSION_MAX_MILLIS = 3 * 60 * 60 * 1000;

export function isSessionActive(state: DistractionState, nowMillis: number): boolean {
  if (!state.sessionActive || state.sessionStartedAtMillis == null) return false;
  return nowMillis - state.sessionStartedAtMillis < SESSION_MAX_MILLIS;
}

export type DistractionStatus = 'off' | 'break' | 'blocking' | 'noAllowedApps' | 'idle';

// 위에서 아래로 먼저 맞는 것을 쓴다. 순서가 곧 우선순위다 — 공부 중이면 준비 안내보다
// 지금 벌어지는 일이 급하고, 쉬는 시간이면 차단이 풀렸다는 사실이 그보다 급하다.
export function distractionStatus(state: DistractionState, nowMillis: number): DistractionStatus {
  if (!state.featureEnabled) return 'off';
  if (isBreakActive(state.endTimeMillis, nowMillis)) return 'break';
  if (isSessionActive(state, nowMillis)) return 'blocking';
  if (state.allowedApps.length === 0) return 'noAllowedApps';
  return 'idle';
}

// 화면이 왜 차단이 걸리지 않는지 알려주지 않아서 학생이 "실행이 안 된다"고 느꼈다.
export function statusMessage(state: DistractionState, nowMillis: number): string {
  switch (distractionStatus(state, nowMillis)) {
    case 'off':
      return '딴짓 멈춰가 꺼져 있어요';
    case 'break':
      return `쉬는 시간 ${formatRemaining(state.endTimeMillis, nowMillis) ?? ''} — 이 동안은 공부 시간이 쌓이지 않아요`;
    case 'blocking':
      return '차단 중 — 허용앱 외에는 열리지 않아요';
    case 'noAllowedApps':
      return '공부 중에 쓸 앱을 미리 골라두세요 — 지금은 전화·시계·설정만 열려요';
    case 'idle':
      return '차단 대기 중 — 공부를 시작하면 허용앱 외에는 열리지 않아요';
  }
}
