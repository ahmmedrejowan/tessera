import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startApp } from './harness.mjs';

export const name = 'Knowing what files contain';

/**
 * Two bundles ship the same barrel under different pack names, and the library is asked whether it
 * already has it. Neither the name nor the size answers that; the contents do.
 */
export async function run(ok) {
  const t = await startApp();
  try {
    const home = t.folder('work');
    await t.call('library:create', join(home, 'library'), 'Contents');
    for (const [pack, own] of [['Props Vol 1', 'crate.png'], ['Mega Bundle', 'rock.png']]) {
      const dir = join(home, 'src', pack);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'LICENSE.txt'), 'CC0 1.0 Universal\nhttps://example.test/p');
      writeFileSync(join(dir, 'barrel.fbx'), 'THE VERY SAME BARREL BYTES');
      writeFileSync(join(dir, own), `only in ${pack}`);
      await t.call('import:run', await t.call('import:plan', [dir], false), {});
    }
    for (const p of (await t.call('browse:packs', { scope: 'all', text: '', filters: {} }, 'name', 0, 10)).rows) {
      await t.call('pack:edit', p.id, { source: { url: `https://example.test/${p.id}`, site: null, creator: 'Someone' } });
      await t.call('pack:status', p.id, 'library');
    }

    const until = Date.now() + 90_000;
    while ((await t.call('library:stillReading')) > 0 && Date.now() < until) await new Promise((r) => setTimeout(r, 400));
    ok('it reads what every file contains, on its own, in the background', (await t.call('library:stillReading')) === 0);

    const dupes = await t.call('library:duplicates');
    const barrel = dupes.find((d) => d.name === 'barrel.fbx');
    ok('and finds the same file in two packs that call it nothing alike', !!barrel && barrel.copies === 2, `${dupes.length} duplicate(s)`);
    ok('naming both packs, and what the second copy costs', barrel?.packs.length === 2 && barrel.bytes > 0, barrel?.packs.map((p) => p.packName).join(' and '));
    ok('nothing went wrong in the window', t.errors.length === 0, t.errors.join(' | '));
  } finally {
    await t.stop();
  }
}
