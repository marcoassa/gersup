/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f4ff', 100: '#e0e9ff', 200: '#c7d6fe', 300: '#a5b8fc',
          400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca',
          800: '#3730a3', 900: '#312e81',
        },
        surface: {
          900: '#0b0e18', 800: '#131929', 700: '#1a2236', 600: '#212b42',
          500: '#2c3a56', 400: '#4a5a82', 300: '#7a8db5', 200: '#a8b8d8',
          100: '#cdd8ee', 50: '#edf1f9',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
