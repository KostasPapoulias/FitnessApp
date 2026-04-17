/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Background
        'bg-primary': '#111111',
        'bg-secondary': '#1A1A1A',
        'bg-card': '#1E1E1E',
        
        // Accent
        'accent-teal': '#00D4AA',
        'accent-red': '#EF4444',
        
        // Text
        'text-primary': '#FFFFFF',
        'text-secondary': '#888888',
        'text-muted': '#555555',
        
        // Borders
        'border-default': '#2A2A2A',
        'border-emphasis': '#333333',
        
        // Fatigue states
        'fatigue-high': '#EF4444',
        'fatigue-moderate': '#FACC15',
        'fatigue-recovered': '#4ADE80',
      },
      borderRadius: {
        'card': '14px',
        'button': '12px',
        'badge': '8px',
      },
      fontFamily: {
        'system': [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Oxygen',
          'Ubuntu',
          'Cantarell',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
