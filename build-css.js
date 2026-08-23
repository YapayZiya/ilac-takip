const postcss = require('postcss');
const tailwind = require('tailwindcss');
const fs = require('fs');

const css = '@tailwind base;\n@tailwind components;\n@tailwind utilities;';

tailwind.process(css, {
  content: ['./www/index.html', './app.js'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
      colors: {
        brand: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59'
        }
      }
    }
  },
  plugins: []
}).then(result => {
  fs.writeFileSync('./www/tailwind.css', result.css);
  console.log('CSS built successfully');
}).catch(e => {
  console.error('Error:', e);
  process.exit(1);
});