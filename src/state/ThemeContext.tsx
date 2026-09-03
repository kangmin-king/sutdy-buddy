import React from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'sb-theme';

// index.html의 인라인 스크립트가 첫 페인트 전에 쓰는 값과 반드시 같아야 한다.
const THEME_COLOR: Record<Theme, string> = {
  light: '#f7f9fb',
  dark: '#1b1832',
};

interface ThemeValue {
  theme: Theme;
  setTheme: (next: Theme) => void;
}

const ThemeContext = React.createContext<ThemeValue | null>(null);

function readStoredTheme(): Theme {
  // 시크릿 모드나 저장소가 막힌 WebView에서 localStorage 접근 자체가 던질 수 있다.
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  // 안드로이드 상태바 색이 이 메타를 따라간다 — 안 바꾸면 다크에서 상단만 흰 띠로 남는다.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(readStoredTheme);

  // 인라인 스크립트가 이미 클래스를 붙여뒀더라도, React가 들고 있는 상태와 DOM이 어긋나지
  // 않도록 마운트 시 한 번 맞춘다.
  React.useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 저장에 실패해도 이번 세션 동안은 적용된 상태를 유지한다.
    }
  }, []);

  const value = React.useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
