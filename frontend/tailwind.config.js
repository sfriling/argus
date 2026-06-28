/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // Deep neutral dark palette
        surface: {
          base: '#0a0a0b',
          card: '#111113',
          hover: '#18181b',
          border: '#1f1f23',
          subtle: '#27272a',
        },
        text: {
          primary: '#f4f4f5',
          secondary: '#a1a1aa',
          muted: '#52525b',
          label: '#71717a',
        },
        accent: {
          green: '#22c55e',
          red: '#ef4444',
          amber: '#f59e0b',
          blue: '#3b82f6',
          purple: '#a855f7',
        },
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)',
      },
    },
  },
  plugins: [],
}
