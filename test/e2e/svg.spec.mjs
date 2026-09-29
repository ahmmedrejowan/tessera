import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startApp } from './harness.mjs';

export const name = 'An SVG that reaches outside itself';

/**
 * An icon pack's SVG is measured by putting it into the page, and drawn by handing it to an
 * <img>. Both happen while thumbnails are being made, before anybody has clicked anything, so a
 * pack that points at a remote image made the request: a thing this application promises not to
 * do, and on Windows a `file://host/share` reference is an SMB login attempt. It also tainted the
 * canvas, so the preview failed and the pack showed nothing.
 */
const NASTY = [
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="40" height="40">',
  '<script>window.__ran = 1</script>',
  '<image href="//example.invalid/share/x.png" width="10" height="10"/>',
  '<image xlink:href="file://example.invalid/share/y.png" width="10" height="10"/>',
  '<foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">hi</div></foreignObject>',
  '<rect width="30" height="30" fill="blue" onload="window.__ran2 = 1" style="fill:url(//example.invalid/p.svg#x)"/>',
  '</svg>',
].join('');

const PLAIN = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="15" fill="red"/></svg>';

export async function run(ok) {
  const t = await startApp();
  try {
    const home = t.folder('work');
    await t.call('library:create', join(home, 'library'), 'Icons');
    const pack = join(home, 'Icons');
    mkdirSync(pack, { recursive: true });
    writeFileSync(join(pack, 'LICENSE.txt'), 'CC0 1.0 Universal\nhttps://example.test/p');
    writeFileSync(join(pack, 'plain.svg'), PLAIN);
    writeFileSync(join(pack, 'nasty.svg'), NASTY);
    await t.call('import:run', await t.call('import:plan', [pack], false), {});

    const id = (await t.call('browse:packs', { scope: 'all', text: '', filters: {} }, 'added', 0, 5)).rows[0].id;
    await t.call('thumbs:build', [id]);
    const until = Date.now() + 90_000;
    while ((await t.call('thumbs:building')) && Date.now() < until) await new Promise((r) => setTimeout(r, 1000));

    const cost = await t.call('thumbs:cost');
    ok('both are drawn, including the one full of things it should not have', cost.count === 2 && cost.failed === 0, `${cost.count} drawn, ${cost.failed} failed`);

    const ran = await t.page.evaluate(() => ({ a: window.__ran ?? null, b: window.__ran2 ?? null }));
    ok('and nothing in it ran', !ran.a && !ran.b, JSON.stringify(ran));
    ok('nothing went wrong in the window', t.errors.length === 0, t.errors.join(' | '));
  } finally {
    await t.stop();
  }
}
