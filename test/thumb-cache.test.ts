import { mkdirSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clearFor, evictOver, previewCost } from '../src/main/thumbs/cache';
import { tempDir } from './helpers';

/** A folder of previews, named the way the service names them. */
function folder(files: { pack: string; kind: string; bytes: number; fail?: boolean }[]) {
  const dir = join(tempDir(), 'thumbs');
  mkdirSync(dir, { recursive: true });
  files.forEach((f, i) => {
    const name = `${f.pack}.${f.kind}.${String(i).padStart(20, '0')}.${f.fail ? 'fail' : 'webp'}`;
    writeFileSync(join(dir, name), Buffer.alloc(f.bytes));
  });
  return dir;
}

describe('what previews cost, and what goes when there is too much', () => {
  it('adds up by kind and by pack, and counts what failed on its own', async () => {
    const dir = folder([
      { pack: 'aaaaaaaa', kind: 'model', bytes: 1000 },
      { pack: 'aaaaaaaa', kind: 'model', bytes: 2000 },
      { pack: 'bbbbbbbb', kind: 'image', bytes: 500 },
      { pack: 'bbbbbbbb', kind: 'audio', bytes: 100, fail: true },
    ]);
    const cost = await previewCost(dir);
    expect(cost.byKind.model).toEqual({ bytes: 3000, count: 2 });
    expect(cost.byKind.image).toEqual({ bytes: 500, count: 1 });
    expect(cost.byPack.aaaaaaaa!.bytes).toBe(3000);
    expect(cost.bytes).toBe(3500);
    expect(cost.failed).toBe(1);
  });

  it('lets go of the packs nobody reaches for, and keeps the ones they do', async () => {
    const dir = folder([
      { pack: 'aaaa0001', kind: 'model', bytes: 1000 },
      { pack: 'bbbb0002', kind: 'model', bytes: 1000 },
      { pack: 'bbbb0002', kind: 'model', bytes: 1000 },
    ]);
    const score = (pack: string) => (pack === 'aaaa0001' ? 100 : 0);
    const gone = await evictOver(dir, 1200, score);
    expect(gone.removed).toBe(2);
    const left = await previewCost(dir);
    expect(Object.keys(left.byPack)).toEqual(['aaaa0001']);
  });

  it('counts what an older version left behind, and lets go of it first', async () => {
    const dir = folder([{ pack: 'aaaaaaaa', kind: 'model', bytes: 1000 }]);
    // The shape previews had before: a bare hash, which nothing asks for any more.
    writeFileSync(join(dir, 'd4fc90ab1234567890abcdef.webp'), Buffer.alloc(4000));
    const cost = await previewCost(dir);
    expect(cost.stale).toEqual({ bytes: 4000, count: 1 });
    // Not counted as a model: it is not anything any more.
    expect(cost.byKind.model).toEqual({ bytes: 1000, count: 1 });
    expect(cost.bytes).toBe(1000);

    const gone = await evictOver(dir, 2000, () => 5);
    expect(gone.removed).toBe(1);
    expect((await previewCost(dir)).stale.count).toBe(0);
    expect((await previewCost(dir)).byKind.model).toEqual({ bytes: 1000, count: 1 });
  });

  it('does nothing when it is under the limit, or when there is no limit', async () => {
    const dir = folder([{ pack: 'aaaaaaaa', kind: 'model', bytes: 1000 }]);
    expect((await evictOver(dir, 5000, () => 0)).removed).toBe(0);
    expect((await evictOver(dir, 0, () => 0)).removed).toBe(0);
  });

  it('clears one pack, or only what failed', async () => {
    const dir = folder([
      { pack: 'aaaaaaaa', kind: 'model', bytes: 10 },
      { pack: 'bbbbbbbb', kind: 'model', bytes: 10 },
      { pack: 'bbbbbbbb', kind: 'image', bytes: 10, fail: true },
    ]);
    expect(await clearFor(dir, { packs: ['aaaaaaaa-1111-2222-3333-444444444444'] })).toBe(1);
    expect((await previewCost(dir)).byPack.aaaaaaaa).toBeUndefined();
    expect(await clearFor(dir, { failedOnly: true })).toBe(1);
    expect((await previewCost(dir)).failed).toBe(0);
    expect(existsSync(dir)).toBe(true);
  });
});
