import React from 'react';
import { TopAppBar, BackBar, Card, Button, ChipGroup, ToggleSwitch, SectionTitle, Icon, TextField } from '../primitives';
import { DistractionStop, isNativePlatform, useDistractionState } from '../native/distractionStop';
import type { BlockedAppId, DistractionState, ExitModeId } from '../types/distraction';
import { extendedEndTime, formatRemaining, isBreakActive, statusMessage } from './distractionStopModel';

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

function AllowedAppAdder({ onAdd }: { onAdd: (pkg: string) => void }) {
  const [pkg, setPkg] = React.useState('');

  const handleAdd = () => {
    const trimmed = pkg.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setPkg('');
  };

  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <TextField value={pkg} onChange={setPkg} placeholder="com.android.calculator2" />
      </div>
      <Button variant="secondary" className="!px-4" onClick={handleAdd}>
        추가
      </Button>
    </div>
  );
}

// onClose가 있으면(오른쪽 아래 떠 있는 버튼으로 연 오버레이) 뒤로가기 헤더를 쓰고, 없으면
// (레거시 하단 탭 등 기존 자리) 기존 TopAppBar를 그대로 쓴다.
export default function DistractionStopScreen({ onClose }: { onClose?: () => void } = {}) {
  const { state: remoteState, permissions } = useDistractionState();
  const [now, setNow] = React.useState(0);
  const header = onClose ? <BackBar title="딴짓 멈춰" onBack={onClose} /> : <TopAppBar />;

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
        {header}
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
        {header}
        <div className="pt-6 text-center text-sm text-on-surface-variant">불러오는 중...</div>
      </div>
    );
  }

  const remaining = formatRemaining(state.endTimeMillis, now);

  return (
    <div className="px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      {header}
      <div className="pt-2 space-y-5">
        <Card className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold">딴짓 멈춰 켜기</p>
            <p className="text-xs text-on-surface-variant mt-0.5">공부하는 동안 선택한 앱을 차단해요</p>
          </div>
          <ToggleSwitch
            checked={state.featureEnabled}
            onChange={(enabled) => {
              setLocal((s) => s && { ...s, featureEnabled: enabled });
              DistractionStop.setFeatureEnabled({ enabled });
            }}
          />
        </Card>

        <Card className="text-center">
          <p className="text-sm text-on-surface-variant">{statusMessage(state, now)}</p>
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
                    // now가 1초 간격 setInterval로만 갱신돼서, 클릭 시점엔 최대 1초 stale한 now가
                    // 남아있다. 그 상태로 남은시간을 계산하면 실제보다 커 보여 Math.ceil이 1분
                    // 더 올림되었다가(예: 5분 눌렀는데 6분) 다음 틱에 정정된다. 클릭 즉시 맞춰준다.
                    const clickedAt = Date.now();
                    setNow(clickedAt);
                    setLocal((s) => s && { ...s, endTimeMillis: extendedEndTime(s.endTimeMillis, extraMillis, clickedAt) });
                    // "진행 중이냐"는 endTimeMillis가 있느냐가 아니라 그게 아직 미래냐로 판단해야
                    // 한다 — 끝난 쉬는 시간의 과거 endTime이 그대로 남아 있기 때문이다.
                    isBreakActive(state.endTimeMillis, clickedAt)
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
          <SectionTitle>공부 중 차단 앱을 열면</SectionTitle>
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
          <SectionTitle>허용앱 (학습 실행 중 이탈 감지 예외)</SectionTitle>
          <Card className="space-y-2">
            {state.allowedApps.map((pkg) => (
              <div key={pkg} className="flex items-center justify-between">
                <span className="text-sm">{pkg}</span>
                <button
                  onClick={() => {
                    const next = state.allowedApps.filter((p) => p !== pkg);
                    setLocal((s) => s && { ...s, allowedApps: next });
                    DistractionStop.setAllowedApps({ apps: next });
                  }}
                >
                  <Icon name="close" className="!text-[16px]" />
                </button>
              </div>
            ))}
            <AllowedAppAdder
              onAdd={(pkg) => {
                if (state.allowedApps.includes(pkg)) return;
                const next = [...state.allowedApps, pkg];
                setLocal((s) => s && { ...s, allowedApps: next });
                DistractionStop.setAllowedApps({ apps: next });
              }}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
