/**
 * What the window does to one pack: its files, its proof, its status, showing it on disk, opening
 * it, and the bin. Plus the two things that reach outside the app, which are held to refusing
 * clearly rather than to succeeding.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => import('./fake-electron'));

import type { InvokeChannel, Invokes, Wire } from '@shared/ipc';
import { Activity } from '../src/main/activity';
import { Jobs } from '../src/main/jobs';
import { LibraryService } from '../src/main/libraryService';
import { ProjectService } from '../src/main/projects/service';
import { SettingsStore } from '../src/main/settings';
import { registerIpc, type IpcContext } from '../src/main/ipc/index';
import { asked, forget, handlers } from './fake-electron';
import { PIXEL } from './library';
import { writeZip } from './zipfixture';

async function invoke<K extends InvokeChannel>(channel: K, ...args: Parameters<Invokes[K]>): Promise<Wire<Awaited<ReturnType<Invokes[K]>>>> {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`nothing answers ${channel}`);
  return (await fn(...(args as unknown[]))) as Wire<Awaited<ReturnType<Invokes[K]>>>;
}
async function ok<K extends InvokeChannel>(channel: K, ...args: Parameters<Invokes[K]>): Promise<Awaited<ReturnType<Invokes[K]>>> {
  const wire = await invoke(channel, ...args);
  if (!wire.ok) throw new Error(`${channel} refused: ${wire.error.code} ${wire.error.message}`);
  return wire.value;
}
async function refused<K extends InvokeChannel>(channel: K, ...args: Parameters<Invokes[K]>): Promise<{ code: string; message: string }> {
  const wire = await invoke(channel, ...args);
  if (wire.ok) throw new Error(`${channel} answered when it should have refused`);
  return wire.error;
}

const mine: string[] = [];
const ownDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'tessera-packs-'));
  mine.push(dir);
  return dir;
};

let library: LibraryService;
let root = '';
const PACK = 'id-mini-arcade';
const ZIPPED = 'id-zipped';

beforeAll(async () => {
  const dataDir = ownDir();
  root = join(ownDir(), 'Library');
  const jobs = new Jobs(() => undefined);
  const settings = new SettingsStore(dataDir);
  await settings.load();

  library = new LibraryService({ dataDir, jobs, onState: () => undefined, onIndexChanged: () => undefined, siteRules: () => [], binKeepDays: () => 30, watchFiles: false });
  await library.create(root, 'Packs');

  const pack = (id: string, folder: string, build: (dir: string) => void | Promise<void>) => {
    const dir = join(root, 'packs', folder);
    mkdirSync(join(dir, 'original'), { recursive: true });
    mkdirSync(join(dir, 'licence'), { recursive: true });
    const made = build(dir);
    writeFileSync(
      join(dir, 'pack.json'),
      JSON.stringify({ format: 1, id, name: folder, status: 'library', licence: { id: 'CC0-1.0', attribution: null, proof: [], notes: '' }, source: { site: null, name: 'Test', url: 'https://example.test/pack', creator: null, creatorUrl: null }, addedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
    );
    return made;
  };

  pack(PACK, 'Mini Arcade', (dir) => {
    mkdirSync(join(dir, 'original', 'Models'), { recursive: true });
    writeFileSync(join(dir, 'original', 'Models', 'arcade.obj'), 'o arcade\n');
    writeFileSync(join(dir, 'original', 'arcade.png'), PIXEL);
  });
  await pack(ZIPPED, 'Zipped Pack', (dir) => writeZip(join(dir, 'original', 'kit.zip'), { 'Models/thing.obj': 'o thing\n' }));

  await library.sync();
  await library.sync();

  const nothing = () => undefined;
  const stub = <T>(shape: unknown): T => shape as T;
  const recorded: string[] = [];

  const context: IpcContext = {
    dataDir,
    platform: 'linux',
    windows: () => [],
    settings,
    library,
    projects: new ProjectService(dataDir, jobs),
    activity: new Activity(dataDir, () => 'packs-library', nothing),
    jobs,
    downloads: stub({ list: () => [], add: () => ({ added: 0, skipped: 0 }) }),
    thumbs: stub({ get: () => ({}), reset: nothing }),
    backups: stub({ status: () => ({ enabled: false }) }),
    restorer: stub({ close: nothing }),
    rcloneAuth: stub({ cancel: nothing }),
    sync: stub({ status: () => ({ enabled: false }) }),
    updates: stub({ get: () => ({ current: '0.0.0-test' }) }),
    reports: stub({ status: () => ({ available: false }), pending: () => [], preview: () => null }),
    mcp: stub({ status: () => ({ enabled: false, running: false, port: 7458, url: '', error: null, tools: { on: 0, all: 0 }, calls: 0, lastCall: null, lastTool: null }) }),
    mcpHistory: stub({ list: () => ({ rows: [], total: 0 }) }),
    indexChanged: nothing,
    librariesChanged: nothing,
    projectsChanged: nothing,
    backupChanged: nothing,
    syncChanged: nothing,
    libraryId: () => 'packs-library',
    libraryNameOf: () => 'Packs',
    librarySummaries: async () => [],
    copySource: () => {
      const { queries, index } = library.require();
      return {
        libraryId: 'packs-library',
        libraryName: 'Packs',
        packDir: (id: string) => join(root, 'packs', index.known(id)?.folder ?? ''),
        pack: (id: string) => {
          const row = queries.pack(id);
          return row ? { meta: row.meta, folder: row.folder } : null;
        },
        variants: (packId: string, ref: string) => queries.variantsOf(packId, ref),
        packRefs: (packId: string) => queries.packRefs(packId),
      };
    },
    openRecord: () => ({ id: 'packs-library', name: 'Packs', path: root, lastOpenedAt: new Date().toISOString(), skipInboxWhenSure: true, sync: { enabled: false, mode: 'full', whileClosed: true }, backup: null }),
    thumbDir: () => join(dataDir, 'thumbs'),
    readDocument: async () => 'a document',
    recordPage: (id, what) => void recorded.push(`${id}:${what.snapshot}:${what.archive}`),
    start: async () => undefined,
  };

  registerIpc(context);
});

afterEach(forget);
afterAll(() => {
  library.close();
  for (const dir of mine.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('a pack on disk', () => {
  it('shows the pack, and one of its files, in the file manager', async () => {
    await ok('pack:reveal', PACK);
    expect(asked.revealed[0]).toContain('Mini Arcade');

    await ok('pack:reveal', PACK, 'original/Models/arcade.obj');
    expect(asked.revealed[1]).toContain('arcade.obj');
  });

  it('opens a file in whatever this computer uses for it', async () => {
    expect(await ok('pack:open', PACK, 'original/Models/arcade.obj')).toBe('opened');
    expect(asked.opened[0]).toContain('arcade.obj');
  });

  it('cannot open a file inside an archive, and shows the archive instead', async () => {
    const inside = library.require().queries.packFiles(ZIPPED).find((f) => f.ref.includes('!'))!;
    expect(await ok('pack:open', ZIPPED, inside.ref)).toBe('inArchive');
    expect(asked.revealed.some((p) => p.endsWith('kit.zip'))).toBe(true);
  });

  it('refuses to reveal or open something that is not in the pack', async () => {
    expect((await refused('pack:reveal', PACK, '../../../etc/passwd')).code).toBe('not-in-pack');
    expect((await refused('pack:open', PACK, '../../../etc/passwd')).code).toBe('not-in-pack');
    expect(asked.revealed).toEqual([]);
    expect(asked.opened).toEqual([]);
  });

  it('lists the folders inside it, so added files can be put somewhere sensible', async () => {
    expect(await ok('pack:folders', PACK)).toContain('Models');
  });

  it('hands over its pictures by name, for finding a model texture', async () => {
    const textures = await ok('pack:textures', PACK);
    expect(Object.keys(textures).some((k) => k.endsWith('arcade.png'))).toBe(true);
  });
});

describe('proof kept with a pack', () => {
  it('takes files into the licence folder, lists them, and opens one', async () => {
    const from = ownDir();
    writeFileSync(join(from, 'receipt.txt'), 'paid for it');
    asked.files = [join(from, 'receipt.txt')];

    expect(await ok('pack:addProof', PACK)).toBe(1);
    expect((await ok('pack:proof', PACK)).map((f) => f.name)).toContain('receipt.txt');

    await ok('pack:openProof', PACK, 'receipt.txt');
    expect(asked.opened.some((p) => p.endsWith('receipt.txt'))).toBe(true);
  });

  it('takes nothing when nobody picks anything', async () => {
    asked.files = [];
    expect(await ok('pack:addProof', PACK)).toBe(0);
  });

  it('refuses a proof file name that tries to climb out of the folder', async () => {
    expect((await refused('pack:openProof', PACK, '../pack.json')).code).toBe('bad-name');
  });

  it('keeps a record of the page a pack came from, in the background', async () => {
    expect(await ok('pack:recordPage', PACK, { snapshot: true, archive: false })).toBeUndefined();
  });
});

describe('files of a pack', () => {
  it('adds more, into a folder of the window choosing', async () => {
    const from = ownDir();
    writeFileSync(join(from, 'extra.obj'), 'o extra\n');
    const added = await ok('pack:addFiles', PACK, [join(from, 'extra.obj')], 'Models');
    expect(added.added).toBe(1);
    expect(added.names).toEqual(['Models/extra.obj']);
  });

  it('takes single files to the bin, and puts them back', async () => {
    const one = library.require().queries.packFiles(PACK).find((f) => f.ref.endsWith('extra.obj'))!;
    const gone = await ok('assets:remove', [{ packId: PACK, ref: one.ref }]);
    expect(gone.removed).toBe(1);

    const waiting = await ok('bin:list');
    expect(waiting.length).toBeGreaterThan(0);
    expect(await ok('bin:restore', waiting[0]!.id)).toBeTruthy();
  });

  it('takes a whole pack to the bin, and empties it for good', async () => {
    const name = await ok('pack:remove', ZIPPED);
    expect(name).toBe('Zipped Pack');

    const waiting = await ok('bin:list');
    expect(waiting.some((e) => e.shown === 'Zipped Pack')).toBe(true);
    expect(await ok('bin:empty')).toBeGreaterThan(0);
    expect(await ok('bin:list')).toEqual([]);
  });

  it('moves a pack in and out of Review', async () => {
    await ok('pack:status', PACK, 'inbox');
    expect((await ok('pack:get', PACK))?.status).toBe('inbox');
    await ok('pack:status', PACK, 'library');
    expect((await ok('pack:get', PACK))?.status).toBe('library');
  });

  it('reads what a pack suggests about itself, for the add page', async () => {
    const details = await ok('pack:details', PACK);
    expect(details).toHaveProperty('detected');
    expect(details).toHaveProperty('suggestions');
  });
});
