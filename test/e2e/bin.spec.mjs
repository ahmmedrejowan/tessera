import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { startApp, waitFor, withSamples } from './harness.mjs';

export const name = 'Deleting, and getting it back';

export async function run(ok) {
  const t = await startApp();
  try {
    const root = await withSamples(t);
    const pack = (await t.call('browse:packs', { scope: 'library', text: 'arcade', filters: {} }, 'name', 0, 1)).rows[0];
    const before = (await t.call('library:stats')).packs;

    await t.call('pack:remove', pack.id);
    await waitFor(t, async () => (await t.call('library:stats')).packs === before - 1, 'the pack to go');
    const bin = await t.call('bin:list');
    ok('a deleted pack waits in the bin, inside the library', bin.length === 1 && existsSync(join(root, 'bin')));
    ok('and is no longer in the library', (await t.call('browse:packs', { scope: 'library', text: 'arcade', filters: {} }, 'name', 0, 1)).total === 0);

    await t.call('bin:restore', bin[0].id);
    await waitFor(t, async () => (await t.call('library:stats')).packs === before, 'the pack to come back');
    ok('putting it back returns it whole', (await t.call('browse:packs', { scope: 'library', text: 'arcade', filters: {} }, 'name', 0, 1)).total === 1);

    await t.call('pack:remove', pack.id);
    await waitFor(t, async () => (await t.call('bin:list')).length === 1, 'the bin');
    ok('emptying the bin is the one thing that cannot be undone', (await t.call('bin:empty')) === 1 && (await t.call('bin:list')).length === 0);
    ok('nothing went wrong in the window', t.errors.length === 0, t.errors.join(' | '));
  } finally {
    await t.stop();
  }
}
