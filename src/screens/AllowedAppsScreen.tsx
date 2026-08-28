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
  // 정렬 기준이 되는 허용 목록은 화면을 열 때의 값으로 고정한다. 지금 상태를 그대로 쓰면
  // 40번째 앱을 켠 순간 그 줄이 맨 위로 올라가고 아래 줄이 전부 밀려, 연달아 고르는 학생이
  // 엉뚱한 앱을 누르게 된다. 스위치만 바뀌고 줄은 제자리에 있어야 한다.
  const orderingAllowed = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    let cancelled = false;
    DistractionStop.listInstalledApps()
      .then((r) => {
        if (cancelled) return;
        orderingAllowed.current = new Set(allowedApps);
        setApps(r.apps);
      })
      .catch(() => !cancelled && setApps([]));
    return () => {
      cancelled = true;
    };
    // 목록을 부르는 것도, 정렬 기준을 고정하는 것도 화면을 열 때 한 번뿐이므로 의존성은 비운다.
  }, []);

  const toggle = (packageName: string, enabled: boolean) => {
    onChange(enabled ? [...allowedApps, packageName] : allowedApps.filter((p) => p !== packageName));
  };

  // 화면을 열 때 이미 허용돼 있던 앱을 위로 모아 지금 상태가 바로 보이게 한다. 그 안에서는
  // 이름 순서를 유지한다. 켜고 끄는 동안 순서는 바뀌지 않는다(orderingAllowed 참고).
  const visible = React.useMemo(() => {
    if (!apps) return [];
    const trimmed = query.trim().toLowerCase();
    const matched = trimmed ? apps.filter((a) => a.label.toLowerCase().includes(trimmed)) : apps;
    const allowed = orderingAllowed.current;
    return [...matched].sort((a, b) => {
      const aAllowed = allowed.has(a.packageName) ? 0 : 1;
      const bAllowed = allowed.has(b.packageName) ? 0 : 1;
      return aAllowed - bAllowed;
    });
  }, [apps, query]);

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
