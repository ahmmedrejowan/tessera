import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { RenderJob, ThumbState } from '@shared/types';
import { LibraryIndex } from '../src/main/index/indexer';
import { LibraryQueries } from '../src/main/index/query';
import { createLibrary } from '../src/main/library/layout';
import { createPack } from '../src/main/library/packs';
import { plan, ThumbService } from '../src/main/thumbs/service';
import { assetKey } from '@shared/urls';
import { tempDir } from './helpers';

describe('thumbnail planning', () => {
  it.each([
    [{ ext: 'fbx', size: 10 }, 'model'],
    [{ ext: 'png', size: 20_000 }, 'direct'],
    [{ ext: 'png', size: 4_000_000 }, 'image'],
    [{ ext: 'tga', size: 10 }, 'image'],
    [{ ext: 'exr', size: 10 }, 'hdr'],
    [{ ext: 'ogg', size: 10 }, 'audio'],
    [{ ext: 'ttf', size: 10 }, 'font'],
    [{ ext: 'txt', size: 10 }, 'none'],
  ] as const)('%o → %s', (a, how) => {
    expect(plan(a)).toBe(how);
  });
});

async function setup() {
  const root = tempDir();
  await createLibrary(root, 'lib');
  const pack = await createPack(root, 'Kit', { status: 'library' });
  mkdirSync(join(pack.dir, 'original', 'M'));
  for (const n of ['a', 'b', 'c']) writeFileSync(join(pack.dir, 'original', 'M', `${n}.glb`), n);
  writeFileSync(join(pack.dir, 'original', 'M', 'wood.png'), 'x');
  const index = new LibraryIndex(':memory:');
  await index.sync(root);
  const queries = new LibraryQueries(index.db);
  const ids = queries.assets({ scope: 'all', text: '', filters: {}, includeSupport: true }, 'name', 0, 10).rows;
  return {
    queries,
    thumbDir: join(root, 'thumbs'),
    byName: (n: string) => {
      const r = ids.find((x) => x.name === n)!;
      return assetKey(r.packId, r.ref);
    },
  };
}

describe('thumbnail service', () => {
  it('draws what is missing, newest request first, and remembers results and failures', async () => {
    const { queries, thumbDir, byName } = await setup();
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const published: Record<string, ThumbState> = {};
    const svc = new ThumbService({
      queries: () => queries,
      thumbDir: () => thumbDir,
      render: async (job: RenderJob) => {
        order.push(job.url.split('/').pop()!);
        await gate;
        if (job.url.endsWith('c.glb')) throw new Error('broken model');
        expect(job.textures?.['wood.png']).toMatch(/wood\.png$/);
        return new Uint8Array([1, 2, 3]);
      },
      publish: (s) => Object.assign(published, s),
    });
    // Two requests fill both slots; the third waits and runs once one frees up.
    const first = await svc.get([byName('a.glb'), byName('b.glb')]);
    expect(Object.values(first)).toEqual(['pending', 'pending']);
    expect(await svc.get([byName('c.glb'), byName('wood.png')])).toMatchObject({ [byName('wood.png')]: 'direct' });
    release();
    await vi.waitFor(() => expect(Object.keys(published)).toHaveLength(3), { timeout: 2000 });
    expect(order).toEqual(['a.glb', 'b.glb', 'c.glb']);
    expect(published[byName('c.glb')]).toBe('failed');
    const again = await svc.get([byName('a.glb'), byName('c.glb')]);
    expect(again[byName('a.glb')]).toMatch(/^tessera:\/\/thumb\/[0-9a-f]+\.webp$/);
    expect(again[byName('c.glb')]).toBe('failed');
    expect(existsSync(thumbDir)).toBe(true);
  });
});
