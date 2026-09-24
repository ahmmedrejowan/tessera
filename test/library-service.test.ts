/**
 * The spine of the app: a library on disk, read into an index, changed through one service.
 *
 * Every test here works on a real folder and checks both sides of a change: what the library says
 * afterwards, and what is actually on disk. The two have to agree, because the folder is the truth
 * and the index is only a way of asking it questions quickly.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => import('./fake-electron'));

import { Jobs } from '../src/main/jobs';
import { LibraryService } from '../src/main/libraryService';
import { tempDir } from './helpers';
import { PIXEL } from './library';
import { writeZip } from './zipfixture';

/** A library with one pack already in it, opened and read. */
async function opened(packs: Record<string, Record<string, string | Buffer>> = { 'Mini Arcade': { 'Models/arcade.obj': 'o arcade\n' } }) {
  const dataDir = tempDir();
  const root = join(tempDir(), 'Library');
  const changes: number[] = [];
  const library = new LibraryService({
    dataDir,
    jobs: new Jobs(() => undefined),
    onState: () => undefined,
    onIndexChanged: () => void changes.push(1),
    siteRules: () => [],
    binKeepDays: () => 30,
    watchFiles: false,
  });
  await library.create(root, 'Spine');

  for (const [name, files] of Object.entries(packs)) {
    const dir = join(root, 'packs', name);
    for (const [path, body] of Object.entries(files)) {
      const file = join(dir, 'original', ...path.split('/'));
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, body);
    }
    mkdirSync(join(dir, 'licence'), { recursive: true });
    writeFileSync(
      join(dir, 'pack.json'),
      JSON.stringify({
        format: 1,
        id: `id-${name.toLowerCase().replace(/\W+/g, '-')}`,
        name,
        status: 'library',
        licence: { id: 'CC0-1.0', attribution: null, proof: [], notes: '' },
        source: { site: null, name: 'Test', url: null, creator: null, creatorUrl: null },
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    );
  }
  await library.sync();
  await library.sync();
  return { library, root, dataDir, changes, close: () => library.close() };
}

const only = (library: LibraryService) => library.require().queries.packs({ scope: 'all', text: '', filters: {} }, 'added', 0, 10).rows[0]!;

describe('opening a library', () => {
  it('makes one where there was nothing, and says it is ready', async () => {
    const { library, root, close } = await opened({});
    expect(library.getState().status).toBe('ready');
    expect(existsSync(join(root, 'tessera-library.json'))).toBe(true);
    expect(existsSync(join(root, 'packs'))).toBe(true);
    close();
  });

  it('says what a folder is before opening it', async () => {
    const { library, root, close } = await opened();
    expect(await library.inspect(root)).toBe('library');
    expect(await library.inspect(tempDir())).toBe('empty');
    expect(await library.inspect(join(tempDir(), 'not-there'))).toBe('missing');
    close();
  });

  it('refuses to answer questions once it is closed', async () => {
    const { library, close } = await opened();
    close();
    expect(() => library.require()).toThrow(/No library/);
    expect(library.getState().status).not.toBe('ready');
  });

  it('renames itself, on disk as well as in the window', async () => {
    const { library, root, close } = await opened();
    await library.rename('A better name');
    expect(JSON.parse(readFileSync(join(root, 'tessera-library.json'), 'utf8')).name).toBe('A better name');
    close();
  });

  it('reads every pack again from scratch when asked', async () => {
    const { library, close } = await opened();
    const before = library.require().queries.stats().packs;
    await library.reindex();
    expect(library.require().queries.stats().packs).toBe(before);
    close();
  });
});

describe('reading what a pack says about itself', () => {
  it('hands back its record, what it detected, and what it suggests', async () => {
    const { library, close } = await opened();
    const id = only(library).id;
    expect((await library.packRecord(id)).meta.name).toBe('Mini Arcade');
    expect(await library.detect(id)).toBeTruthy();
    expect(Array.isArray(await library.partLicences(id))).toBe(true);
    expect(await library.details(id)).toHaveProperty('suggestions');
    expect(Array.isArray(await library.packFolders(id))).toBe(true);
    close();
  });

  it('refuses over a pack that is not there', async () => {
    const { library, close } = await opened();
    await expect(library.packRecord('nope')).rejects.toThrow();
    await expect(library.detect('nope')).rejects.toThrow();
    close();
  });

  it('edits what it says, and keeps the change on disk', async () => {
    const { library, root, close } = await opened();
    const id = only(library).id;
    await library.editPack(id, { name: 'Arcade Deluxe', genres: ['arcade'], tags: ['retro'] });

    const onDisk = JSON.parse(readFileSync(join(root, 'packs', 'Mini Arcade', 'pack.json'), 'utf8')) as { name: string; genres: string[] };
    expect(onDisk.name).toBe('Arcade Deluxe');
    expect(onDisk.genres).toEqual(['arcade']);
    expect(only(library).name).toBe('Arcade Deluxe');
    close();
  });

  it('keeps a note about the licence with the pack', async () => {
    const { library, root, close } = await opened();
    const id = only(library).id;
    await library.addLicenceNote(id, 'Bought in a bundle, receipt in licence/.');
    expect(JSON.parse(readFileSync(join(root, 'packs', 'Mini Arcade', 'pack.json'), 'utf8')).licence.notes).toContain('bundle');
    close();
  });
});

describe('proof that a pack is what it says', () => {
  it('lists the licence folder, takes files into it, and finds one by name', async () => {
    const { library, root, close } = await opened();
    const id = only(library).id;
    const from = tempDir();
    writeFileSync(join(from, 'receipt.txt'), 'paid for it');

    expect(await library.proofFiles(id)).toEqual([]);
    expect(await library.addProof(id, [join(from, 'receipt.txt')])).toBe(1);

    const files = await library.proofFiles(id);
    expect(files.map((f) => f.name)).toContain('receipt.txt');
    expect(existsSync(join(root, 'packs', 'Mini Arcade', 'licence', 'receipt.txt'))).toBe(true);
    expect(await library.proofPath(id, 'receipt.txt')).toContain('receipt.txt');
    close();
  });

  it('will not hand out a path outside the pack own licence folder', async () => {
    const { library, close } = await opened();
    await expect(library.proofPath(only(library).id, '../../pack.json')).rejects.toThrow();
    close();
  });
});

describe('putting more into a pack', () => {
  it('adds files where asked and counts what went in', async () => {
    const { library, root, close } = await opened();
    const id = only(library).id;
    const from = tempDir();
    writeFileSync(join(from, 'extra.obj'), 'o extra\n');

    const added = await library.addFilesToPack(id, [join(from, 'extra.obj')], 'Models');
    expect(added.added).toBe(1);
    expect(existsSync(join(root, 'packs', 'Mini Arcade', 'original', 'Models', 'extra.obj'))).toBe(true);

    await library.sync();
    expect(library.require().queries.packFiles(id).some((f) => f.ref.endsWith('Models/extra.obj'))).toBe(true);
    close();
  });

  it('numbers the second file of the same name rather than replacing the first', async () => {
    const { library, close } = await opened();
    const id = only(library).id;
    const from = tempDir();
    writeFileSync(join(from, 'twice.obj'), 'first');
    await library.addFilesToPack(id, [join(from, 'twice.obj')]);
    writeFileSync(join(from, 'twice.obj'), 'second');
    const second = await library.addFilesToPack(id, [join(from, 'twice.obj')]);
    expect(second.names[0]).not.toBe('twice.obj');
    close();
  });
});

describe('the bin', () => {
  it('takes a whole pack, lists it, and puts it back where it was', async () => {
    const { library, root, close } = await opened();
    const id = only(library).id;

    await library.removePack(id);
    await library.sync();
    expect(library.require().queries.pack(id)).toBeNull();
    expect(existsSync(join(root, 'packs', 'Mini Arcade'))).toBe(false);

    const waiting = await library.bin();
    expect(waiting.map((e) => e.shown)).toContain('Mini Arcade');

    await library.restoreFromBin(waiting[0]!.id);
    await library.sync();
    expect(existsSync(join(root, 'packs', 'Mini Arcade'))).toBe(true);
    expect(library.require().queries.pack(id)).toBeTruthy();
    close();
  });

  it('takes single files out of a pack, and puts them back', async () => {
    const { library, root, close } = await opened();
    const id = only(library).id;

    const gone = await library.removeFiles([{ packId: id, ref: 'original/Models/arcade.obj' }]);
    expect(gone.removed).toBe(1);
    expect(existsSync(join(root, 'packs', 'Mini Arcade', 'original', 'Models', 'arcade.obj'))).toBe(false);

    const waiting = await library.bin();
    await library.restoreFromBin(waiting[0]!.id);
    expect(existsSync(join(root, 'packs', 'Mini Arcade', 'original', 'Models', 'arcade.obj'))).toBe(true);
    close();
  });

  it('cannot take a file out of an archive on its own, and says so', async () => {
    const dataDir = tempDir();
    const root = join(tempDir(), 'Library');
    const library = new LibraryService({ dataDir, jobs: new Jobs(() => undefined), onState: () => undefined, onIndexChanged: () => undefined, siteRules: () => [], binKeepDays: () => 30, watchFiles: false });
    await library.create(root, 'Zipped');
    const dir = join(root, 'packs', 'Zipped Pack');
    mkdirSync(join(dir, 'original'), { recursive: true });
    mkdirSync(join(dir, 'licence'), { recursive: true });
    writeZip(join(dir, 'original', 'kit.zip'), { 'Models/thing.obj': 'o thing\n' });
    writeFileSync(join(dir, 'pack.json'), JSON.stringify({ format: 1, id: 'id-zipped', name: 'Zipped Pack', status: 'library', licence: { id: 'CC0-1.0', attribution: null, proof: [], notes: '' }, source: { site: null, name: 'Test', url: null, creator: null, creatorUrl: null }, addedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
    await library.sync();
    await library.sync();

    const inside = library.require().queries.packFiles('id-zipped').find((f) => f.ref.includes('!'));
    expect(inside).toBeTruthy();
    const answer = await library.removeFiles([{ packId: 'id-zipped', ref: inside!.ref }]);
    // However it is counted, the archive holding it is never opened up to get at the file.
    expect(answer.inArchive).toBeGreaterThan(0);
    expect(existsSync(join(dir, 'original', 'kit.zip'))).toBe(true);
    library.close();
  });

  it('empties for good, and says how many went', async () => {
    const { library, close } = await opened();
    await library.removePack(only(library).id);
    expect((await library.bin()).length).toBe(1);
    expect(await library.emptyBin()).toBe(1);
    expect(await library.bin()).toEqual([]);
    close();
  });

  it('answers with nothing when asked to put back something that has gone', async () => {
    const { library, close } = await opened();
    expect(await library.restoreFromBin('not-in-the-bin')).toBeNull();
    close();
  });
});

describe('the archive and the review queue', () => {
  it('puts a pack away, out of browsing but not out of the library', async () => {
    const { library, close } = await opened();
    const id = only(library).id;
    await library.archivePack(id, true);
    await library.sync();
    expect(library.require().queries.packs({ scope: 'library', text: '', filters: {} }, 'added', 0, 10).total).toBe(0);
    expect(library.require().queries.packs({ scope: 'all', text: '', filters: {} }, 'added', 0, 10).total).toBe(1);

    await library.archivePack(id, false);
    await library.sync();
    expect(library.require().queries.packs({ scope: 'library', text: '', filters: {} }, 'added', 0, 10).total).toBe(1);
    close();
  });

  it('moves a pack into Review and back out again', async () => {
    const { library, root, close } = await opened();
    const id = only(library).id;
    await library.setStatus(id, 'inbox');
    expect(JSON.parse(readFileSync(join(root, 'packs', 'Mini Arcade', 'pack.json'), 'utf8')).status).toBe('inbox');
    await library.setStatus(id, 'library');
    expect(JSON.parse(readFileSync(join(root, 'packs', 'Mini Arcade', 'pack.json'), 'utf8')).status).toBe('library');
    close();
  });
});

describe('collections', () => {
  it('makes one, changes it, and says what holds a pack', async () => {
    const { library, close } = await opened();
    const id = only(library).id;

    const made = await library.createCollection('For the jam', {});
    expect((await library.collections()).some((c) => c.id === made)).toBe(true);

    await library.changeCollection(made, { addPacks: [id] });
    expect((await library.collectionsHolding(id)).some((c) => c.id === made)).toBe(true);

    await library.changeCollection(made, { name: 'Renamed' });
    expect((await library.collections()).find((c) => c.id === made)?.name).toBe('Renamed');

    await library.changeCollection(made, { removePacks: [id] });
    expect((await library.collectionsHolding(id)).some((c) => c.id === made)).toBe(false);
    close();
  });

  it('stars and unstars whole packs and single files', async () => {
    const { library, close } = await opened();
    const id = only(library).id;
    const ref = 'original/Models/arcade.obj';
    const starredPacks = () => library.require().queries.packs({ scope: 'library', text: '', filters: {}, favourites: true }, 'added', 0, 10).total;

    await library.favouritePack(id, true);
    expect(starredPacks()).toBe(1);
    await library.favouritePack(id, false);
    expect(starredPacks()).toBe(0);

    await library.favouriteAssets([{ packId: id, ref }], true);
    expect((await library.collectionsHolding(id, ref)).length).toBe(1);
    await library.favouriteAssets([{ packId: id, ref }], false);
    expect(await library.collectionsHolding(id, ref)).toEqual([]);
    close();
  });
});

describe('importing', () => {
  it('says what a folder would become before anything is copied', async () => {
    const { library, close } = await opened({});
    const from = tempDir();
    mkdirSync(join(from, 'Space Kit'), { recursive: true });
    writeFileSync(join(from, 'Space Kit', 'ship.obj'), 'o ship\n');
    writeFileSync(join(from, 'Space Kit', 'ship.png'), PIXEL);

    const plan = await library.planImport([join(from, 'Space Kit')], false);
    expect(plan.length).toBe(1);
    expect(plan[0]!.name).toBe('Space Kit');
    close();
  });

  it('copies a folder in as a pack, exactly as it was', async () => {
    const { library, root, close } = await opened({});
    const from = tempDir();
    mkdirSync(join(from, 'Space Kit'), { recursive: true });
    writeFileSync(join(from, 'Space Kit', 'ship.obj'), 'o ship\n');

    const plan = await library.planImport([join(from, 'Space Kit')], false);
    const done = await library.import(plan, true);
    expect(done.added.length).toBe(1);

    await library.sync();
    // A pack with no licence and no source waits in Review rather than joining the library.
    expect(done.added[0]!.status).toBe('inbox');
    expect(library.require().queries.stats().inbox).toBe(1);
    // The download is kept exactly as it came, inside the pack's own folder.
    const folder = library.require().queries.pack(done.added[0]!.id)!.folder;
    const files = library.require().queries.packFiles(done.added[0]!.id);
    // The folder the download came in keeps its own name inside the pack: nothing is flattened.
    expect(files.map((f) => f.ref)).toContain('original/Space Kit/ship.obj');
    expect(readFileSync(join(root, 'packs', folder, 'original', 'Space Kit', 'ship.obj'), 'utf8')).toBe('o ship\n');
    close();
  });

  it('names what it could not take rather than failing the lot', async () => {
    const { library, close } = await opened({});
    const plan = await library.planImport([join(tempDir(), 'not-there')], false).catch(() => []);
    const done = await library.import(plan.length ? plan : [{ name: 'Gone', paths: [join(tempDir(), 'gone.zip')], kind: 'file', size: 0, files: 1, duplicate: null } as never], true);
    expect(done.failed.length).toBeGreaterThan(0);
    expect(done.added).toEqual([]);
    close();
  });

  it('throws away a pack that was only just added', async () => {
    const { library, root, close } = await opened({});
    const from = tempDir();
    mkdirSync(join(from, 'Quick Kit'), { recursive: true });
    writeFileSync(join(from, 'Quick Kit', 'thing.obj'), 'o thing\n');
    const done = await library.import(await library.planImport([join(from, 'Quick Kit')], false), true);
    const folder = library.require().queries.pack(done.added[0]!.id)?.folder ?? 'Quick Kit';

    await library.discardPack(done.added[0]!.id);
    expect(existsSync(join(root, 'packs', folder))).toBe(false);
    close();
  });
});

describe('when the folder changes underneath it', () => {
  it('notices a pack that has gone', async () => {
    const { library, root, close } = await opened();
    expect(library.require().queries.stats().packs).toBe(1);
    rmSync(join(root, 'packs', 'Mini Arcade'), { recursive: true, force: true });
    await library.sync();
    expect(library.require().queries.stats().packs).toBe(0);
    close();
  });

  it('notices a pack that has appeared', async () => {
    const { library, root, close } = await opened();
    const dir = join(root, 'packs', 'Later Pack');
    mkdirSync(join(dir, 'original'), { recursive: true });
    mkdirSync(join(dir, 'licence'), { recursive: true });
    writeFileSync(join(dir, 'original', 'thing.obj'), 'o thing\n');
    writeFileSync(join(dir, 'pack.json'), JSON.stringify({ format: 1, id: 'id-later', name: 'Later Pack', status: 'library', licence: { id: 'CC0-1.0', attribution: null, proof: [], notes: '' }, source: { site: null, name: 'Test', url: null, creator: null, creatorUrl: null }, addedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));

    await library.sync();
    await library.sync();
    expect(library.require().queries.stats().packs).toBe(2);
    expect(readdirSync(join(root, 'packs')).sort()).toEqual(['Later Pack', 'Mini Arcade']);
    close();
  });
});
