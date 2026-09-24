import { startApp, waitFor, withSamples } from './harness.mjs';

export const name = 'What a library remembers after a restart';

export async function run(ok) {
  const first = await startApp();
  const dataDir = first.dataDir;
  let root;
  try {
    root = await withSamples(first);
    await first.call('settings:update', { theme: 'dark', binKeepDays: 7 });
    const pack = (await first.call('browse:packs', { scope: 'library', text: 'arcade', filters: {} }, 'name', 0, 1)).rows[0];
    await first.call('favourites:pack', pack.id, true);
    await first.call('collections:create', 'For the platformer', {});
    await first.page.waitForTimeout(1500);
  } finally {
    await first.close();
  }

  // The same data folder, a new run of the app: it should pick up where it was left.
  const again = await startApp({ dataDir });
  try {
    await waitFor(again, async () => (await again.call('library:state')).status === 'ready', 'the library to open by itself');
    await waitFor(again, async () => (await again.call('library:stats')).packs === 3, 'the packs to be read again');
    ok('it opens the library it was last in, with everything in it', (await again.call('library:state')).library.path === root);
    ok('what was starred is still starred', (await again.call('browse:packs', { scope: 'library', text: '', filters: {}, favourites: true }, 'name', 0, 5)).total === 1);
    ok('the collection is still there', (await again.call('collections:list')).some((c) => c.name === 'For the platformer'));
    const settings = await again.call('settings:get');
    ok('and the settings are as they were left', settings.theme === 'dark' && settings.binKeepDays === 7, `${settings.theme}, ${settings.binKeepDays} days`);
    ok('nothing went wrong in the window', again.errors.length === 0, again.errors.join(' | '));
  } finally {
    await again.stop();
  }
}
