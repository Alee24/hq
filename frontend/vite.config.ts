import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 2365,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:37223',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:37223',
        ws: true,
      },
    },
  },
});
