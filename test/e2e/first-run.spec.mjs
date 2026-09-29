import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { startApp, waitFor } from './harness.mjs';

export const name = 'The first run';

export async function run(ok) {
  const t = await startApp();
  try {
    ok('the window opens on the welcome screen', await t.page.getByText('Tessera', { exact: false }).first().isVisible());

    const root = join(t.dataDir, 'My Library');
    await t.call('library:create', root, 'My Library');
    await waitFor(t, async () => (await t.call('library:state')).status === 'ready', 'the library to open');
    ok('a library is an ordinary folder, made where it was asked for', existsSync(join(root, 'packs')) && existsSync(join(root, 'tessera-library.json')));
    // Waited for, not asked once. The app says "ready" as soon as the library is open, and the
    // window draws on its own schedule a frame or two later; asking the instant the state changed
    // was a coin toss, and it is the reason this suite failed about one run in three.
    const named = t.page.getByText('My Library', { exact: false }).first();
    const moved = await named.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false);
    ok('and the window moves on to it', moved);

    // The sample packs: the way most people will see their first pack.
    await t.call('import:run', await t.call('import:plan', await t.call('import:samples'), false));
    await waitFor(t, async () => (await t.call('library:stats')).packs >= 3, 'the packs to be read');
    const stats = await t.call('library:stats');
    ok('three packs go in, with everything inside them counted', stats.packs === 3 && stats.assets > 100, `${stats.packs} packs, ${stats.assets} assets`);
    ok('their licenses were read from the packs themselves', (await t.call('library:health')).noLicense.length === 0);

    await t.page.waitForTimeout(1200);
    ok('Home shows what the library is made of', await t.page.getByText('Overview', { exact: true }).first().isVisible());
    ok('nothing went wrong in the window', t.errors.length === 0, t.errors.join(' | '));
  } finally {
    await t.stop();
  }
}
