import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    target: 'es2022',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@telegram-apps')) {
            return 'vendor-telegram';
          }
          if (id.includes('node_modules/vaul') || id.includes('node_modules/@radix-ui')) {
            return 'vendor-vaul';
          }
          if (id.includes('foodPresets.json')) {
            return 'data-presets';
          }
        }
      }
    }
  }
});
