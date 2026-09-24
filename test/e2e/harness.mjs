/**
 * Driving the real app. Each test gets its own data folder and its own library, so nothing it does
 * can reach anything else, and the app is the one that was built, not a mock of it.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

export const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Start the app with nothing in it. Returns the window, a way to call the app, and a way to stop. */
export async function startApp({ size = [1360, 900], dataDir: reuse } = {}) {
  const dataDir = reuse ?? mkdtempSync(join(tmpdir(), 'tessera-e2e-'));
  if (!reuse) {
    writeFileSync(join(dataDir, 'settings.json'), JSON.stringify({ theme: 'light', errorReports: 'never', updateCheck: false }));
    writeFileSync(join(dataDir, 'window.json'), JSON.stringify({ x: 30, y: 30, width: size[0], height: size[1], maximized: false }));
  }
  const app = await electron.launch({
    // Chromium slows a window it thinks nobody is looking at down to almost no frames, and under a
    // headless display on CI it often thinks exactly that. Playwright waits for two frames before
    // it will click anything, so without these the first click can wait for ever.
    args: ['--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion', repo],
    env: { ...process.env, TESSERA_USER_DATA: dataDir, TESSERA_E2E: '1', TESSERA_UPDATE_FEED: '' },
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForTimeout(2000);

  /** Call the app the way the window does. Throws what the app would have shown. */
  const call = async (...args) => {
    const answer = await page.evaluate((a) => window.tessera.invoke(...a), args);
    if (!answer.ok) throw new Error(`${args[0]}: ${JSON.stringify(answer.error)}`);
    return answer.value;
  };

  return {
    app,
    page,
    call,
    dataDir,
    errors,
    /** A folder of this test's own, which goes when the test does. */
    folder(name) {
      const dir = join(dataDir, 'files', name);
      mkdirSync(dir, { recursive: true });
      return dir;
    },
    /** Close the window. The data folder stays, so the app can be started on it again. */
    async close() {
      await shut(app);
    },
    async stop() {
      await shut(app);
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/**
 * Stop the app, and mean it. On a Mac an app with no windows left is still running, which is how
 * Macs work and not a fault; but a test that waits for ever on one tells nobody anything, so after
 * a while it is stopped outright.
 */
async function shut(app) {
  // Taken before closing: afterwards there is nothing left to ask.
  const proc = (() => {
    try {
      return app.process();
    } catch {
      return null;
    }
  })();
  await Promise.race([app.close().catch(() => undefined), new Promise((r) => setTimeout(r, 15_000))]);
  if (proc && proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL');
}

/** A library with the three sample packs in it, the way a new user's first minutes look. */
export async function withSamples(t) {
  const root = join(t.dataDir, 'Library');
  await t.call('library:create', root, 'Test library');
  await t.page.waitForTimeout(1500);
  await t.call('import:run', await t.call('import:plan', await t.call('import:samples'), false));
  await waitFor(t, async () => (await t.call('library:stats')).packs >= 3, 'the sample packs to be added');
  return root;
}

/** Wait until nothing is running in the background, so a test is not racing the app. */
export async function settled(t, timeout = 60_000) {
  await waitFor(t, async () => (await t.call('jobs:list')).every((j) => j.state !== 'running'), 'the background work to finish', timeout);
  await t.page.waitForTimeout(250);
}

/** Wait for something the app is doing in the background. */
export async function waitFor(t, check, what, timeout = 30_000) {
  const until = Date.now() + timeout;
  for (;;) {
    if (await check()) return;
    if (Date.now() > until) throw new Error(`gave up waiting for ${what}`);
    await t.page.waitForTimeout(250);
  }
}
