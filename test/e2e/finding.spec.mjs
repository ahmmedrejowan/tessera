import { settled, startApp, withSamples } from './harness.mjs';

export const name = 'Finding things, and looking at them';

export async function run(ok) {
  const t = await startApp();
  try {
    await withSamples(t);
    // Adding nine hundred files leaves the app busy for a moment, and a busy window is a window
    // that cannot be clicked. Wait for it to be quiet rather than racing it.
    await settled(t);
    await t.page.locator('nav').getByText('Browse', { exact: true }).click({ timeout: 60_000 });
    await t.page.waitForTimeout(1500);

    const found = await t.call('browse:assets', { scope: 'library', text: 'arcade', filters: {} }, 'relevance', 0, 20);
    ok('search finds files by a word in their path', found.total > 0, `${found.total} files`);
    const models = await t.call('browse:assets', { scope: 'library', text: '', filters: { type: ['model'] } }, 'name', 0, 5);
    ok('a filter narrows to one kind', models.total === 20, `${models.total} models`);
    const facets = await t.call('browse:facets', { scope: 'library', text: '', filters: {} }, 'assets');
    ok('the facets say what there is to filter by', facets.type.length >= 2 && facets.licence.length >= 1);

    // The viewer, from the grid, with the keyboard. A cold machine can take a while to draw the
    // grid, so it is waited for rather than assumed.
    const tile = t.page.locator('[role="option"]').first();
    await tile.waitFor({ state: 'visible', timeout: 60000 });
    await tile.dblclick();
    await t.page.getByText('THIS FILE', { exact: false }).first().waitFor({ state: 'visible', timeout: 60000 });
    ok('a file opens in the viewer', true);
    await t.page.keyboard.press('ArrowRight');
    await t.page.waitForTimeout(800);
    await t.page.keyboard.press('Escape');
    await t.page.getByText('THIS FILE', { exact: false }).first().waitFor({ state: 'hidden', timeout: 20000 });
    ok('and closes again with Escape', true);
    ok('nothing went wrong in the window', t.errors.length === 0, t.errors.join(' | '));
  } finally {
    await t.stop();
  }
}
