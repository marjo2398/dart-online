import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'path';
import { defineConfig } from 'vite';

const omitPrivateApiFiles = () => ({
  name: 'omit-private-api-files',
  apply: 'build' as const,
  closeBundle() {
    const apiDirectory = path.resolve(__dirname, 'dist/api');
    const dataDirectory = path.join(apiDirectory, 'data');
    rmSync(path.join(apiDirectory, 'config.local.php'), { force: true });
    rmSync(dataDirectory, { recursive: true, force: true });
    mkdirSync(dataDirectory, { recursive: true });
    copyFileSync(path.resolve(__dirname, 'public/api/data/.htaccess'), path.join(dataDirectory, '.htaccess'));
  },
});

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), omitPrivateApiFiles()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8080',
    },
  },
});
