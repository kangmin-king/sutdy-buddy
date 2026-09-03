import React from 'react';
import { useAuth } from './state/AuthContext';
import { useTheme, type Theme } from './state/ThemeContext';
import mascotFaceUrl from './assets/mascot-face.png';

export function Icon({ name, className = '', filled = false }: { name: string; className?: string; filled?: boolean }) {
  return <span className={`material-symbols-outlined ${filled ? 'filled' : ''} ${className}`}>{name}</span>;
}

// compact은 학생 셸용 — 설정과 로그아웃이 "나" 탭으로 옮겨가서 상단바에 중복으로 둘 이유가
// 없다. 선생님 셸에는 아직 "나" 탭이 없으므로 기본값(전체)을 그대로 쓴다.
export function TopAppBar({
  title = '스터디 벅스',
  onBell,
  className = '',
  compact = false,
}: { title?: string; onBell?: () => void; className?: string; compact?: boolean }) {
  const { signOut } = useAuth();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  return (
    <header className={`sticky top-0 z-20 flex items-center justify-between bg-surface/90 px-5 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] backdrop-blur ${className}`.trim()}>
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-full bg-primary overflow-hidden flex items-center justify-center shrink-0">
          <img src={mascotFaceUrl} alt="" className="w-full h-full object-cover" />
        </div>
        <span className="text-lg font-bold text-primary">{title}</span>
      </div>
      <div className="relative flex items-center gap-1">
        <button onClick={onBell} aria-label="알림" className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface-variant transition hover:bg-surface-container active:scale-[0.96]">
          <Icon name="notifications" />
        </button>
        {!compact && (
          <>
            <button onClick={() => setSettingsOpen(true)} aria-label="설정" className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface-variant transition hover:bg-surface-container active:scale-[0.96]">
              <Icon name="settings" />
            </button>
            <button onClick={() => setConfirmOpen(true)} aria-label="로그아웃" className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface-variant transition hover:bg-surface-container active:scale-[0.96]">
              <Icon name="logout" />
            </button>
          </>
        )}
        <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        {confirmOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setConfirmOpen(false)} />
            <div className="absolute right-0 top-full mt-2 z-40 w-52 rounded-xl bg-surface-container-lowest shadow-card p-3">
              <p className="text-sm text-on-surface mb-3">로그아웃 하시겠습니까?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmOpen(false)}
                  className="flex-1 rounded-full border-[1.5px] border-outline-variant text-on-surface text-xs font-semibold py-2"
                >
                  취소
                </button>
                <button
                  onClick={() => {
                    setConfirmOpen(false);
                    void signOut();
                  }}
                  className="flex-1 rounded-full border-[1.5px] border-error text-error text-xs font-semibold py-2"
                >
                  확인
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

// 설정은 아직 화면 하나를 차지할 만큼 항목이 많지 않아 바텀시트로 둔다. 학생 셸과 선생님
// 셸이 라우팅 구조가 서로 달라서, 시트로 두면 TopAppBar 한 곳만 고쳐도 양쪽에 다 붙는다.
// 항목이 늘어나면 그때 화면으로 승격시키면 된다.
export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { theme, setTheme } = useTheme();
  const options: { id: Theme; label: string; icon: string; hint: string }[] = [
    { id: 'light', label: '라이트', icon: 'light_mode', hint: '밝은 배경' },
    { id: 'dark', label: '다크', icon: 'dark_mode', hint: '밤에 눈이 편해요' },
  ];
  return (
    <BottomSheet open={open} onClose={onClose} title="설정">
      <div>
        <p className="mb-2 text-sm font-semibold text-on-surface-variant">화면 테마</p>
        <div role="radiogroup" aria-label="화면 테마" className="grid grid-cols-2 gap-2">
          {options.map((opt) => {
            const selected = theme === opt.id;
            return (
              <button
                key={opt.id}
                role="radio"
                aria-checked={selected}
                onClick={() => setTheme(opt.id)}
                className={`flex min-h-11 flex-col items-start gap-1 rounded-xl border-[1.5px] px-4 py-3 text-left transition active:scale-[0.98] ${
                  selected ? 'border-primary bg-primary/10' : 'border-outline-variant bg-surface-container-lowest'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Icon name={opt.icon} className={`!text-[18px] ${selected ? 'text-primary' : 'text-on-surface-variant'}`} filled={selected} />
                  <span className={`text-sm font-bold ${selected ? 'text-primary' : 'text-on-surface'}`}>{opt.label}</span>
                </span>
                <span className="text-[11px] text-on-surface-variant">{opt.hint}</span>
              </button>
            );
          })}
        </div>
      </div>
    </BottomSheet>
  );
}

export function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 bg-surface/90 backdrop-blur px-3 py-4">
      <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-container">
        <Icon name="arrow_back" />
      </button>
      <span className="text-lg font-bold text-on-surface">{title}</span>
    </header>
  );
}

export function BottomNav<T extends { id: string; label: string; icon: string }>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly T[];
  active: T['id'];
  onChange: (id: T['id']) => void;
}) {
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-surface-container-lowest border-t border-outline-variant/50 flex justify-around pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] z-30">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${isActive ? 'text-primary' : 'text-on-surface-variant'}`}
          >
            <Icon name={tab.icon} filled={isActive} />
            <span className="text-[11px] font-medium">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function Card({ children, className = '', tint = null }: { children: React.ReactNode; className?: string; tint?: string | null }) {
  const tintClass = tint ? `bg-${tint}-container/10` : 'bg-surface-container-lowest';
  return <div className={`rounded-2xl p-4 shadow-card ${tintClass} ${className}`}>{children}</div>;
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'error';

export function Button({
  children,
  onClick,
  variant = 'primary',
  className = '',
  icon = null,
  disabled = false,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  className?: string;
  icon?: string | null;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const base = 'rounded-full font-semibold text-sm px-5 py-3 flex items-center justify-center gap-1.5 transition active:scale-[0.98] disabled:opacity-50';
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-primary text-on-primary',
    secondary: 'bg-secondary text-on-secondary',
    ghost: 'bg-transparent border-[1.5px] border-primary text-primary',
    outline: 'bg-transparent border-[1.5px] border-outline-variant text-on-surface',
    error: 'bg-transparent border-[1.5px] border-error text-error',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {icon && <Icon name={icon} className="!text-[18px]" />}
      {children}
    </button>
  );
}

export function Chip({ label, active, onClick, icon = null }: { label: string; active: boolean; onClick: () => void; icon?: string | null }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium flex items-center gap-1 transition ${active ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}
    >
      {icon && <Icon name={icon} className="!text-[18px]" />}
      {label}
    </button>
  );
}

interface ChipOption {
  id: string;
  label: string;
}

export function ChipGroup<T extends ChipOption>({
  options,
  value,
  onChange,
  multi = false,
  getIcon = null,
}: {
  options: T[];
  value: string | string[];
  onChange: (value: any) => void;
  multi?: boolean;
  getIcon?: ((opt: T) => string) | null;
}) {
  const isSelected = (id: string) => (multi ? (value as string[]).includes(id) : value === id);
  const toggle = (id: string) => {
    if (multi) {
      const list = value as string[];
      onChange(list.includes(id) ? list.filter((v) => v !== id) : [...list, id]);
    } else {
      onChange(id);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <Chip key={opt.id} label={opt.label} active={isSelected(opt.id)} onClick={() => toggle(opt.id)} icon={getIcon ? getIcon(opt) : null} />
      ))}
    </div>
  );
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  valueLabel,
  minLabel,
  maxLabel,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  valueLabel: string;
  minLabel: string;
  maxLabel: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-on-surface-variant">{label}</span>
        <span className="text-base font-bold text-primary">{valueLabel}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
      <div className="flex justify-between text-xs text-on-surface-variant mt-1">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}

export function StarRating({ value, onChange, size = 'text-2xl' }: { value: number; onChange: (n: number) => void; size?: string }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => onChange(n)} className={`${size} leading-none`}>
          <span className={n <= value ? 'text-primary' : 'text-outline-variant'}>★</span>
        </button>
      ))}
    </div>
  );
}

