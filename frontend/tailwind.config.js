/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ─── Surfaces ──────────────────────────────────────────────
        surface: {
          950: '#0A0A0D',   // deepest bg (hero, footer)
          900: '#111111',   // page bg
          800: '#1B1B1D',   // elevated card
          700: '#232326',   // secondary surface
          600: '#2F2F35',   // border subtle
          500: '#4B4B55',   // border visible
          400: '#6B6B75',   // muted text
        },
        // ─── Brand accents (Cowboy Bebop palette) ──────────────────
        cobalt: {
          DEFAULT: '#3430A8',
          light:   '#5752D1',
          dark:    '#231E8A',
          glow:    'rgba(52,48,168,0.18)',
        },
        violet: {
          DEFAULT: '#6E23AC',
          light:   '#9B4FD4',
          dark:    '#4E1880',
          glow:    'rgba(110,35,172,0.18)',
        },
        signal: {
          DEFAULT: '#FF270A',
          light:   '#FF5A3D',
          dark:    '#CC1D06',
          glow:    'rgba(255,39,10,0.14)',
        },
        brass: {
          DEFAULT: '#CFCF39',
          light:   '#E0E060',
          dark:    '#A8A82A',
          glow:    'rgba(207,207,57,0.16)',
        },
        // ─── Text ──────────────────────────────────────────────────
        ink: {
          primary:   '#F5F5F7',
          secondary: '#C6C6CC',
          muted:     '#9A9AA3',
        },
        // ─── Semantic ──────────────────────────────────────────────
        success: '#22C55E',
        warning: '#F59E0B',
        danger:  '#EF4444',
        info:    '#3B82F6',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      },
      fontSize: {
        'display': ['4.5rem',  { lineHeight: '1.05', letterSpacing: '-0.03em' }],
        'hero':    ['3.5rem',  { lineHeight: '1.1',  letterSpacing: '-0.025em' }],
        'h1':      ['3rem',    { lineHeight: '1.1',  letterSpacing: '-0.02em' }],
        'h2':      ['2.25rem', { lineHeight: '1.15', letterSpacing: '-0.015em' }],
        'h3':      ['1.75rem', { lineHeight: '1.2',  letterSpacing: '-0.01em' }],
        'h4':      ['1.375rem',{ lineHeight: '1.3' }],
      },
      backgroundImage: {
        'gradient-brand':   'linear-gradient(135deg, #111111 0%, #1a1850 50%, #3a1a5c 100%)',
        'gradient-cta':     'linear-gradient(135deg, #FF270A 0%, #6E23AC 100%)',
        'gradient-cobalt':  'linear-gradient(135deg, #3430A8 0%, #6E23AC 100%)',
        'gradient-signal':  'linear-gradient(135deg, #FF270A 0%, #FF5A3D 100%)',
      },
      boxShadow: {
        'card':   '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        'card-lg':'0 4px 24px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)',
        'glow-cobalt': '0 0 24px rgba(52,48,168,0.35)',
        'glow-violet': '0 0 24px rgba(110,35,172,0.35)',
        'glow-signal': '0 0 20px rgba(255,39,10,0.3)',
        'inner-top': 'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      borderRadius: {
        'sm':  '6px',
        'md':  '10px',
        'lg':  '14px',
        'xl':  '18px',
        '2xl': '24px',
        '3xl': '32px',
      },
      transitionDuration: {
        'fast': '100ms',
        'base': '200ms',
        'slow': '400ms',
      },
      animation: {
        'gradient-drift': 'gradientDrift 8s ease infinite',
        'float':          'float 6s ease-in-out infinite',
        'pulse-glow':     'pulseGlow 3s ease-in-out infinite',
      },
      keyframes: {
        gradientDrift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%':      { backgroundPosition: '100% 50%' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-8px)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.6' },
          '50%':      { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
