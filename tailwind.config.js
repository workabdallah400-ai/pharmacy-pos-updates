/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
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
        cairo: ['Cairo', 'sans-serif']
      },
      boxShadow: {
        'glow-teal': '0 0 20px -3px rgba(20, 184, 166, 0.25)',
        'glow-teal-lg': '0 0 35px -5px rgba(20, 184, 166, 0.35)',
        'card-dark': '0 10px 30px -5px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(35, 50, 77, 0.6)'
      }
    },
  },
  plugins: [],
}
