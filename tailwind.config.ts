import type { Config } from 'tailwindcss';

// 색 값 자체는 src/index.css의 CSS 변수에 있다. 여기서는 이름만 이어 붙인다.
// `<alpha-value>` 자리는 Tailwind가 채워주므로 `bg-primary/10` 같은 표기가 그대로 동작한다.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  safelist: [
    'bg-primary-container/10',
    'bg-secondary-container/10',
    'bg-tertiary-container/10',
    'bg-primary-container/40',
    'bg-secondary-container/40',
    'bg-tertiary-container/40',
    'text-primary',
    'text-secondary',
    'text-tertiary',
  ],
  theme: {
    extend: {
      colors: {
        surface: token('surface'),
        'surface-dim': token('surface-dim'),
        'surface-bright': token('surface-bright'),
        'surface-container-lowest': token('surface-container-lowest'),
        'surface-container-low': token('surface-container-low'),
        'surface-container': token('surface-container'),
        'surface-container-high': token('surface-container-high'),
        'surface-container-highest': token('surface-container-highest'),
        'on-surface': token('on-surface'),
        'on-surface-variant': token('on-surface-variant'),
        outline: token('outline'),
        'outline-variant': token('outline-variant'),
        primary: token('primary'),
        'on-primary': token('on-primary'),
        'primary-container': token('primary-container'),
        'on-primary-container': token('on-primary-container'),
        secondary: token('secondary'),
        'on-secondary': token('on-secondary'),
        'secondary-container': token('secondary-container'),
        'on-secondary-container': token('on-secondary-container'),
        tertiary: token('tertiary'),
        'on-tertiary': token('on-tertiary'),
        'tertiary-container': token('tertiary-container'),
        'on-tertiary-container': token('on-tertiary-container'),
        error: token('error'),
        'on-error': token('on-error'),
        'error-container': token('error-container'),
        'on-error-container': token('on-error-container'),
        warning: token('warning'),
        scrim: token('scrim'),
        background: token('surface'),
        'on-background': token('on-surface'),
      },
      borderRadius: {
        sm: '0.25rem',
        DEFAULT: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.5rem',
        full: '9999px',
      },
      fontFamily: {
        // 이전 지정(Plus Jakarta Sans)에는 한글 글리프가 없어 UI 전체가 시스템 폰트로
        // 떨어지고 있었다. Pretendard는 한글·라틴을 함께 커버한다.
        sans: ['Pretendard Variable', 'Pretendard', '-apple-system', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 4px 20px -4px rgba(54,96,149,0.12)',
        card: '0 2px 12px -2px rgba(54,96,149,0.10)',
      },
    },
  },
  plugins: [],
} satisfies Config;
