// Screenshots for the README and the guide, from a library made on the spot out of the CC0 sample
// packs the app ships with. Nothing here touches a real library.
//   npm run build && node scripts/guide-shots.mjs [outDir]
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron } from 'playwright';

const out = resolve(process.argv[2] ?? 'docs/images');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const root = join(tmpdir(), `tessera-guide-${Date.now()}`);
const userData = mkdtempSync(join(tmpdir(), 'tessera-guide-data-'));
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ theme: 'light', errorReports: 'never' }));
writeFileSync(join(userData, 'window.json'), JSON.stringify({ x: 20, y: 20, width: 1440, height: 900, maximized: false }));

setTimeout(() => {
  console.error('timed out');
  process.exit(1);
}, 240_000).unref();

const app = await electron.launch({ args: ['.'], env: { ...process.env, TESSERA_USER_DATA: userData, TESSERA_E2E: '1' } });
const page = await app.firstWindow();
await page.waitForTimeout(2500);
const inv = async (...a) => {
  const r = await page.evaluate((a) => window.tessera.invoke(...a), a);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};
let n = 0;
const shot = async (name, wait = 900) => {
  await page.waitForTimeout(wait);
  const file = join(out, `${String(++n).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  console.log(file);
};
const rail = (label) => page.getByRole('navigation', { name: 'Main' }).getByText(label, { exact: true });

// A library with the three sample packs in it, a collection, and a game to link into.
await shot('welcome');
await inv('library:create', join(root, 'My Library'), 'My Library');
await page.waitForTimeout(2500);
await inv('import:run', await inv('import:plan', await inv('import:samples'), false));
await page.waitForTimeout(8000);
const packs = (await inv('browse:packs', { scope: 'library', text: '', filters: {} }, 'name', 0, 10)).rows;
const arcade = packs.find((p) => p.name === 'Mini Arcade') ?? packs[0];
await inv('favourites:pack', arcade.id, true);
const collection = await inv('collections:create', 'For the platformer', { description: 'What the first level needs' });
await inv('collections:change', collection, { addPacks: [packs.find((p) => p.name.includes('Platformer'))?.id ?? packs[0].id] });
mkdirSync(join(root, 'Bunny Dash'), { recursive: true });
const game = await inv('projects:add', { ...(await inv('projects:probe', join(root, 'Bunny Dash'))), name: 'Bunny Dash' });
await inv('projects:copy', game.id, (await inv('pack:files', arcade.id)).slice(0, 8).map((f) => ({ packId: f.packId, ref: f.ref })));
await page.waitForTimeout(3000);

await rail('Home').click();
await shot('home', 1600);
await rail('Browse').click();
await shot('browse', 1800);
// A pack, from the row on Home, and one of its models in the viewer.
await rail('Home').click();
await page.waitForTimeout(1500);
await page.getByText(arcade.name, { exact: true }).first().click();
await page.waitForTimeout(2500);
await shot('pack');
await page.getByRole('tab', { name: /Files/ }).click().catch(() => undefined);
await page.waitForTimeout(1200);
await shot('pack-files');
await rail('Browse').click();
await page.waitForTimeout(1500);
await page.locator('[role="option"]').first().dblclick();
await shot('viewer', 3000);
await page.keyboard.press('Escape');
await page.waitForTimeout(800);
await rail('Collections').click();
await shot('collections', 1500);
await rail('Projects').click();
await shot('games', 1500);
await rail('Settings').click();
await shot('settings', 1500);
await page.getByText('AI agents', { exact: true }).first().click();
await shot('agents-settings', 1200);
await rail('Home').click();
await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'How to connect' }).first().click();
await shot('agents', 1500);
await app.close();
console.log(`\n${n} screenshots in ${out}`);
