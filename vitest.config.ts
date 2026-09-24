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
      // which quietly stops testing something fails here rather than going unnoticed. Branches sit
      // lower than the rest on purpose, and honestly: every ?., ?? and default counts as one, and
      // the last of them are failures of somebody else's program that would take a fake of it to
      // force. See docs/testing.md.
      thresholds: { statements: 84, branches: 73, functions: 82, lines: 88 },
    },
  },
});
