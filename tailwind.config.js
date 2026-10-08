/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Azul Índigo / Navy (tema principal)
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        // Superfícies em tom Navy Escuro Profundo
        surface: {
          950: '#07080f',
          900: '#0d0f1a',
          800: '#141726',
          700: '#1a1f35',
          600: '#232847',
          500: '#3a4270',
          400: '#6b7db3',
          300: '#9aaad4',
          200: '#c5cef0',
          100: '#e4e8f8',
          50: '#f3f5fd',
        },
        // Violeta / Roxo (accent)
        accent: {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7e22ce',
          800: '#6b21a8',
          900: '#581c87',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
