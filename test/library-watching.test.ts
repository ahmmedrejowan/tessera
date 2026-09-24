/**
 * Noticing changes made outside the app.
 *
 * Every other test turns watching off, because a watcher pointed at a folder that has gone can
 * take the whole app down on Windows, and temporary folders go constantly. So watching is tested
 * here on its own, with folders that outlive the test and are cleared up afterwards, and not on
 * Windows, where the underlying watcher behaves differently enough to be its own job.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => import('./fake-electron'));

import { Jobs } from '../src/main/jobs';
import { LibraryService } from '../src/main/libraryService';

const windows = process.platform === 'win32';

const mine: string[] = [];
const opened: LibraryService[] = [];
const ownDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'tessera-watch-'));
  mine.push(dir);
  return dir;
};

afterAll(() => {
  for (const library of opened.splice(0)) library.close();
  for (const dir of mine.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A library that is watching its own folder. */
async function watching() {
  const dataDir = ownDir();
  const root = join(ownDir(), 'Library');
  let changes = 0;
  const library = new LibraryService({
    dataDir,
    jobs: new Jobs(() => undefined),
    onState: () => undefined,
    onIndexChanged: () => void (changes += 1),
    siteRules: () => [],
    binKeepDays: () => 30,
    watchFiles: true,
  });
  opened.push(library);
  await library.create(root, 'Watched');
  await library.sync();
  // The system's watcher takes a moment to start reporting after it is asked to; without this a
  // change made immediately afterwards can happen before anything is listening for it.
  await new Promise((r) => setTimeout(r, 250));
  return { library, root, changes: () => changes };
}

/** A pack written straight onto disk, the way another program or a sync would leave one. */
function packOnDisk(root: string, name: string, id: string): void {
  const dir = join(root, 'packs', name);
  mkdirSync(join(dir, 'original'), { recursive: true });
  mkdirSync(join(dir, 'licence'), { recursive: true });
  writeFileSync(join(dir, 'original', 'thing.obj'), 'o thing\n');
  writeFileSync(
    join(dir, 'pack.json'),
    JSON.stringify({ format: 1, id, name, status: 'library', licence: { id: 'CC0-1.0', attribution: null, proof: [], notes: '' }, source: { site: null, name: 'Test', url: null, creator: null, creatorUrl: null }, addedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
  );
}

/** Wait for something to become true, or give up with a clear complaint. */
async function until(check: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 600; i += 1) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`gave up waiting for ${what}`);
}

describe.skipIf(windows)('a library that watches its own folder', () => {
  it('notices a pack somebody put there without the app', async () => {
    const { library, root } = await watching();
    expect(library.require().queries.stats().packs).toBe(0);

    packOnDisk(root, 'Arrived By Hand', 'id-arrived');

    await until(() => library.require().queries.pack('id-arrived') !== null, 'the new pack to be noticed');
    expect(library.require().queries.stats().packs).toBe(1);
  });

  it('notices a pack that has gone', async () => {
    const { library, root } = await watching();
    packOnDisk(root, 'Here Then Gone', 'id-here-then-gone');
    await until(() => library.require().queries.pack('id-here-then-gone') !== null, 'the pack to be noticed');

    rmSync(join(root, 'packs', 'Here Then Gone'), { recursive: true, force: true });
    await until(() => library.require().queries.pack('id-here-then-gone') === null, 'the pack to be missed');
  });

  it('gathers a flurry of changes into one reading, rather than one each', async () => {
    const { library, root, changes } = await watching();
    const before = changes();

    for (let i = 0; i < 6; i += 1) packOnDisk(root, `Pack ${i}`, `id-many-${i}`);
    await until(() => library.require().queries.stats().packs === 6, 'all six to be noticed');

    // Six packs arriving together should not mean six separate readings of the library.
    expect(changes() - before).toBeLessThan(6);
  });

  it('lets go of a folder that has gone, rather than watching nothing', async () => {
    const { library, root } = await watching();
    packOnDisk(root, 'Before', 'id-before');
    await until(() => library.require().queries.pack('id-before') !== null, 'the pack to be noticed');

    // A drive pulled out, or the folder deleted from underneath the app.
    rmSync(root, { recursive: true, force: true });
    expect(existsSync(root)).toBe(false);

    // It must not take the app down with it: closing still works, and nothing throws.
    await new Promise((r) => setTimeout(r, 200));
    library.close();
    expect(library.getState().status).toBe('none');
  });

  it('stops watching when the library is closed, and starts again when another opens', async () => {
    const { library, root } = await watching();
    library.close();

    // Nothing is watched now, so a pack written here is not noticed.
    packOnDisk(root, 'While Closed', 'id-while-closed');
    await new Promise((r) => setTimeout(r, 300));

    // Opening it again reads everything, including what arrived while it was shut.
    await library.open(root);
    await until(() => library.require().queries.pack('id-while-closed') !== null, 'the pack to be read on opening');
  });
});
