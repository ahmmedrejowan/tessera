import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared'), '@renderer': resolve('src/renderer/src') } },
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    environment: 'node',
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/main/**/*.ts', 'src/shared/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        // Only Electron can run these: they build windows, menus, the drag-and-drop source and the
        // hidden window thumbnails are drawn in. Driving the built app is what covers them, and the
        // end-to-end suite does exactly that.
        'src/main/index.ts',
        'src/main/menu.ts',
        'src/main/drag.ts',
        'src/main/thumbs/renderWindow.ts',
      ],
      thresholds: { statements: 80, branches: 75, functions: 80, lines: 80 },
    },
  },
});
