export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // design system colors
        brand: {
          teal:    '#00D4AA',
          red:     '#EF4444',
          yellow:  '#FACC15',
          green:   '#4ADE80',
          orange:  '#F97316',
          purple:  '#A78BFA',
        },
        dark: {
          900: '#111111',  // page background
          800: '#1A1A1A',  // card background
          700: '#1E1E1E',  // input background
          600: '#2A2A2A',  // border default
          500: '#333333',  // border emphasis
          400: '#555555',  // text muted
          300: '#888888',  // text secondary
          200: '#AAAAAA',  // text tertiary
          100: '#FFFFFF',  // text primary
        }
      },
      borderRadius: {
        'card': '14px',
        'btn':  '12px',
        'badge': '8px',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display',
               'Segoe UI', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}