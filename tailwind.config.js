/** @type {import('tailwindcss').Config} */
import animate from 'tailwindcss-animate';

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-4px)' },
          '40%, 80%': { transform: 'translateX(4px)' }
        }
      },
      animation: {
        fadeIn: 'fadeIn 0.2s ease-out',
        shake: 'shake 0.35s ease-in-out'
      },
      colors: {
        app: {
          bg: '#0B1220',
          surface: '#111A2B',
          surfaceAlt: '#17233A',
          border: '#23324D',
          borderHover: '#33476B',
          primary: '#14B8A6',
          primaryHover: '#0D9488',
          primaryLight: 'rgba(20, 184, 166, 0.12)',
          success: '#10B981',
          successLight: 'rgba(16, 185, 129, 0.12)',
          text: '#FFFFFF',
          textMuted: '#E2E8F0',
          textDim: '#94A3B8'
        }
      },
      fontFamily: {
        cairo: ['Cairo', 'Segoe UI', 'Tahoma', 'sans-serif']
      },
      boxShadow: {
        'glow-teal': '0 0 20px -3px rgba(20, 184, 166, 0.25)',
        'glow-teal-lg': '0 0 35px -5px rgba(20, 184, 166, 0.35)',
        'card-dark': '0 10px 30px -5px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(35, 50, 77, 0.6)'
      }
    },
  },
  plugins: [animate],
}
