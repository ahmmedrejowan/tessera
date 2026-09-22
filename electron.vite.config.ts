import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

const shared = { '@shared': resolve('src/shared') };

export default defineConfig({
  main: {
    resolve: { alias: shared },
    // Error reports go to the service named at build time (a release secret); builds without it can't send any.
    define: { __TESSERA_REPORTS_DSN__: JSON.stringify(process.env.TESSERA_REPORTS_DSN ?? '') },
    build: { externalizeDeps: true },
  },
  preload: {
    resolve: { alias: shared },
    // CommonJS so the renderer can stay sandboxed.
    build: {
      externalizeDeps: true,
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts'), worker: resolve('src/preload/worker.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    resolve: { alias: { ...shared, '@': resolve('src/renderer/src') } },
    plugins: [react()],
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html'), worker: resolve('src/renderer/worker.html') } } },
  },
});
