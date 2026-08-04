import { registerPlugin, Capacitor } from '@capacitor/core';
import React from 'react';
import type { BlockedAppId, DistractionState, ExitModeId } from '../types/distraction';

interface DistractionStopPlugin {
  getState(): Promise<DistractionState>;
  startTimer(opts: { durationMillis: number }): Promise<DistractionState>;
  extendTimer(opts: { extraMillis: number }): Promise<DistractionState>;
  stopTimer(): Promise<DistractionState>;
  setExitMode(opts: { mode: ExitModeId }): Promise<DistractionState>;
  setGracePeriodSeconds(opts: { seconds: number }): Promise<DistractionState>;
  setLockoutDurationMillis(opts: { durationMillis: number }): Promise<DistractionState>;
  setAppEnabled(opts: { app: BlockedAppId; enabled: boolean }): Promise<DistractionState>;
  setFeatureEnabled(opts: { enabled: boolean }): Promise<DistractionState>;
  isAccessibilityServiceEnabled(): Promise<{ enabled: boolean }>;
  isOverlayPermissionGranted(): Promise<{ granted: boolean }>;
  openAccessibilitySettings(): Promise<void>;
  openOverlaySettings(): Promise<void>;
  consumeOpenRequest(): Promise<{ requested: boolean }>;
  addListener(
    eventName: 'stateChanged',
    listenerFunc: (state: DistractionState) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

export const DistractionStop = registerPlugin<DistractionStopPlugin>('DistractionStop');

// 딴짓 멈춰는 Android 접근성 서비스가 필요해 Capacitor로 감싼 네이티브 앱에서만 동작한다.
// 브라우저(Vercel 웹 배포 등)에서는 이 값이 false이며, 화면 쪽에서 안내 문구만 보여준다.
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function useDistractionState() {
  const [state, setState] = React.useState<DistractionState | null>(null);
  const [permissions, setPermissions] = React.useState({ accessibilityEnabled: false, overlayGranted: false });

  React.useEffect(() => {
    if (!isNativePlatform()) return;
    let cancelled = false;

    DistractionStop.getState().then((s) => !cancelled && setState(s));
    const refreshPermissions = () => {
      Promise.all([DistractionStop.isAccessibilityServiceEnabled(), DistractionStop.isOverlayPermissionGranted()]).then(
        ([a, o]) => {
          if (!cancelled) setPermissions({ accessibilityEnabled: a.enabled, overlayGranted: o.granted });
        }
      );
    };
    refreshPermissions();

    // 접근성/오버레이 권한은 시스템 설정 화면에 다녀와야 하는데, 그 사이 이 컴포넌트는
    // 계속 마운트된 상태라 처음 한 번만 확인하면 앱으로 돌아와도 권한 카드가 그대로 남는다.
    // 앱이 다시 화면에 보일 때마다(설정 화면에서 복귀할 때 포함) 다시 확인한다.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshPermissions();
    };
    document.addEventListener('visibilitychange', onVisible);

    const listenerPromise = DistractionStop.addListener('stateChanged', (s) => {
      if (!cancelled) setState(s);
    });

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      listenerPromise.then((handle) => handle.remove());
    };
  }, []);

  return { state, permissions };
}

// 상단 퀵컨트롤 알림을 탭해서 앱이 열렸을 때(딴짓 멈춰 화면으로 바로 이동해야 할 때) 호출된다.
// 처음 마운트 시 + 앱이 다시 화면에 보일 때마다(알림 탭으로 복귀하는 경우 포함) 확인한다.
export function useOpenDistractionStopRequest(onOpen: () => void) {
  React.useEffect(() => {
    if (!isNativePlatform()) return;

    const check = () => {
      DistractionStop.consumeOpenRequest().then((r) => {
        if (r.requested) onOpen();
      });
    };
    check();

    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [onOpen]);
}
