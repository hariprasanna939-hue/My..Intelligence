/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#0b0f19', // deep canvas
          900: '#0f172a', // base surfaces
          850: '#131d33', // elevated panels / sidebars
          800: '#1e293b', // component surfaces / cards
          750: '#25334a', // hover states
          700: '#334155', // borders
          600: '#475569', // muted borders
        },
        editor: {
          bg: '#0b0f19',
          sidebar: '#0f172a',
          header: '#0b0f19',
          panel: '#131d33',
          card: '#16223b',
          active: '#1e293b',
          border: '#1e293b',
          borderLight: '#334155',
          text: '#f1f5f9',
          muted: '#94a3b8',
          accent: '#3b82f6',
          violet: '#6366f1',
          success: '#10b981',
          warning: '#f59e0b',
          danger: '#ef4444',
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', 'monospace'],
      }
    },
  },
  plugins: [],
}
