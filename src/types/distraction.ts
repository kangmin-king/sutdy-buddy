export type ExitModeId = 'IMMEDIATE' | 'CONFIRM' | 'GRACE_PERIOD';
export type BlockedAppId = 'INSTAGRAM' | 'YOUTUBE' | 'TIKTOK';

export interface DistractionState {
  endTimeMillis: number | null;
  exitMode: ExitModeId;
  gracePeriodSeconds: number;
  enabledApps: BlockedAppId[];
  lockoutDurationMillis: number;
  featureEnabled: boolean;
  allowedApps: string[];
  // 학습 타이머가 도는 중인지 여부. 네이티브가 허용앱 밖으로 이탈을 감지하면 스스로 false로
  // 내리고 stateChanged로 알려준다 — 웹 타이머는 이 전환을 보고 세션을 '이탈'로 종료한다.
  sessionActive: boolean;
}
