import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startApp, waitFor, withSamples } from './harness.mjs';

export const name = 'Linking assets into a game';

export async function run(ok) {
  const t = await startApp();
  try {
    await withSamples(t);
    const folder = t.folder('Bunny Dash');
    // A Unity project, so the engine and the folder assets go in are read from the project itself.
    mkdirSync(join(folder, 'ProjectSettings'), { recursive: true });
    writeFileSync(join(folder, 'ProjectSettings', 'ProjectVersion.txt'), 'm_EditorVersion: 6000.3.24f1\n');
    await t.call('projects:add', await t.call('projects:probe', folder));
    const game = (await t.call('projects:list'))[0];
    ok('a game folder is recognised, engine and all', game?.engine === 'unity', `${game?.name} (${game?.engine})`);

    const pack = (await t.call('browse:packs', { scope: 'library', text: 'arcade', filters: {} }, 'name', 0, 1)).rows[0];
    const files = (await t.call('pack:files', pack.id)).filter((f) => f.role === 'main').slice(0, 5);
    const copied = await t.call('projects:copy', game.id, files.map((f) => ({ packId: f.packId, ref: f.ref })));
    ok('assets are copied in', copied === files.length, `${copied} assets`);

    await waitFor(t, () => existsSync(join(folder, 'CREDITS.md')), 'the credits to be written');
    const credits = readFileSync(join(folder, 'CREDITS.md'), 'utf8');
    ok('the credits name the pack and its licence', credits.includes(pack.name) && /CC0/i.test(credits));
    const entries = await t.call('projects:entries', game.id);
    ok('the game lists what it has taken, with the licence for each', entries.length === files.length && !!entries[0].licence);

    const removed = await t.call('projects:remove', game.id, entries.map((e) => ({ packId: e.packId, ref: e.ref })));
    ok('and it can all be taken back out', removed === entries.length && (await t.call('projects:entries', game.id)).length === 0);
    ok('nothing went wrong in the window', t.errors.length === 0, t.errors.join(' | '));
  } finally {
    await t.stop();
  }
}
