/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic Surfaces mapped to Visual Reference Design Tokens
        navy: {
          950: '#f3f5fd', // Main background canvas (soft lavender)
          900: '#eaeffd', // Sidebar & drawer background
          850: '#ffffff', // Card & panel surface
          800: '#e8edfc', // Component surface / hover state
          750: '#f5f7fe', // Secondary muted surface
          700: 'rgba(158, 162, 236, 0.40)', // Main border / divider
          600: 'rgba(158, 162, 236, 0.20)', // Subtle border
        },
        // Typography mapped to Reference High-Contrast Midnight Indigo
        slate: {
          50: '#0f172a',
          100: '#1e1b4b', // Deep midnight indigo (primary headings)
          200: '#2e2b6b', // Deep indigo body text
          300: '#3730a3', // Secondary text
          400: '#5c6096', // Muted periwinkle-slate text
          500: '#797d9e', // Subtle hints & footnotes
          600: '#9ea3c7', // Subtle accents
          700: '#c5caea', // Muted borders
          800: '#dbe0f8', // Soft dividers
          900: '#edf0fd', // Soft surfaces
          950: '#f6f8fe', // Pure soft white
        },
        // Brand Accent mapped to Reference Periwinkle-Violet
        blue: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#8b7ff0', // Soft periwinkle
          500: '#7c6ff2',
          600: '#7066e0', // Primary action button (matching reference mic button)
          700: '#5d52d9', // Hover state
          800: '#4c3fc2',
          900: '#3c329f',
          950: '#1e1b4b',
        },
        // Dedicated Reference Tokens
        iris: {
          50: '#f5f4ff',
          100: '#ebe9fe',
          200: '#ddd8fe',
          500: '#8b7ff0',
          600: '#7066e0',
          700: '#5d52d9',
          900: '#292c79',
          950: '#1e1b4b',
        },
        editor: {
          bg: '#ffffff',
          sidebar: '#f3f5fd',
          header: '#f3f5fd',
          panel: '#ffffff',
          card: '#ffffff',
          active: '#e8edfc',
          border: 'rgba(158, 162, 236, 0.35)',
          borderLight: 'rgba(158, 162, 236, 0.20)',
          text: '#1e1b4b',
          muted: '#5c6096',
          accent: '#7066e0',
          violet: '#8b7ff0',
          success: '#059669',
          warning: '#d97706',
          danger: '#e11d48',
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', 'monospace'],
      },
      borderRadius: {
        '2xl': '24px',
        '3xl': '32px',
      },
      boxShadow: {
        card: '0 4px 20px -2px rgba(112, 102, 224, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.03)',
        elevated: '0 12px 36px -4px rgba(112, 102, 224, 0.16), 0 4px 12px -2px rgba(0, 0, 0, 0.05)',
        orb: '0 20px 48px -6px rgba(147, 51, 234, 0.38), 0 10px 20px -4px rgba(99, 102, 241, 0.28)',
      }
    },
  },
  plugins: [],
}
