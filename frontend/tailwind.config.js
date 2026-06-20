/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#F5F1E8',
        'white-warm': '#FDFCFA',
        'bark-brown': '#4A3F35',
        taupe: '#8B7E6D',
        sand: '#E8DFD0',
        forest: '#3D5A40',
        sage: '#7A8B6F',
        'moss-light': '#D8E0CC',
        clay: '#A67B5B',
        umber: '#6B4F3B',
        'slate-blue': '#5B7C8D',
        'dusty-blue': '#A8C0CB',
        'deep-blue': '#3A5A6B',
        'warning-clay': '#C17A4D',
        'error-rust': '#A85C3F',
      },
    },
  },
  plugins: [],
}

