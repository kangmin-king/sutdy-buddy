import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

export default {
  // 전역 다크 토글은 없지만, 어두운 밴드 섹션에 class="dark"를 걸어 토큰을 반전시킨다.
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      /*
        shadcn의 기본 크기 체계는 영문 UI 기준이다. 한글 글리프는 같은 px에서 라틴보다 작게
        읽혀서, 12px(text-xs)·14px(text-sm)로 쓴 본문이 한글에서는 눈에 띄게 작다.
        그래서 본문 구간(xs~xl)만 한 단계씩 올린다. text-2xl 이상(제목)은 Tailwind 기본값을
        그대로 두므로 지금 크기가 유지된다.
      */
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.2rem' }], /* 12 → 13 */
        sm: ['0.9375rem', { lineHeight: '1.45rem' }], /* 14 → 15 */
        base: ['1.0625rem', { lineHeight: '1.7rem' }], /* 16 → 17 */
        lg: ['1.1875rem', { lineHeight: '1.8rem' }], /* 18 → 19 */
        xl: ['1.3125rem', { lineHeight: '1.9rem' }], /* 20 → 21 */
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // 토큰으로 흡수되지 않는 브랜드 고유색. 마스코트·앱 스크린샷과 맞추는 용도로만 쓴다.
        brand: {
          navy: '#1E2761',
          'navy-light': '#273572',
          ice: '#CADCFC',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 8px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
