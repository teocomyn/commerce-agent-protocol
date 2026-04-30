import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx,mdx}', './components/**/*.{ts,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        void: '#050505',
        midnight: '#0A0F1F',
        surface: { DEFAULT: '#0F1729', 2: '#131C32' },
        edge: { DEFAULT: '#1F2A40', strong: '#2D3A52' },
        fg: '#F8FAFC',
        muted: '#94A3B8',
        subtle: '#64748B',
        faint: '#475569',
        primary: { DEFAULT: '#2F6BFF', deep: '#1A4DD4' },
        accent: '#38D6FF',
        pulse: '#00FFB7',
        warn: '#FFB347',
        danger: '#FF6B6B',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.04em',
        tighter: '-0.03em',
        tight: '-0.02em',
        snug: '-0.011em',
        wide: '0.1em',
        wider: '0.15em',
        widest: '0.3em',
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '8px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '24px',
      },
      maxWidth: {
        container: '1200px',
        prose: '720px',
        hero: '900px',
      },
      transitionTimingFunction: {
        ease: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      animation: {
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
        'ping-ring': 'ping-ring 2s ease-out infinite',
        marquee: 'marquee 40s linear infinite',
        'fade-up': 'fade-up 800ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 600ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        'orbit-slow': 'orbit 30s linear infinite',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.5', transform: 'scale(0.85)' },
        },
        'ping-ring': {
          '0%': { transform: 'scale(0.5)', opacity: '1' },
          '100%': { transform: 'scale(2.5)', opacity: '0' },
        },
        marquee: { to: { transform: 'translateX(-50%)' } },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 60px -10px rgba(47,107,255,0.4)' },
          '50%': { boxShadow: '0 0 100px -10px rgba(47,107,255,0.7)' },
        },
        orbit: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      },
      boxShadow: {
        card: '0 8px 24px -8px rgba(0,0,0,0.4)',
        elev: '0 24px 48px -12px rgba(0,0,0,0.8)',
        glow: '0 0 80px -20px rgba(47,107,255,0.5)',
        'glow-cyan': '0 0 80px -20px rgba(56,214,255,0.4)',
        pulse: '0 0 12px #00FFB7, 0 0 0 2px #050505',
      },
    },
  },
  plugins: [],
}

export default config
