import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { planImport } from '../src/main/import/plan';
import { runImport } from '../src/main/import/run';
import { LibraryIndex } from '../src/main/index/indexer';
import { LibraryQueries } from '../src/main/index/query';
import { createLibrary } from '../src/main/library/layout';
import { tempDir } from './helpers';
import { writeZip } from './zipfixture';

async function setup() {
  const root = join(tempDir(), 'lib');
  await createLibrary(root, 'lib');
  const downloads = tempDir('tessera-downloads-');
  const index = new LibraryIndex(':memory:');
  return { root, downloads, index, queries: new LibraryQueries(index.db) };
}

describe('planning an import', () => {
  it('makes one pack per archive and folder, and gathers loose files into one', async () => {
    const { downloads } = await setup();
    await writeZip(join(downloads, 'kenney_city-kit_2.0.zip'), { 'a.glb': 'x' });
    mkdirSync(join(downloads, 'Forest Pack'));
    writeFileSync(join(downloads, 'Forest Pack', 'tree.fbx'), 'x');
    writeFileSync(join(downloads, 'Forest Pack', '.DS_Store'), '');
    mkdirSync(join(downloads, 'loose'));
    writeFileSync(join(downloads, 'loose', 'a.png'), 'x');
    writeFileSync(join(downloads, 'loose', 'b.png'), 'x');
    const items = await planImport([join(downloads, 'kenney_city-kit_2.0.zip'), join(downloads, 'Forest Pack'), join(downloads, 'loose', 'a.png'), join(downloads, 'loose', 'b.png')]);
    expect(items.map((i) => [i.name, i.kind, i.files])).toEqual([
      ['City Kit', 'archive', 1],
      ['Forest Pack', 'folder', 1],
      ['Loose', 'files', 2],
    ]);
  });

  it('treats each archive and folder inside a folder of packs as its own pack', async () => {
    const { downloads } = await setup();
    await writeZip(join(downloads, 'one.zip'), { 'a.png': 'x' });
    await writeZip(join(downloads, 'two.zip'), { 'b.png': 'x' });
    expect((await planImport([downloads], true)).map((i) => i.name)).toEqual(['One', 'Two']);
    expect((await planImport([downloads])).map((i) => i.kind)).toEqual(['folder']);
  });
});

describe('running an import', () => {
  it('copies downloads untouched, reads their licence and files sure packs into the library', async () => {
    const { root, downloads, index, queries } = await setup();
    const kit = join(downloads, 'kenney_city-kit.zip');
    await writeZip(kit, { 'License.txt': 'www.kenney.nl  License: (Creative Commons Zero, CC0)', 'Models/car.glb': 'x' });
    mkdirSync(join(downloads, 'Mystery'));
    writeFileSync(join(downloads, 'Mystery', 'thing.png'), 'x');
    const items = await planImport([kit, join(downloads, 'Mystery')]);
    const progress: number[] = [];
    const result = await runImport(items, { root, index, skipInboxWhenSure: true, onProgress: (d, t) => progress.push(d / t) });
    expect(result.failed).toEqual([]);
    expect(result.added.map((a) => [a.name, a.status])).toEqual([
      ['City Kit', 'library'],
      ['Mystery', 'inbox'],
    ]);
    expect(progress.at(-1)).toBe(1);
    // The user's files are still where they were.
    expect(existsSync(kit)).toBe(true);
    const city = queries.pack(result.added[0]!.id)!;
    expect(city).toMatchObject({ source: 'kenney', licence: 'CC0-1.0', creator: 'Kenney', assetCount: 1 });
    expect(city.meta.licence.notes).toBe('Licence found in License.txt.');
    expect(readdirSync(join(root, 'packs', 'City Kit', 'original'))).toEqual(['kenney_city-kit.zip']);
    // The same download again is recognised.
    expect(queries.findDownload('kenney_city-kit.zip', items[0]!.size, false)).toBe('City Kit');
  });

  it('keeps everything in the Inbox when asked to', async () => {
    const { root, downloads, index } = await setup();
    await writeZip(join(downloads, 'kenney_x.zip'), { 'License.txt': 'kenney.nl CC0' });
    const result = await runImport(await planImport([join(downloads, 'kenney_x.zip')]), { root, index, skipInboxWhenSure: false, onProgress: () => undefined });
    expect(result.added[0]!.status).toBe('inbox');
  });

  it('removes a pack that failed half-way', async () => {
    const { root, downloads, index } = await setup();
    const items = await planImport([downloads]);
    items.push({ id: 'x', name: 'Gone', sources: [join(downloads, 'missing.zip')], kind: 'archive', size: 10, files: 1, duplicateOf: null });
    const result = await runImport(items.filter((i) => i.name === 'Gone'), { root, index, skipInboxWhenSure: true, onProgress: () => undefined });
    expect(result.failed.map((f) => f.name)).toEqual(['Gone']);
    expect(readdirSync(join(root, 'packs'))).toEqual([]);
  });
});
