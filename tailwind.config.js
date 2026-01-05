/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        serif: ['"STIX Two Text"', '"Latin Modern Roman"', 'serif'],
      },
      colors: {
        primary: '#4f46e5',
        secondary: '#10b981',
      }
    }
  },
  plugins: [],
}
