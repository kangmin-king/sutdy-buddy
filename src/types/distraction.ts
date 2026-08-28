export type ExitModeId = 'IMMEDIATE' | 'CONFIRM' | 'GRACE_PERIOD';
export type BlockedAppId = 'INSTAGRAM' | 'YOUTUBE' | 'TIKTOK';

export interface DistractionState {
  endTimeMillis: number | null;
  exitMode: ExitModeId;
  gracePeriodSeconds: number;
  enabledApps: BlockedAppId[];
  featureEnabled: boolean;
  allowedApps: string[];
  // 학습 타이머가 도는 중인지 여부. 차단은 이 값으로만 무장한다 — 공부 중이 아니면 차단하지
  // 않는다. 네이티브가 허용앱 밖 이탈을 감지하면 스스로 false로 내리고 stateChanged로 알린다.
  sessionActive: boolean;
  // sessionActive를 켠 시각. 앱이 강제 종료돼 이 값이 남으면 3시간 뒤 만료로 취급한다.
  sessionStartedAtMillis: number | null;
}

export interface InstalledAppInfo {
  packageName: string;
  label: string;
  // base64로 인코딩된 64x64 PNG. data URI 접두사는 붙어 있지 않다.
  iconPng: string;
}
