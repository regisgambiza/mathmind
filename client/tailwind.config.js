/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink:     '#0d0d14',
        paper:   '#f5f2eb',
        accent:  '#1c6fff',
        accent2: '#00c96e',
        muted:   '#6e6e77',
        card:    '#fffdfa',
        correct: '#008f4c',
        wrong:   '#ff4d1c',
        border:  '#e0ddd6',
      },
      fontFamily: {
        syne:   ['Syne', 'sans-serif'],
        dm:     ['DM Sans', 'sans-serif'],
      },
      screens: {
        'xs': '375px',    // Small phones
        'sm': '640px',    // Large phones
        'md': '768px',    // Tablets
        'lg': '1024px',   // Small laptops
        'xl': '1280px',   // Desktops
        '2xl': '1536px',  // Large desktops
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      keyframes: {
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulse2: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.4' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        progress: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        skeleton: {
          '0%': { backgroundPosition: '-200px 0' },
          '100%': { backgroundPosition: 'calc(200px + 100%) 0' },
        },
      },
      animation: {
        fadeUp: 'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        pulse2: 'pulse2 1.5s ease-in-out infinite',
        shimmer: 'shimmer 2.4s infinite linear',
        progress: 'progress 1.5s ease-in-out infinite',
        skeleton: 'skeleton 1.5s ease-in-out infinite',
      },
      borderRadius: {
        'none': '0',
        'sm': '0.375rem',
        'md': '0.5rem',
        'lg': '0.75rem',
        'xl': '1rem',
        '2xl': '1.25rem',
        '3xl': '1.5rem',
        'full': '9999px',
      },
    },
  },
  plugins: [],
}
