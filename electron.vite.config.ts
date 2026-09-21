import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

const shared = { '@shared': resolve('src/shared') };

export default defineConfig({
  main: {
    resolve: { alias: shared },
    build: { externalizeDeps: true },
  },
  preload: {
    resolve: { alias: shared },
    // CommonJS so the renderer can stay sandboxed.
    build: { externalizeDeps: true, rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
  renderer: {
    root: 'src/renderer',
    resolve: { alias: { ...shared, '@': resolve('src/renderer/src') } },
    plugins: [react()],
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html') } } },
  },
});
