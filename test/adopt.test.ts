import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LibraryIndex } from '../src/main/index/indexer';
import { LibraryQueries } from '../src/main/index/query';
import { createLibrary } from '../src/main/library/layout';
import { createPack } from '../src/main/library/packs';
import { adoptEntries, scanForAdoption } from '../src/main/projects/adopt';
import { readManifest, removeFromProject, writeAdopted } from '../src/main/projects/copy';
import type { CopySource } from '../src/main/projects/copy';
import type { Project } from '@shared/project';
import { tempDir } from './helpers';

const TREE = 'the bytes of a tree model, whatever they are';
const ROCK = 'quite different bytes, for a rock';

async function setup() {
  const root = tempDir();
  await createLibrary(root, 'lib');
  const pack = await createPack(root, 'Nature Kit', { status: 'library', license: { id: 'CC0-1.0', attribution: null, proof: [], notes: '' } });
  mkdirSync(join(pack.dir, 'original', 'Models'), { recursive: true });
  writeFileSync(join(pack.dir, 'original', 'Models', 'tree.glb'), TREE);
  writeFileSync(join(pack.dir, 'original', 'Models', 'rock.glb'), ROCK);
  const index = new LibraryIndex(':memory:');
  await index.sync(root);
  const queries = new LibraryQueries(index.db);

  // A game that already has one of those files, under its own name, in its own folder.
  const game = tempDir();
  mkdirSync(join(game, 'Assets', 'Art', 'Nature'), { recursive: true });
  writeFileSync(join(game, 'Assets', 'Art', 'Nature', 'big-tree.glb'), TREE);
  writeFileSync(join(game, 'Assets', 'Art', 'Nature', 'something-else.glb'), 'nothing like either of them');

  const project: Project = {
    id: 'p1',
    name: 'My Game',
    path: game,
    engine: 'unity',
    engineVersion: null,
    target: 'Assets/ThirdParty',
    creditsFile: 'CREDITS.md',
    addedAt: new Date().toISOString(),
  };
  const src: CopySource = {
    libraryId: 'lib1',
    libraryName: 'Lib',
    packDir: () => pack.dir,
    pack: () => ({ meta: queries.pack(pack.meta.id)!.meta, folder: pack.folder }),
    variants: (packId, ref) => queries.variantsOf(packId, ref),
    packRefs: (packId) => queries.packRefs(packId),
    hashOf: (packId, ref) => queries.hashOf(packId, ref),
  };
  return { root, pack, index, queries, game, project, src };
}

describe('finding assets a game already has', () => {
  it('matches by content, not by name, and leaves everything alone', async () => {
    const { game, project, src, queries } = await setup();
    const scan = await scanForAdoption(project.path, 'Assets/Art', { src, bySize: (size) => queries.bySize(size) });

    // Renamed, in a folder of their own, and still recognized.
    expect(scan.matches).toHaveLength(1);
    expect(scan.matches[0]!.path).toBe('Assets/Art/Nature/big-tree.glb');
    expect(scan.matches[0]!.ref).toBe('original/Models/tree.glb');
    expect(scan.looked).toBe(2);
    expect(scan.packs[0]!.files).toBe(1);

    // A file that is not theirs is not claimed, however plausible its name.
    expect(scan.matches.some((m) => m.path.includes('something-else'))).toBe(false);

    // Reading is all it did: their file is untouched and nothing was written.
    expect(await readFile(join(game, 'Assets', 'Art', 'Nature', 'big-tree.glb'), 'utf8')).toBe(TREE);
    expect(existsSync(join(game, '.tessera'))).toBe(false);
  });

  it('records the paths the game already uses, without copying', async () => {
    const { game, project, src, queries } = await setup();
    const scan = await scanForAdoption(project.path, 'Assets/Art', { src, bySize: (size) => queries.bySize(size) });
    const entries = adoptEntries(project, scan.matches, src, []);
    expect(await writeAdopted(project, src.libraryId, entries)).toBe(1);

    const manifest = await readManifest(game, src.libraryId);
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0]!.files).toEqual(['Assets/Art/Nature/big-tree.glb']);
    expect(manifest.entries[0]!.adopted).toBe(true);
    expect(manifest.entries[0]!.license).toBe('CC0-1.0');
    // Nothing landed in the target folder: that is the whole point.
    expect(existsSync(join(game, 'Assets', 'ThirdParty'))).toBe(false);
  });

  it('never deletes a file it only recognized', async () => {
    const { game, project, src, queries } = await setup();
    const scan = await scanForAdoption(project.path, 'Assets/Art', { src, bySize: (size) => queries.bySize(size) });
    await writeAdopted(project, src.libraryId, adoptEntries(project, scan.matches, src, []));

    const m = scan.matches[0]!;
    await removeFromProject(project, src.libraryId, [{ packId: m.packId, ref: m.ref }]);

    // The record is gone and their file is exactly where it was.
    expect((await readManifest(game, src.libraryId)).entries).toHaveLength(0);
    expect(await readFile(join(game, 'Assets', 'Art', 'Nature', 'big-tree.glb'), 'utf8')).toBe(TREE);
  });

  it('does not adopt over an asset that was copied in', async () => {
    const { project, src, queries } = await setup();
    const scan = await scanForAdoption(project.path, 'Assets/Art', { src, bySize: (size) => queries.bySize(size) });
    const m = scan.matches[0]!;
    // Already recorded from a copy: that entry knows files Tessera wrote and can take them back
    // out, so replacing it with one pointing at their own file would arm a delete.
    const existing = [{ packId: m.packId, ref: m.ref, files: ['Assets/ThirdParty/Nature Kit/Models/tree.glb'] }] as never;
    expect(adoptEntries(project, scan.matches, src, existing)).toEqual([]);
  });
});

describe('when matching by size stops narrowing anything', () => {
  it('gives up rather than reading the whole library, and says it did', async () => {
    // Matching is by size first and content second, which is nearly free when sizes vary the way
    // real assets do. When they do not, the size stops narrowing and every candidate has to be
    // read out of its archive and hashed. Measured on a library of 168,000 same-sized files: four
    // minutes, on the main process, with no way to stop it and no sign anything was wrong.
    const { game, project, src } = await setup();
    writeFileSync(join(game, 'Assets', 'Art', 'theirs.png'), 'x'.repeat(64));

    // Every library asset the same size as that file, and far more of them than the budget.
    let reads = 0;
    const many = Array.from({ length: 60_000 }, (_, i) => ({ packId: 'p', packName: 'Pack', ref: `original/f${i}.png`, size: 64 }) as never);
    const scan = await scanForAdoption(project.path, 'Assets/Art', {
      src: {
        ...src,
        packDir: () => {
          reads++;
          return '/nowhere-at-all';
        },
      },
      bySize: () => many,
    });

    expect(scan.stoppedEarly).toBe(true);
    // It stopped well short of the sixty thousand it was offered.
    expect(reads).toBeLessThan(30_000);
  });
});
