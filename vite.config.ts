import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(async ({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const isWebBuild = process.env.BUILD_TARGET === 'web';

    // Only load electron plugin when not in web build mode
    const plugins: any[] = [react()];

    if (!isWebBuild) {
      try {
        const { default: electron } = await import('vite-plugin-electron/simple');
        plugins.push(electron({
          main: {
            entry: 'electron/main.ts',
          },
          preload: {
            input: 'electron/preload.ts',
          },
          renderer: {},
        }));
      } catch (e) {
        console.warn('[vite] electron plugin not loaded', e?.message || e);
      }
    }

    return {
      // Use relative paths for built assets so production bundles work when served
      // from a subpath or filesystem (avoids requests to absolute /index.css)
      base: './',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins,
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        outDir: 'dist',
        emptyOutDir: true,
      },
    };
});
