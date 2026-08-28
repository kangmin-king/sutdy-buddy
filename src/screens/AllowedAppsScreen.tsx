import React from 'react';
import { BackBar, Card, Icon, TextField, ToggleSwitch } from '../primitives';
import { DistractionStop } from '../native/distractionStop';
import type { InstalledAppInfo } from '../types/distraction';

// 허용앱 선택. 목록은 화면을 열 때 한 번만 불러온다 — 아이콘까지 실려 오므로 앱 80개면
// 400KB 남짓이고, 매 렌더마다 부를 값이 아니다.
export default function AllowedAppsScreen({
  allowedApps,
  onChange,
  onClose,
}: {
  allowedApps: string[];
  onChange: (apps: string[]) => void;
  onClose: () => void;
}) {
  const [apps, setApps] = React.useState<InstalledAppInfo[] | null>(null);
  const [query, setQuery] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    DistractionStop.listInstalledApps()
      .then((r) => !cancelled && setApps(r.apps))
      .catch(() => !cancelled && setApps([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (packageName: string, enabled: boolean) => {
    onChange(enabled ? [...allowedApps, packageName] : allowedApps.filter((p) => p !== packageName));
  };

  // 이미 허용된 앱을 위로 모아 지금 상태가 바로 보이게 한다. 그 안에서는 이름 순서를 유지한다.
  const visible = React.useMemo(() => {
    if (!apps) return [];
    const trimmed = query.trim().toLowerCase();
    const matched = trimmed ? apps.filter((a) => a.label.toLowerCase().includes(trimmed)) : apps;
    const allowed = new Set(allowedApps);
    return [...matched].sort((a, b) => {
      const aAllowed = allowed.has(a.packageName) ? 0 : 1;
      const bAllowed = allowed.has(b.packageName) ? 0 : 1;
      return aAllowed - bAllowed;
    });
  }, [apps, query, allowedApps]);

  return (
    <div className="px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <BackBar title="허용앱 고르기" onBack={onClose} />
      <div className="pt-2 space-y-4">
        <Card>
          <p className="text-xs text-on-surface-variant">
            공부 중에도 열 수 있는 앱이에요. 전화·시계·설정은 고르지 않아도 항상 열려요.
          </p>
        </Card>

        <TextField value={query} onChange={setQuery} placeholder="앱 이름 검색" />

        {apps === null && <p className="text-center text-sm text-on-surface-variant py-6">불러오는 중...</p>}

        {apps !== null && apps.length === 0 && (
          <Card className="text-center">
            <Icon name="apps" className="!text-[32px] text-on-surface-variant mb-2" />
            <p className="text-sm text-on-surface-variant">설치된 앱을 불러올 수 없어요</p>
          </Card>
        )}

        {apps !== null && apps.length > 0 && visible.length === 0 && (
          <p className="text-center text-sm text-on-surface-variant py-6">검색 결과가 없어요</p>
        )}

        {visible.length > 0 && (
          <Card className="space-y-3">
            {visible.map((app) => (
              <div key={app.packageName} className="flex items-center gap-3">
                <img
                  src={`data:image/png;base64,${app.iconPng}`}
                  alt=""
                  className="w-8 h-8 rounded-lg shrink-0"
                />
                <span className="flex-1 text-sm truncate">{app.label}</span>
                <ToggleSwitch
                  checked={allowedApps.includes(app.packageName)}
                  onChange={(enabled) => toggle(app.packageName, enabled)}
                />
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
