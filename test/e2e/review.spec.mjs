import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startApp, waitFor } from './harness.mjs';

export const name = 'A pack with no licence waits in Review';

export async function run(ok) {
  const t = await startApp();
  try {
    await t.call('library:create', join(t.dataDir, 'Library'), 'Library');
    await waitFor(t, async () => (await t.call('library:state')).status === 'ready', 'the library');

    const from = t.folder('Rocks');
    for (const f of ['rock_a.obj', 'rock_b.obj']) writeFileSync(join(from, f), 'o rock\nv 0 0 0\n');
    await t.call('import:run', await t.call('import:plan', [from], false));
    await waitFor(t, async () => (await t.call('library:stats')).inbox === 1, 'the pack to reach Review');

    const stats = await t.call('library:stats');
    ok('it is in Review, not in the library', stats.inbox === 1 && stats.packs === 0);
    const waiting = (await t.call('browse:packs', { scope: 'inbox', text: '', filters: {} }, 'added', 0, 5)).rows;
    ok('and it cannot be browsed', (await t.call('browse:packs', { scope: 'library', text: '', filters: {} }, 'name', 0, 5)).total === 0);

    const id = waiting[0].id;
    await t.call('pack:edit', id, { licence: { id: 'CC0-1.0', attribution: null, proof: [], notes: '' } });
    let refused = null;
    await t.call('pack:status', id, 'library').catch((e) => (refused = e));
    ok('a licence alone is not enough to let it out', !!refused, String(refused).slice(0, 60));

    await t.call('pack:edit', id, { source: { site: null, name: 'A friend', url: null, creator: null, creatorUrl: null } });
    await t.call('pack:status', id, 'library');
    await waitFor(t, async () => (await t.call('library:stats')).packs === 1, 'the pack to join the library');
    ok('with both, it joins the library', (await t.call('library:stats')).inbox === 0);
    ok('nothing went wrong in the window', t.errors.length === 0, t.errors.join(' | '));
  } finally {
    await t.stop();
  }
}
