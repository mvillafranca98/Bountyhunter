/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          900: '#0B0F1A',   // deepest bg
          800: '#111827',   // page bg
          700: '#1F2937',   // card bg
          600: '#374151',   // border / hover
        },
        brand: {
          DEFAULT: '#6366F1',   // indigo-500
          light: '#818CF8',     // indigo-400
          dark: '#4F46E5',      // indigo-600
        },
        success: '#10B981',   // emerald-500
        warning: '#F59E0B',   // amber-500
        danger:  '#EF4444',   // red-500
        info:    '#3B82F6',   // blue-500
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
