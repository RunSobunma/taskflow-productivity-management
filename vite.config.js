import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps the production build portable (any sub-folder / static host).
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173, open: true },
});
