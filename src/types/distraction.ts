export type ExitModeId = 'IMMEDIATE' | 'CONFIRM' | 'GRACE_PERIOD';

export interface NativeAllowedAppInterval {
  startedAtMillis: number;
  endedAtMillis: number;
}

export interface DistractionState {
  endTimeMillis: number | null;
  exitMode: ExitModeId;
  gracePeriodSeconds: number;
  featureEnabled: boolean;
  // 학생이 직접 고른, 공부 중에도 열 수 있는 앱들.
  allowedApps: string[];
  // 공부 모드. 차단을 무장시키는 유일한 신호다.
  sessionActive: boolean;
  // sessionActive를 켠 시각. 앱이 강제 종료돼 이 값이 남으면 3시간 뒤 만료로 취급한다.
  sessionStartedAtMillis: number | null;
  // "이 시각 기준으로 학습 시간 집계를 멈춰야 한다"는 표식. 쉬는 시간 시작이 세우고,
  // 웹이 처리한 뒤 clearPendingPause로 지운다.
  pendingPauseAtMillis: number | null;
  // 아직 진행 중인 허용앱 구간의 시작 시각.
  allowedAppEnteredAtMillis: number | null;
  // 닫힌 구간들. 웹이 서버로 보낸 뒤 clearAllowedAppIntervals로 비운다.
  allowedAppIntervals: NativeAllowedAppInterval[];
}

export interface InstalledAppInfo {
  packageName: string;
  label: string;
  // base64로 인코딩된 64x64 PNG. data URI 접두사는 붙어 있지 않다.
  iconPng: string;
}
