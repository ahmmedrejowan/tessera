import { startApp, withSamples } from './harness.mjs';

export const name = 'Finding things, and looking at them';

export async function run(ok) {
  const t = await startApp();
  try {
    await withSamples(t);
    await t.page.locator('nav').getByText('Browse', { exact: true }).click();
    await t.page.waitForTimeout(1500);

    const found = await t.call('browse:assets', { scope: 'library', text: 'arcade', filters: {} }, 'relevance', 0, 20);
    ok('search finds files by a word in their path', found.total > 0, `${found.total} files`);
    const models = await t.call('browse:assets', { scope: 'library', text: '', filters: { type: ['model'] } }, 'name', 0, 5);
    ok('a filter narrows to one kind', models.total === 20, `${models.total} models`);
    const facets = await t.call('browse:facets', { scope: 'library', text: '', filters: {} }, 'assets');
    ok('the facets say what there is to filter by', facets.type.length >= 2 && facets.licence.length >= 1);

    // The viewer, from the grid, with the keyboard.
    await t.page.locator('[role="option"]').first().dblclick();
    await t.page.waitForTimeout(2500);
    ok('a file opens in the viewer', await t.page.getByText('THIS FILE', { exact: false }).first().isVisible());
    await t.page.keyboard.press('ArrowRight');
    await t.page.waitForTimeout(800);
    await t.page.keyboard.press('Escape');
    await t.page.waitForTimeout(800);
    ok('and closes again with Escape', await t.page.getByText('THIS FILE', { exact: false }).first().isVisible() === false);
    ok('nothing went wrong in the window', t.errors.length === 0, t.errors.join(' | '));
  } finally {
    await t.stop();
  }
}
