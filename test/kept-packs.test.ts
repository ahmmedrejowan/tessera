import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PackMeta } from '@shared/pack';
import { LibraryIndex } from '../src/main/index/indexer';
import { LibraryQueries } from '../src/main/index/query';
import { createLibrary } from '../src/main/library/layout';
import { filesRootOf, listPacks, walkRootOf } from '../src/main/library/packs';
import { runImport } from '../src/main/import/run';
import { canKeep, keptRoot } from '../src/main/import/run';
import { planImport } from '../src/main/import/plan';
import { tempDir } from './helpers';

/** A folder of assets somewhere on the person's disk, nothing to do with any library. */
function theirFolder(): string {
  const dir = join(tempDir(), 'Their Art');
  mkdirSync(join(dir, 'Models'), { recursive: true });
  writeFileSync(join(dir, 'Models', 'tree.glb'), 'glb');
  writeFileSync(join(dir, 'Models', 'rock.glb'), 'glb');
  writeFileSync(join(dir, 'LICENSE.txt'), 'CC0 1.0 Universal');
  return dir;
}

async function libraryWithKeptPack() {
  const root = tempDir();
  await createLibrary(root, 'lib');
  const theirs = theirFolder();
  const index = new LibraryIndex(':memory:');
  const items = await planImport([theirs]);
  const result = await runImport(items, { root, index, skipInboxWhenSure: true, keep: true, onProgress: () => undefined });
  await index.sync(root);
  const queries = new LibraryQueries(index.db);
  return { root, theirs, index, queries, result };
}

describe('adding a pack without copying it', () => {
  it('reads the files where they are and writes nothing there', async () => {
    const { root, theirs, queries, result } = await libraryWithKeptPack();
    expect(result.failed).toEqual([]);
    const pack = queries.packs({ scope: 'all', text: '', filters: {} }, 'name', 0, 10).rows[0]!;
    expect(pack.keptWhere).toBe(theirs);
    expect(pack.away).toBe(false);

    // The files are indexed, under refs relative to their own folder rather than an `original/`.
    const refs = queries.packRefs(pack.id);
    expect(refs).toContain('Models/tree.glb');
    expect(refs.some((r) => r.startsWith('original/'))).toBe(false);

    // Their folder is exactly as it was: no pack.json, no licence folder, nothing of ours.
    const theirFiles = (await import('node:fs/promises')).readdir(theirs);
    expect((await theirFiles).sort()).toEqual(['LICENSE.txt', 'Models']);

    // And the library holds the record, with no copy of the files.
    const { packs } = await listPacks(root);
    expect(packs).toHaveLength(1);
    expect(existsSync(join(packs[0]!.dir, 'original'))).toBe(false);
    expect(existsSync(join(packs[0]!.dir, 'pack.json'))).toBe(true);
  });

  it('finds the licence in their folder, the same as any other pack', async () => {
    const { queries } = await libraryWithKeptPack();
    const pack = queries.packs({ scope: 'all', text: '', filters: {} }, 'name', 0, 10).rows[0]!;
    expect(pack.licence).toBe('CC0-1.0');
  });

  it('marks the pack as away when the folder goes, and keeps its files in the index', async () => {
    const { root, theirs, index, queries } = await libraryWithKeptPack();
    const before = queries.packs({ scope: 'all', text: '', filters: {} }, 'name', 0, 10).rows[0]!;
    expect(before.fileCount).toBeGreaterThan(0);

    await rm(theirs, { recursive: true, force: true });
    await index.sync(root);

    const after = queries.packs({ scope: 'all', text: '', filters: {} }, 'name', 0, 10).rows[0]!;
    // Away, but not emptied: unplugging a drive must not look like deleting a pack.
    expect(after.away).toBe(true);
    expect(after.fileCount).toBe(before.fileCount);
    expect(queries.packRefs(after.id)).toContain('Models/tree.glb');
  });

  it('is not away again once the folder comes back', async () => {
    const { root, theirs, index, queries } = await libraryWithKeptPack();
    await rm(theirs, { recursive: true, force: true });
    await index.sync(root);
    expect(queries.packs({ scope: 'all', text: '', filters: {} }, 'name', 0, 10).rows[0]!.away).toBe(true);

    mkdirSync(join(theirs, 'Models'), { recursive: true });
    writeFileSync(join(theirs, 'Models', 'tree.glb'), 'glb');
    await index.sync(root);
    expect(queries.packs({ scope: 'all', text: '', filters: {} }, 'name', 0, 10).rows[0]!.away).toBe(false);
  });
});

describe("where a pack's files are read from", () => {
  it('is the pack folder for an ordinary pack and their folder for a kept one', () => {
    const base = PackMeta.parse({ id: 'a'.repeat(10), name: 'P', addedAt: 'x', updatedAt: 'x' });
    expect(filesRootOf(base, '/lib/packs/P')).toBe('/lib/packs/P');
    expect(walkRootOf(base, '/lib/packs/P')).toBe(join('/lib/packs/P', 'original'));

    const kept = PackMeta.parse({ ...base, kept: { where: '/their/art', since: 'x', volume: null } });
    expect(filesRootOf(kept, '/lib/packs/P')).toBe('/their/art');
    expect(walkRootOf(kept, '/lib/packs/P')).toBe('/their/art');
  });
});

describe('what can be kept where it lies', () => {
  it('a folder can, an archive or loose files cannot', async () => {
    const dir = theirFolder();
    const [folder] = await planImport([dir]);
    expect(canKeep(folder!)).toBe(true);
    expect(keptRoot(folder!)).toBe(dir);

    const [loose] = await planImport([join(dir, 'LICENSE.txt')]);
    expect(canKeep(loose!)).toBe(false);
  });
});

describe('the record still travels with the library', () => {
  it('pack.json holds the licence and where the files are', async () => {
    const { root, theirs } = await libraryWithKeptPack();
    const { packs } = await listPacks(root);
    const raw = JSON.parse(await readFile(join(packs[0]!.dir, 'pack.json'), 'utf8')) as PackMeta;
    expect(raw.kept?.where).toBe(theirs);
    expect(raw.licence.id).toBe('CC0-1.0');
  });
});
