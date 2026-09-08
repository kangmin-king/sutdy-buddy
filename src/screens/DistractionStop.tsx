import React from 'react';
import { TopAppBar, BackBar, Card, Button, ChipGroup, ToggleSwitch, SectionTitle, Icon } from '../primitives';
import { DistractionStop, isNativePlatform, useDistractionState } from '../native/distractionStop';
import { setUserProperties } from '../lib/analytics';
import type { DistractionState, ExitModeId } from '../types/distraction';
import { distractionStatus, extendedEndTime, formatRemaining, isBreakActive, statusMessage } from './distractionStopModel';
import AllowedAppsScreen from './AllowedAppsScreen';
import { usePermissionDisclosure } from './shared/PermissionDisclosure';

const EXIT_MODE_OPTIONS: { id: ExitModeId; label: string }[] = [
  { id: 'IMMEDIATE', label: '즉시 차단' },
  { id: 'CONFIRM', label: '확인 후 종료' },
  { id: 'GRACE_PERIOD', label: '유예시간 후 종료' },
];

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

  const [showAllowedApps, setShowAllowedApps] = React.useState(false);
  const { requestAccessibility, requestOverlay, disclosureDialog } = usePermissionDisclosure();

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

  if (showAllowedApps) {
    return (
      <AllowedAppsScreen
        allowedApps={state.allowedApps}
        onChange={(apps) => {
          setLocal((s) => s && { ...s, allowedApps: apps });
          DistractionStop.setAllowedApps({ apps });
        }}
        onClose={() => setShowAllowedApps(false)}
      />
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
            <p className="text-xs text-on-surface-variant mt-0.5">공부하는 동안 허용앱 외에는 열리지 않아요</p>
          </div>
          <ToggleSwitch
            checked={state.featureEnabled}
            onChange={(enabled) => {
              setLocal((s) => s && { ...s, featureEnabled: enabled });
              DistractionStop.setFeatureEnabled({ enabled });
              // 이벤트가 아니라 user property로 남긴다 — "지금 이 기능을 켜둔 사용자"로
              // 코호트를 나누는 게 켜고 끈 횟수보다 쓸모가 있다.
              setUserProperties({ distraction_stop_enabled: enabled });
            }}
          />
        </Card>

        <Card className="text-center space-y-3">
          <p className="text-sm text-on-surface-variant">{statusMessage(state, now)}</p>
          {distractionStatus(state, now) === 'blocking' && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                // 이 파일의 다른 네이티브 호출은 낙관적 업데이트 후 실패를 무시한다 —
                // 실패해도 설정 하나가 어긋나는 정도라 다음 stateChanged로 자연히
                // 맞춰진다. 이 버튼은 다르다: 대부분의 화면이 막힌 상태를 벗어나는
                // 유일한 탈출구라, 실패했는데도 성공한 것처럼 보이면 학생은 폰이
                // 계속 잠겨 있는데 화면은 "차단 아님"이라 말하고 그 사실을 되돌릴
                // 버튼마저 사라진다. 그래서 실패 시 되돌린다.
                const prevSessionActive = state.sessionActive;
                const prevSessionStartedAtMillis = state.sessionStartedAtMillis;
                setLocal((s) => s && { ...s, sessionActive: false, sessionStartedAtMillis: null });
                DistractionStop.setSessionActive({ active: false }).catch(() => {
                  setLocal((s) => s && { ...s, sessionActive: prevSessionActive, sessionStartedAtMillis: prevSessionStartedAtMillis });
                });
              }}
            >
              공부 끝내기
            </Button>
          )}
        </Card>

        {(!permissions.accessibilityEnabled || !permissions.overlayGranted) && (
          <Card tint="error" className="space-y-2">
            <p className="text-sm font-bold text-error">권한 설정이 필요해요</p>
            <p className="text-xs leading-relaxed text-on-surface-variant">
              무엇에 쓰는 권한인지 먼저 설명해 드려요. 읽어보고 결정하시면 됩니다.
            </p>
            {/* 설정 화면으로 곧바로 보내지 않는다 — 민감 권한은 요청 전에 목적을 알리고
                명시적 동의를 받아야 한다(플레이 정책). usePermissionDisclosure가 그 화면을 낀다. */}
            {!permissions.accessibilityEnabled && (
              <Button variant="outline" className="w-full" onClick={requestAccessibility}>
                접근성 권한이 왜 필요한지 보기
              </Button>
            )}
            {!permissions.overlayGranted && (
              <Button variant="outline" className="w-full" onClick={requestOverlay}>
                다른 앱 위에 표시 권한이 왜 필요한지 보기
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
          <SectionTitle>공부 중 다른 앱을 열면</SectionTitle>
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
          <SectionTitle>허용앱</SectionTitle>
          <Card>
            <button className="w-full flex items-center justify-between" onClick={() => setShowAllowedApps(true)}>
              <span className="text-sm">
                {state.allowedApps.length === 0 ? '아직 고른 앱이 없어요' : `${state.allowedApps.length}개 허용 중`}
              </span>
              <span className="flex items-center gap-1 text-sm text-primary">
                고르기
                <Icon name="chevron_right" className="!text-[18px]" />
              </span>
            </button>
          </Card>
        </div>
      </div>

      {disclosureDialog}
    </div>
  );
}
