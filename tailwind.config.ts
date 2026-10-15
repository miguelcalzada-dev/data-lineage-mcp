import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        cream: '#FAFAF9',
        ink: '#1A1916',
        stone: {
          50: '#fafaf9',
          100: '#f5f5f4',
          200: '#e7e5e4',
          300: '#d6d3d1',
          400: '#a8a29e',
          500: '#78716c',
          600: '#57534e',
          700: '#44403c',
          800: '#292524',
          900: '#1c1917',
        },
        night: {
          50: '#f6f5f1',
          100: '#ecebe6',
          200: '#dcdad4',
          300: '#c4c1bb',
          400: '#a8a5a0',
          500: '#8f8c87',
          600: '#565550',
          700: '#454340',
          800: '#3a3936',
          900: '#2b2a27',
          950: '#232220',
        },
      },
    },
  },
  plugins: [],
};

export default config;
