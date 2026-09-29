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
    ok('a game folder is recognized, engine and all', game?.engine === 'unity', `${game?.name} (${game?.engine})`);

    const pack = (await t.call('browse:packs', { scope: 'library', text: 'arcade', filters: {} }, 'name', 0, 1)).rows[0];
    const files = (await t.call('pack:files', pack.id)).filter((f) => f.role === 'main').slice(0, 5);
    const copied = await t.call('projects:copy', game.id, files.map((f) => ({ packId: f.packId, ref: f.ref })));
    ok('assets are copied in', copied === files.length, `${copied} assets`);

    await waitFor(t, () => existsSync(join(folder, 'CREDITS.md')), 'the credits to be written');
    const credits = readFileSync(join(folder, 'CREDITS.md'), 'utf8');
    ok('the credits name the pack and its license', credits.includes(pack.name) && /CC0/i.test(credits));
    const entries = await t.call('projects:entries', game.id);
    ok('the game lists what it has taken, with the license for each', entries.length === files.length && !!entries[0].license);

    const shown = await t.call('projects:credits', game.id);
    ok('the credits can be read back for the game page', shown.onDisk && shown.text === credits, shown.path);

    // A name the game already uses for a different file: checked byte for byte, then the person
    // decides. Here they keep both.
    const where = entries[0].files[0];
    const mine = join(folder, ...where.split('/'));
    await t.call('projects:remove', game.id, [{ packId: entries[0].packId, ref: entries[0].ref }]);
    mkdirSync(join(mine, '..'), { recursive: true });
    writeFileSync(mine, 'MY OWN WORK');
    const plan = await t.call('projects:plan', game.id, [{ packId: entries[0].packId, ref: entries[0].ref }]);
    ok('a different file under the same name is named before anything moves', plan.overwriting.includes(where), plan.overwriting.join(', '));
    await t.call('projects:copy', game.id, [{ packId: entries[0].packId, ref: entries[0].ref }], 'rename');
    const beside = (await t.call('projects:entries', game.id)).find((e) => e.ref === entries[0].ref).files[0];
    ok('keeping both leaves theirs alone and brings ours in beside it', readFileSync(mine, 'utf8') === 'MY OWN WORK' && beside !== where && existsSync(join(folder, ...beside.split('/'))), beside);

    // The same bytes under the same name is not a clash at all: put the library's own version at
    // the path the game uses and nothing is asked and nothing is written.
    const ours = readFileSync(join(folder, ...beside.split('/')));
    await t.call('projects:remove', game.id, [{ packId: entries[0].packId, ref: entries[0].ref }]);
    writeFileSync(mine, ours);
    const same = await t.call('projects:plan', game.id, [{ packId: entries[0].packId, ref: entries[0].ref }]);
    ok('a file already there with the same contents is left alone without asking', same.overwriting.length === 0 && same.identical >= 1, `${same.identical} identical`);

    const left = await t.call('projects:entries', game.id);
    const removed = await t.call('projects:remove', game.id, left.map((e) => ({ packId: e.packId, ref: e.ref })));
    ok('and it can all be taken back out', removed === left.length && (await t.call('projects:entries', game.id)).length === 0);
    ok('nothing went wrong in the window', t.errors.length === 0, t.errors.join(' | '));
  } finally {
    await t.stop();
  }
}
