// Launch the built app with a throwaway data folder and save screenshots of the main screens.
//   node scripts/shoot.mjs [outDir] [--dark] [--size=1360x860]
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron } from 'playwright';

const args = process.argv.slice(2);
const out = resolve(args.find((a) => !a.startsWith('--')) ?? 'docs/shots');
const dark = args.includes('--dark');
const [w, h] = (args.find((a) => a.startsWith('--size='))?.slice(7) ?? '1360x860').split('x').map(Number);
const userData = process.env.TESSERA_USER_DATA ?? mkdtempSync(join(tmpdir(), 'tessera-shoot-'));
mkdirSync(out, { recursive: true });
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ theme: dark ? 'dark' : 'light', ...(process.env.TESSERA_LIBRARY ? { libraryPath: process.env.TESSERA_LIBRARY } : {}) }));
writeFileSync(join(userData, 'window.json'), JSON.stringify({ x: 40, y: 40, width: w, height: h, maximized: false }));

const app = await electron.launch({ args: ['.'], env: { ...process.env, TESSERA_USER_DATA: userData } });
const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(800);
const routes = (process.env.SHOOT_ROUTES ?? 'home,browse,collections,projects,inbox,settings').split(',');
for (const r of routes) {
  const label = r[0].toUpperCase() + r.slice(1);
  const link = page.getByRole('navigation', { name: 'Main' }).getByText(label, { exact: true });
  if (await link.count()) await link.first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, `${r}${dark ? '-dark' : ''}.png`) });
}
await app.close();
console.log('shots in', out);
