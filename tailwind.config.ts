import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        royal: {
          50: '#EAF1FC',
          100: '#CEE0F8',
          200: '#9DC1F1',
          300: '#6CA2EA',
          400: '#3B83E3',
          500: '#1B63C9',
          600: '#154BAD',
          700: '#123E8F',
          800: '#0F3272',
          900: '#0B2555'
        },
        emerald: {
          50: '#E9FBF3',
          100: '#C8F4E0',
          200: '#96E8C3',
          300: '#63DCA6',
          400: '#3ED08E',
          500: '#26B876',
          600: '#1E9962',
          700: '#177A4E',
          800: '#115B3A',
          900: '#0B3D26'
        },
        flame: {
          50: '#FFF4E5',
          100: '#FFE3BC',
          200: '#FFC880',
          300: '#FFAD44',
          400: '#FF9A1F',
          500: '#F5860A',
          600: '#DB7300',
          700: '#B25D00',
          800: '#8A4800',
          900: '#623300'
        },
        ink: {
          50: '#F7F8FA',
          100: '#EEF1F5',
          200: '#DFE4EA',
          300: '#C3CAD3',
          400: '#96A0AC',
          500: '#6B7684',
          600: '#4E5765',
          700: '#37404C',
          800: '#232A33',
          900: '#12161C'
        },
        potentiel: {
          gros: '#154BAD',
          moyen: '#F5860A',
          faible: '#1E9962'
        }
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', '"SF Pro Display"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['"Inter"', '"SF Pro Text"', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        xl2: '1.25rem',
        xl3: '1.75rem',
        xl4: '2.25rem'
      },
      boxShadow: {
        soft: '0 8px 30px -12px rgba(15, 50, 114, 0.18)',
        softer: '0 4px 16px -6px rgba(15, 50, 114, 0.12)',
        glass: '0 8px 32px 0 rgba(15, 37, 85, 0.10)',
        glow: '0 0 0 1px rgba(255,255,255,0.4) inset, 0 8px 30px -10px rgba(21, 75, 173, 0.35)'
      },
      backdropBlur: {
        xs: '2px'
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-up': { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(0.94)' }, to: { opacity: '1', transform: 'scale(1)' } },
        shimmer: { '0%': { backgroundPosition: '-500px 0' }, '100%': { backgroundPosition: '500px 0' } },
        'pulse-ring': { '0%': { transform: 'scale(0.9)', opacity: '0.6' }, '100%': { transform: 'scale(1.6)', opacity: '0' } }
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out both',
        'fade-up': 'fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both',
        'scale-in': 'scale-in 0.35s cubic-bezier(0.16,1,0.3,1) both',
        shimmer: 'shimmer 1.6s infinite linear',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.2,0.6,0.4,1) infinite'
      }
    }
  },
  plugins: []
} satisfies Config