export function ProgressRing({ percent, size = 88, stroke = 10 }: { percent: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" className="stroke-surface-container-highest" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        className="stroke-primary"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <text x="50%" y="50%" transform={`rotate(90 ${size / 2} ${size / 2})`} textAnchor="middle" dominantBaseline="middle" className="fill-on-surface font-bold" style={{ fontSize: 18 }}>
        {percent}%
      </text>
    </svg>
  );
}

export function ProgressBar({ percent, className = '' }: { percent: number; className?: string }) {
  return (
    <div className={`h-3 rounded-full bg-surface-container-high overflow-hidden ${className}`}>
      <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  );
}

export function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      {label && <span className="text-sm font-medium text-on-surface">{label}</span>}
      <span
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${checked ? 'bg-primary' : 'bg-surface-container-high'}`}
      >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </span>
    </label>
  );
}

export function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-[480px] bg-surface-container-lowest rounded-t-2xl p-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <div className="w-10 h-1.5 rounded-full bg-outline-variant mx-auto mb-4" />
        {title && <h3 className="text-base font-bold mb-3">{title}</h3>}
        {children}
      </div>
    </div>
  );
}

// window.confirm()은 안드로이드 WebView에서 조용히 아무 반응 없이 무시되는 경우가 있어(네이티브
// 동기 JS 다이얼로그가 막힘) 확인이 필요한 모든 곳에서 이 훅으로 대체한다. confirm()을 호출하면
// 바텀시트가 뜨고, 사용자가 확인/취소를 누를 때 Promise가 resolve된다.
export function useConfirm() {
  const [pending, setPending] = React.useState<{ message: string; resolve: (v: boolean) => void } | null>(null);

  const confirm = React.useCallback((message: string) => {
    return new Promise<boolean>((resolve) => setPending({ message, resolve }));
  }, []);

  const settle = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  };

  const confirmDialog = (
    <BottomSheet open={pending != null} onClose={() => settle(false)}>
      <p className="text-sm text-on-surface mb-4">{pending?.message}</p>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => settle(false)}>
          취소
        </Button>
        <Button variant="error" className="flex-1" onClick={() => settle(true)}>
          확인
        </Button>
      </div>
    </BottomSheet>
  );

  return { confirm, confirmDialog };
}

export function AiTipCard({ text, icon = 'auto_awesome', tint = 'tertiary' }: { text: string; icon?: string; tint?: string }) {
  return (
    <Card tint={tint} className="flex gap-3">
      <div className={`w-8 h-8 rounded-full bg-${tint}-container/40 flex items-center justify-center shrink-0`}>
        <Icon name={icon} className={`!text-[18px] text-${tint}`} />
      </div>
      <div>
        <p className="text-xs font-bold text-on-surface-variant mb-1">AI 버디의 조언</p>
        <p className="text-sm text-on-surface leading-relaxed">{text}</p>
      </div>
    </Card>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-base font-bold text-on-surface">{children}</h2>
      {action}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      {label && <label className="block text-sm font-semibold text-on-surface-variant mb-1.5">{label}</label>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl bg-surface-container px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      {label && <label className="block text-sm font-semibold text-on-surface-variant mb-1.5">{label}</label>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-xl bg-surface-container px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary resize-none"
      />
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <div>
      {label && <label className="block text-sm font-semibold text-on-surface-variant mb-1.5">{label}</label>}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl bg-surface-container px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary">
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// 브레인스토밍에서 합의한 "기본은 최소 입력, 더 자세히는 펼쳐서" 패턴의 공용 구현.
export function Collapsible({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      {!open && (
        <button onClick={() => setOpen(true)} className="text-xs font-semibold text-primary">
          {label} ⌄
        </button>
      )}
      {open && (
        <div className="mt-3 pt-3 border-t border-outline-variant/40 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}
