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
      // The floor, not the goal: a little under what the suite covers today, so that a change
      // which quietly stops testing something fails here rather than going unnoticed. A system
      // only runs its own half of what is written for all three, so the floor leaves room for
      // that too. See docs/testing.md.
      thresholds: { statements: 87, branches: 78, functions: 84, lines: 91 },
    },
  },
});
