/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#FCFCFE',
        primary: {
          50: '#E8E8F9',
          100: '#D1D2F4',
          200: '#BFC0EF',
          300: '#9798E4',
          400: '#6E71DA',
          500: '#4649CF',
          600: '#2E31B4',
          700: '#24268B',
          800: '#1A1B62',
          900: '#0F103A',
        },
        status: {
          late: '#ef4444',
          critical: '#ef4444',
          priority: '#f97316',
          tomorrow: '#eab308',
          ontime: '#22c5e5',
        }
      },
    },
  },
  plugins: [],
}