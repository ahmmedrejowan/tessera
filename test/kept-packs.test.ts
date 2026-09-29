import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
import { running, type Running } from './library';

/** A library running the way the app runs it, with one pack indexed where it lies. */
async function keptInApp(): Promise<{ app: Running; theirs: string; packId: string }> {
  const app = await running([]);
  const theirs = theirFolder();
  const items = await app.library.planImport([theirs], false);
  const result = await app.library.import(items, true, false, false, true);
  await app.library.sync();
  return { app, theirs, packId: result.added[0]!.id };
}

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

    // Their folder is exactly as it was: no pack.json, no license folder, nothing of ours.
    const theirFiles = (await import('node:fs/promises')).readdir(theirs);
    expect((await theirFiles).sort()).toEqual(['LICENSE.txt', 'Models']);

    // And the library holds the record, with no copy of the files.
    const { packs } = await listPacks(root);
    expect(packs).toHaveLength(1);
    expect(existsSync(join(packs[0]!.dir, 'original'))).toBe(false);
    expect(existsSync(join(packs[0]!.dir, 'pack.json'))).toBe(true);
  });

  it('finds the license in their folder, the same as any other pack', async () => {
    const { queries } = await libraryWithKeptPack();
    const pack = queries.packs({ scope: 'all', text: '', filters: {} }, 'name', 0, 10).rows[0]!;
    expect(pack.license).toBe('CC0-1.0');
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
  it('pack.json holds the license and where the files are', async () => {
    const { root, theirs } = await libraryWithKeptPack();
    const { packs } = await listPacks(root);
    const raw = JSON.parse(await readFile(join(packs[0]!.dir, 'pack.json'), 'utf8')) as PackMeta;
    expect(raw.kept?.where).toBe(theirs);
    expect(raw.license.id).toBe('CC0-1.0');
  });
});

describe('the ways out of indexing in place', () => {
  it('finds the folder again, and refuses one that is plainly not it', async () => {
    const { app, theirs, packId } = await keptInApp();
    rmSync(theirs, { recursive: true, force: true });
    await app.library.sync();
    expect(app.library.require().queries.pack(packId)?.away).toBe(true);

    // Somewhere else entirely: refused, because accepting it would leave the license on record
    // describing files that are not the ones it was recorded against.
    const elsewhere = tempDir();
    mkdirSync(join(elsewhere, 'Models'), { recursive: true });
    writeFileSync(join(elsewhere, 'Models', 'unrelated.glb'), 'no');
    await expect(app.library.findPackAgain(packId, elsewhere)).rejects.toThrow(/holds/);

    // The same files somewhere new: taken.
    const moved = theirFolder();
    const found = await app.library.findPackAgain(packId, moved);
    expect(found.matched).toBe(found.of);
    expect(app.library.require().queries.pack(packId)?.away).toBe(false);
    expect(app.library.require().queries.pack(packId)?.keptWhere).toBe(moved);
  });

  it('takes a pack into the library and leaves their folder alone', async () => {
    const { app, theirs, packId } = await keptInApp();
    await app.library.takePackIn(packId);

    const row = app.library.require().queries.pack(packId)!;
    expect(row.keptWhere).toBeNull();
    expect(row.fileCount).toBeGreaterThan(0);
    // Copied in, under original/ like any other pack, and their folder untouched.
    expect(app.library.require().queries.packRefs(packId).every((r) => r.startsWith('original/'))).toBe(true);
    expect(existsSync(join(theirs, 'Models', 'tree.glb'))).toBe(true);

    // And it is an ordinary pack now, so asking again is a plain refusal rather than a mess.
    await expect(app.library.takePackIn(packId)).rejects.toThrow(/already/);
  });

  it('will not put files into somebody else’s folder', async () => {
    const { app, packId } = await keptInApp();
    const loose = join(tempDir(), 'extra.glb');
    writeFileSync(loose, 'x');
    await expect(app.library.addFilesToPack(packId, [loose])).rejects.toThrow(/never writes/);
  });

  it('will not delete their files, and says so rather than half doing it', async () => {
    const { app, theirs, packId } = await keptInApp();
    const out = await app.library.removeFiles([{ packId, ref: 'Models/tree.glb' }]);
    expect(out.removed).toBe(0);
    expect(out.failed).toBe(1);
    expect(existsSync(join(theirs, 'Models', 'tree.glb'))).toBe(true);
  });
});
