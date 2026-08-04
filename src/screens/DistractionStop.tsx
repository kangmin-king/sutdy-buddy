import React from 'react';
import { TopAppBar, Card, Button, ChipGroup, ToggleSwitch, SectionTitle, Icon } from '../primitives';
import { DistractionStop, isNativePlatform, useDistractionState } from '../native/distractionStop';
import type { BlockedAppId, DistractionState, ExitModeId } from '../types/distraction';

const BLOCKED_APP_OPTIONS: { id: BlockedAppId; label: string }[] = [
  { id: 'INSTAGRAM', label: '인스타그램' },
  { id: 'YOUTUBE', label: '유튜브' },
  { id: 'TIKTOK', label: '틱톡' },
];

const EXIT_MODE_OPTIONS: { id: ExitModeId; label: string }[] = [
  { id: 'IMMEDIATE', label: '즉시 차단' },
  { id: 'CONFIRM', label: '확인 후 종료' },
  { id: 'GRACE_PERIOD', label: '유예시간 후 종료' },
];

const LOCKOUT_OPTIONS = [
  { id: '60000', label: '1분' },
  { id: '300000', label: '5분' },
  { id: '600000', label: '10분' },
  { id: '1800000', label: '30분' },
];

function formatRemaining(endTimeMillis: number | null, nowMillis: number): string | null {
  if (endTimeMillis == null) return null;
  const remainingMs = Math.max(0, endTimeMillis - nowMillis);
  const minutes = Math.ceil(remainingMs / 60_000);
  return remainingMs === 0 ? '종료됨' : `${minutes}분 남음`;
}

export default function DistractionStopScreen() {
  const { state: remoteState, permissions } = useDistractionState();
  const [now, setNow] = React.useState(0);

  // 버튼/칩을 누르면 네이티브 왕복이 끝나기 전까지 화면이 그대로라 "안 눌린다"고 느껴지기
  // 쉽다. 로컬 상태를 즉시 반영(낙관적 업데이트)하고, 네이티브에서 확정된 상태가 오면
  // (remoteState 변경) 그걸로 다시 맞춘다.
  const [local, setLocal] = React.useState<DistractionState | null>(null);
  React.useEffect(() => {
    if (remoteState) setLocal(remoteState);
  }, [remoteState]);
  const state = local;

  React.useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!isNativePlatform()) {
    return (
      <div className="px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
        <TopAppBar />
        <div className="pt-6">
          <Card className="text-center">
            <Icon name="phonelink_lock" className="!text-[32px] text-on-surface-variant mb-2" />
            <p className="text-sm text-on-surface-variant">이 기능은 안드로이드 앱에서만 사용할 수 있어요.</p>
          </Card>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
        <TopAppBar />
        <div className="pt-6 text-center text-sm text-on-surface-variant">불러오는 중...</div>
      </div>
    );
  }

  const remaining = formatRemaining(state.endTimeMillis, now);

  return (
    <div className="px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <TopAppBar />
      <div className="pt-2 space-y-5">
        <Card className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold">딴짓 멈춰 켜기</p>
            <p className="text-xs text-on-surface-variant mt-0.5">쉬는 시간이 끝나면 선택한 앱을 자동으로 차단해요</p>
          </div>
          <ToggleSwitch
            checked={state.featureEnabled}
            onChange={(enabled) => {
              setLocal((s) => s && { ...s, featureEnabled: enabled });
              DistractionStop.setFeatureEnabled({ enabled });
            }}
          />
        </Card>

        {(!permissions.accessibilityEnabled || !permissions.overlayGranted) && (
          <Card tint="error" className="space-y-2">
            <p className="text-sm font-bold text-error">권한 설정이 필요해요</p>
            {!permissions.accessibilityEnabled && (
              <Button variant="outline" className="w-full" onClick={() => DistractionStop.openAccessibilitySettings()}>
                접근성 권한 설정 열기
              </Button>
            )}
            {!permissions.overlayGranted && (
              <Button variant="outline" className="w-full" onClick={() => DistractionStop.openOverlaySettings()}>
                오버레이 권한 설정 열기
              </Button>
            )}
          </Card>
        )}

        <div>
          <SectionTitle>쉬는 시간</SectionTitle>
          <Card className="space-y-3">
            <p className="text-center text-lg font-bold text-primary">{remaining ?? '쉬는 시간 꺼짐'}</p>
            <div className="flex gap-2">
              {[5, 10, 30].map((minutes) => (
                <Button
                  key={minutes}
                  variant="secondary"
                  className="flex-1 !px-2"
                  onClick={() => {
                    const extraMillis = minutes * 60_000;
                    setLocal((s) => s && { ...s, endTimeMillis: (s.endTimeMillis ?? Date.now()) + extraMillis });
                    state.endTimeMillis
                      ? DistractionStop.extendTimer({ extraMillis })
                      : DistractionStop.startTimer({ durationMillis: extraMillis });
                  }}
                >
                  +{minutes}분
                </Button>
              ))}
            </div>
            {state.endTimeMillis && (
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setLocal((s) => s && { ...s, endTimeMillis: null });
                  DistractionStop.stopTimer();
                }}
              >
                쉬는 시간 끝내기
              </Button>
            )}
          </Card>
        </div>

        <div>
          <SectionTitle>차단할 앱</SectionTitle>
          <Card className="space-y-3">
            {BLOCKED_APP_OPTIONS.map((app) => (
              <ToggleSwitch
                key={app.id}
                label={app.label}
                checked={state.enabledApps.includes(app.id)}
                onChange={(enabled) => {
                  setLocal((s) =>
                    s && { ...s, enabledApps: enabled ? [...s.enabledApps, app.id] : s.enabledApps.filter((a) => a !== app.id) }
                  );
                  DistractionStop.setAppEnabled({ app: app.id, enabled });
                }}
              />
            ))}
          </Card>
        </div>

        <div>
          <SectionTitle>쉬는 시간이 끝나면</SectionTitle>
          <ChipGroup
            options={EXIT_MODE_OPTIONS}
            value={state.exitMode}
            onChange={(mode) => {
              setLocal((s) => s && { ...s, exitMode: mode });
              DistractionStop.setExitMode({ mode });
            }}
          />
        </div>

        <div>
          <SectionTitle>재차단 유예 시간</SectionTitle>
          <ChipGroup
            options={LOCKOUT_OPTIONS}
            value={String(state.lockoutDurationMillis)}
            onChange={(id) => {
              const durationMillis = Number(id);
              setLocal((s) => s && { ...s, lockoutDurationMillis: durationMillis });
              DistractionStop.setLockoutDurationMillis({ durationMillis });
            }}
          />
        </div>
      </div>
    </div>
  );
}
