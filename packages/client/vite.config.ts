import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true, fs: { allow: ['../..'] } },
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000 },
});
