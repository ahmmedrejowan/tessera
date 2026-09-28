import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startApp } from './harness.mjs';

export const name = 'One file that cannot be drawn';

/** A cube, so there is a real model to draw. */
const CUBE = [
  'v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'v 0 1 0', 'v 0 0 1', 'v 1 0 1', 'v 1 1 1', 'v 0 1 1',
  'f 1 2 3 4', 'f 5 6 7 8', 'f 1 2 6 5', 'f 2 3 7 6', 'f 3 4 8 7', 'f 4 1 5 8',
].join('\n');

/**
 * Twelve bytes with a .3ds name: a chunk whose size is zero, which sends the 3DS parser round a
 * loop it never leaves. The window drawing it is then alive but never answers again, so before
 * this was handled every good file queued behind it timed out too and was written down as a file
 * that cannot be drawn. One of these in a pack cost a whole library its previews.
 */
const WEDGES_THE_PARSER = Buffer.from([0x4d, 0x4d, 0x0c, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00]);

export async function run(ok) {
  const t = await startApp();
  try {
    const home = t.folder('work');
    await t.call('library:create', join(home, 'library'), 'Previews');
    const pack = join(home, 'Kit');
    mkdirSync(pack, { recursive: true });
    writeFileSync(join(pack, 'LICENSE.txt'), 'CC0 1.0 Universal\nhttps://example.test/p');
    writeFileSync(join(pack, 'bad.3ds'), WEDGES_THE_PARSER);
    for (let i = 0; i < 4; i++) writeFileSync(join(pack, `good-${i}.obj`), CUBE);
    await t.call('import:run', await t.call('import:plan', [pack], false), {});

    const id = (await t.call('browse:packs', { scope: 'all', text: '', filters: {} }, 'added', 0, 5)).rows[0].id;
    const started = Date.now();
    await t.call('thumbs:build', [id]);

    const until = Date.now() + 170_000;
    while ((await t.call('thumbs:building')) && Date.now() < until) await new Promise((r) => setTimeout(r, 1500));
    const took = Date.now() - started;

    const cost = await t.call('thumbs:cost');
    // The property that matters, and the only one that holds wherever this runs: the queue is not
    // wedged. One file hangs and times out after 30 seconds. If it took the window with it and
    // never gave it back, the four behind it would each wait their own 30 seconds, so the whole
    // thing would take over two minutes instead of about half of one.
    ok('one file that hangs does not hold up the four behind it', took < 90_000, `${Math.round(took / 1000)}s for five files, one of which hangs`);
    ok('the file that cannot be drawn is the one that fails', cost.failed >= 1, `${cost.failed} failed`);
    // Drawing a model needs a working GPU path, which a headless runner may not have. Where
    // nothing at all can be drawn there is nothing to conclude, so this is checked only when the
    // environment can draw.
    if (cost.count > 0) ok('and every good file behind it is still drawn', cost.count === 4, `${cost.count} drawn of 4`);
    else ok('nothing could be drawn here at all, so only the timing is checked', true, 'no previews drawn in this environment');
    ok('nothing went wrong in the window', t.errors.length === 0, t.errors.join(' | '));
  } finally {
    await t.stop();
  }
}
