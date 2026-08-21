import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#1E2761',
        'navy-light': '#273572',
        ice: '#CADCFC',
        carrot: '#FF6B35',
      },
    },
  },
} satisfies Config;
