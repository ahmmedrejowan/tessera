import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LibraryIndex } from '../src/main/index/indexer';
import { LibraryQueries } from '../src/main/index/query';
import { createCollection, deleteCollection, listCollections, readCollection, updateCollection, withItems, withoutItems, withPacks, withoutPacks } from '../src/main/library/collections';
import { createLibrary } from '../src/main/library/layout';
import { createPack } from '../src/main/library/packs';
import { tempDir } from './helpers';

describe('collections', () => {
  it('holds whole packs as well as single assets', async () => {
    const root = tempDir();
    await createLibrary(root, 'lib');
    const c = await createCollection(root, 'For the platformer', { items: [{ packId: 'p1', ref: 'original/a.glb' }], packs: ['p2'] });
    expect(c.packs).toEqual(['p2']);
    const withBoth = await updateCollection(root, c.id, (x) => withPacks(x, ['p3', 'p2']));
    expect(withBoth.packs).toEqual(['p2', 'p3']);
    expect(withBoth.items).toHaveLength(1);
    const fewer = await updateCollection(root, c.id, (x) => withoutPacks(x, ['p2']));
    expect(fewer.packs).toEqual(['p3']);
  });

  it('stores manual and smart collections in the library', async () => {
    const root = tempDir();
    await createLibrary(root, 'lib');
    const a = await createCollection(root, 'Tower defense', { items: [{ packId: 'p1', ref: 'original/a.glb' }] });
    const b = await createCollection(root, 'CC0 trees', { query: { text: 'tree', filters: { licence: ['CC0-1.0'] }, includeSupport: false, favourites: false } });
    expect(a.kind).toBe('manual');
    expect(b.kind).toBe('smart');
    expect((await listCollections(root)).map((c) => c.name)).toEqual(['CC0 trees', 'Tower defense']);
    await updateCollection(root, a.id, (c) => withItems(c, [{ packId: 'p1', ref: 'original/a.glb' }, { packId: 'p2', ref: 'original/b.png' }]));
    expect((await readCollection(root, a.id))!.items).toHaveLength(2);
    await updateCollection(root, a.id, (c) => withoutItems(c, [{ packId: 'p1', ref: 'original/a.glb' }]));
    expect((await readCollection(root, a.id))!.items).toEqual([{ packId: 'p2', ref: 'original/b.png' }]);
    await deleteCollection(root, b.id);
    expect(await listCollections(root)).toHaveLength(1);
  });

  it('shows a collection’s items in the order they were added, supporting files included', async () => {
    const root = tempDir();
    await createLibrary(root, 'lib');
    const pack = await createPack(root, 'Kit', { status: 'library' });
    mkdirSync(join(pack.dir, 'original', 'M'));
    for (const f of ['zebra.glb', 'apple.glb', 'wood.png']) writeFileSync(join(pack.dir, 'original', 'M', f), 'x');
    const index = new LibraryIndex(':memory:');
    await index.sync(root);
    const q = new LibraryQueries(index.db);
    const c = await createCollection(root, 'Picks', {
      items: [
        { packId: pack.meta.id, ref: 'original/M/zebra.glb' },
        { packId: pack.meta.id, ref: 'original/M/wood.png' },
        { packId: pack.meta.id, ref: 'original/M/apple.glb' },
        { packId: 'gone', ref: 'original/x.glb' },
      ],
    });
    index.setCollections(await listCollections(root));
    const page = q.assets({ scope: 'all', text: '', filters: {}, collectionId: c.id }, 'relevance', 0, 10);
    expect(page.rows.map((r) => r.name)).toEqual(['zebra.glb', 'wood.png', 'apple.glb']);
    expect(q.assets({ scope: 'all', text: '', filters: {}, collectionId: c.id }, 'name', 0, 10).rows.map((r) => r.name)).toEqual(['apple.glb', 'wood.png', 'zebra.glb']);
    expect(q.facets({ scope: 'all', text: '', filters: {}, collectionId: c.id }, 'assets').type.map((t) => t.value).sort()).toEqual(['model', 'texture']);
  });
});
