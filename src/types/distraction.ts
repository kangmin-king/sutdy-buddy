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
}
