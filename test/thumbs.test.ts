import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { RenderJob, ThumbState } from '@shared/types';
import { LibraryIndex } from '../src/main/index/indexer';
import { LibraryQueries } from '../src/main/index/query';
import { createLibrary } from '../src/main/library/layout';
import { createPack } from '../src/main/library/packs';
import { PreviewBuilder } from '../src/main/thumbs/build';
import type { JobHandle } from '../src/main/jobs';
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
    // The first two run side by side, in either order; the third waits for a free slot.
    expect(order.slice(0, 2).sort()).toEqual(['a.glb', 'b.glb']);
    expect(order[2]).toBe('c.glb');
    expect(published[byName('c.glb')]).toBe('failed');
    const again = await svc.get([byName('a.glb'), byName('c.glb')]);
    expect(again[byName('a.glb')]).toMatch(/^tessera:\/\/thumb\/[0-9a-f]{8}\.[a-z]+\.[0-9a-f]+\.webp$/);
    expect(again[byName('c.glb')]).toBe('failed');
    expect(existsSync(thumbDir)).toBe(true);
  });
});

describe('a job the drawing window keeps throwing out', () => {
  it('is written off once the restarts run out, so the queue can empty', async () => {
    const { queries, thumbDir, byName } = await setup();
    let attempts = 0;
    const published: Record<string, ThumbState> = {};
    const svc = new ThumbService({
      queries: () => queries,
      thumbDir: () => thumbDir,
      // Always recycled: this job never meets its file, the way one queued behind a wedged
      // model never does.
      render: async () => {
        attempts++;
        const e = new Error('recycled');
        e.name = 'RecycledError';
        throw e;
      },
      publish: (s) => Object.assign(published, s),
    });
    await svc.get([byName('a.glb')]);
    await vi.waitFor(() => expect(published[byName('a.glb')]).toBe('failed'), { timeout: 2000 });
    // Tried on a fresh window a few times, then marked rather than dropped. Left unmarked it
    // would be asked for again by the next grid refresh, for ever.
    expect(attempts).toBe(4);
    expect(existsSync(join(thumbDir, `${byName('a.glb').slice(0, 8)}`))).toBe(false);
    const again = await svc.get([byName('a.glb')]);
    expect(again[byName('a.glb')]).toBe('failed');
    expect(attempts).toBe(4);
  });
});

describe('drawing previews on purpose', () => {
  it('goes through the library and stops when asked', async () => {
    const { queries, thumbDir } = await setup();
    const drawn: string[] = [];
    const svc = new ThumbService({
      queries: () => queries,
      thumbDir: () => thumbDir,
      render: async (job: RenderJob) => {
        drawn.push(job.url.split('/').pop()!);
        return new Uint8Array([1, 2, 3]);
      },
      publish: () => undefined,
    });
    const builder = new PreviewBuilder({ queries: () => queries, thumbs: svc });
    const job = { update: () => undefined } as unknown as JobHandle;
    let release!: () => void;

    // No packs named: every pack in the library.
    const all = await builder.run(null, job);
    expect(all.stopped).toBe(false);
    expect(drawn.sort()).toEqual(['a.glb', 'b.glb', 'c.glb']);
    expect(builder.busy).toBe(false);

    // Asked again, there is nothing left to draw: what exists is never drawn twice.
    drawn.length = 0;
    await builder.run(null, job);
    expect(drawn).toEqual([]);

    // Asked to stop while it is waiting for the queue, it gives up rather than seeing it through.
    const { queries: q2, thumbDir: dir2 } = await setup();
    const held = new Promise<void>((r) => (release = r));
    const slow = new ThumbService({
      queries: () => q2,
      thumbDir: () => dir2,
      render: async () => {
        await held;
        return new Uint8Array([1]);
      },
      publish: () => undefined,
    });
    const second = new PreviewBuilder({ queries: () => q2, thumbs: slow });
    const running = second.run(null, job);
    await vi.waitFor(() => expect(slow.pending).toBeGreaterThan(0));
    second.stop();
    expect((await running).stopped).toBe(true);
    release();
  });
});
