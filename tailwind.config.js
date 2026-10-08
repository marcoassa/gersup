/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Verde Oliva Militar (Military Olive Green)
        primary: {
          50: '#f4f7ee',
          100: '#e4eed7',
          200: '#c8ddaf',
          300: '#a7c883',
          400: '#87b05d',
          500: '#6c9545',
          600: '#547734',
          700: '#415c2a',
          800: '#354a23',
          900: '#2d3e1f',
        },
        // Superfícies em tom Verde Oliva Escuro Profundo
        surface: {
          950: '#0c1008',
          900: '#12170e',
          800: '#192113',
          700: '#222d1a',
          600: '#2e3d24',
          500: '#435635',
          400: '#758c67',
          300: '#a2b794',
          200: '#c7d8bd',
          100: '#e6efe0',
          50: '#f4f8f0',
        },
        // Amarelo e Dourado Militar (Military Gold / Yellow Accent)
        accent: {
          50: '#fefce8',
          100: '#fef9c3',
          200: '#fef08a',
          300: '#fde047',
          400: '#facc15',
          500: '#eab308',
          600: '#ca8a04',
          700: '#a16207',
          800: '#854d0e',
          900: '#713f12',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
