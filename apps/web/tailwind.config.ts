import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0F172A',
        secondary: '#334155',
        cta: '#0369A1',
        ctaDark: '#075985',
        canvas: '#F8FAFC',
        muted: '#475569',
        hairline: '#E2E8F0',
        work: '#0369A1',
        material: '#0D9488',
        photo: '#64748B',
      },
      fontFamily: {
        serif: ['var(--font-heading)', 'Georgia', 'serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        report: '42rem',
      },
    },
  },
  plugins: [],
};

export default config;
