import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { defaultConfig } from './src/shared/config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_BASE_URL || defaultConfig.apiBaseUrl;

  return {
    plugins: [react()],
    build: {
      outDir: 'dist/client',
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      proxy: {
        '/api': apiTarget,
        '/x402': apiTarget,
      },
    },
  };
});
