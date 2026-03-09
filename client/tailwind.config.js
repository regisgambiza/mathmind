/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink:     '#0d0d14',
        paper:   '#f5f2eb',
        accent:  '#ff4d1c',
        accent2: '#1c6fff',
        muted:   '#8a8880',
        card:    '#ffffff',
        correct: '#00c96e',
        wrong:   '#ff4d1c',
        border:  '#e0ddd6',
      },
      fontFamily: {
        syne:   ['Syne', 'sans-serif'],
        dm:     ['DM Sans', 'sans-serif'],
      },
      keyframes: {
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulse2: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.4' },
        }
      },
      animation: {
        fadeUp: 'fadeUp 0.35s ease forwards',
        pulse2: 'pulse2 1.5s ease-in-out infinite',
      }
    },
  },
  plugins: [],
}
