/**
 * The window asks, the main process answers. Every handler in src/main/ipc is registered here and
 * called the way the window calls it, over a real library on disk.
 *
 * The point is not that each function returns something: it is that the contract holds. A channel
 * that is declared is answered, what comes back is shaped as the window expects, a refusal is a
 * `UserError` with a code rather than a crash, and the side effects (a window told, a folder
 * revealed, something written into Activity) actually happen.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

/** A folder that lasts as long as this file does, rather than as long as one test. */
const mine: string[] = [];
const ownDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'tessera-ipc-'));
  mine.push(dir);
  return dir;
};

/** Call a channel the way the window would. */
async function invoke<K extends InvokeChannel>(channel: K, ...args: Parameters<Invokes[K]>): Promise<Wire<Awaited<ReturnType<Invokes[K]>>>> {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`nothing answers ${channel}`);
  return (await fn(...(args as unknown[]))) as Wire<Awaited<ReturnType<Invokes[K]>>>;
}

/** Call a channel and insist it worked. */
async function ok<K extends InvokeChannel>(channel: K, ...args: Parameters<Invokes[K]>): Promise<Awaited<ReturnType<Invokes[K]>>> {
  const wire = await invoke(channel, ...args);
  if (!wire.ok) throw new Error(`${channel} refused: ${wire.error.code} ${wire.error.message}`);
  return wire.value;
}

/** Call a channel and insist it refused, handing back why. */
async function refused<K extends InvokeChannel>(channel: K, ...args: Parameters<Invokes[K]>): Promise<{ code: string; message: string }> {
  const wire = await invoke(channel, ...args);
  if (wire.ok) throw new Error(`${channel} answered when it should have refused`);
  return wire.error;
}

const told: string[] = [];
let root = '';
let dataDir = '';
let library: LibraryService;
let projects: ProjectService;
let activity: Activity;

beforeAll(async () => {
  dataDir = ownDir();
  root = join(ownDir(), 'Library');
  const jobs = new Jobs(() => undefined);
  const settings = new SettingsStore(dataDir);
  await settings.load();

  library = new LibraryService({
    dataDir,
    jobs,
    onState: () => undefined,
    onIndexChanged: () => undefined,
    siteRules: () => [],
    binKeepDays: () => 30,
    watchFiles: false,
  });
  await library.create(root, 'Handlers');

  // One pack on disk before the index reads it, as an import would have left it.
  const pack = join(root, 'packs', 'Mini Arcade');
  mkdirSync(join(pack, 'original', 'Models'), { recursive: true });
  writeFileSync(join(pack, 'original', 'Models', 'arcade.obj'), 'o arcade\n');
  writeFileSync(join(pack, 'original', 'cover.png'), PIXEL);
  mkdirSync(join(pack, 'licence'), { recursive: true });
  writeFileSync(
    join(pack, 'pack.json'),
    JSON.stringify({
      format: 1,
      id: 'id-mini-arcade',
      name: 'Mini Arcade',
      status: 'library',
      licence: { id: 'CC0-1.0', attribution: null, proof: [], notes: '' },
      source: { site: null, name: 'Test', url: null, creator: null, creatorUrl: null },
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  );
  await library.sync();
  await library.sync();

  projects = new ProjectService(dataDir, jobs);
  activity = new Activity(dataDir, () => 'handlers-library', () => undefined);

  const nothing = () => undefined;
  const stub = <T>(shape: unknown): T => shape as T;

  const context: IpcContext = {
    dataDir,
    platform: process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux',
    windows: () => [],
    settings,
    library,
    projects,
    activity,
    jobs,
    downloads: stub({ list: () => [], add: () => ({ added: 0, skipped: 0 }), pause: nothing, resume: nothing, retry: nothing, remove: nothing, clearDone: nothing }),
    thumbs: stub({ get: () => ({}), size: async () => 0, clear: async () => undefined, stats: () => ({}), build: nothing, stop: nothing, retryFailed: nothing }),
    backups: stub({ status: () => ({ enabled: false }), snapshots: async () => [], setInterval: async () => undefined, turnOff: async () => undefined }),
    restorer: stub({ close: () => undefined }),
    rcloneAuth: stub({ cancel: () => undefined }),
    sync: stub({ status: () => ({ enabled: false }), disable: async () => undefined }),
    updates: stub({ get: () => ({ current: '0.0.0-test', canCheck: false }), check: async () => ({ current: '0.0.0-test' }) }),
    reports: stub({ status: () => ({ available: false }), pending: () => [], preview: () => null, record: nothing, respond: nothing, answerCrashes: nothing, problemReport: () => 'a report', sendProblem: async () => true }),
    mcp: stub({ status: () => ({ enabled: false, running: false, port: 7458, url: 'http://127.0.0.1:7458/mcp', error: null, tools: 0, calls: 0 }), apply: async () => undefined }),
    mcpHistory: stub({ list: () => ({ rows: [], total: 0 }), clear: async () => undefined }),

    indexChanged: () => void told.push('index'),
    librariesChanged: () => void told.push('libraries'),
    projectsChanged: () => void told.push('projects'),
    backupChanged: () => void told.push('backup'),
    syncChanged: () => void told.push('sync'),

    libraryId: () => 'handlers-library',
    libraryNameOf: () => 'Handlers',
    librarySummaries: async () => [],
    copySource: () => {
      const { queries, index } = library.require();
      return {
        libraryId: 'handlers-library',
        libraryName: 'Handlers',
        packDir: (id: string) => join(root, 'packs', index.known(id)?.folder ?? ''),
        pack: (id: string) => {
          const row = queries.pack(id);
          return row ? { meta: row.meta, folder: row.folder } : null;
        },
        variants: (packId: string, ref: string) => queries.variantsOf(packId, ref),
        packRefs: (packId: string) => queries.packRefs(packId),
      };
    },
    openRecord: () => ({ id: 'handlers-library', name: 'Handlers', path: root, lastOpenedAt: new Date().toISOString(), skipInboxWhenSure: true, sync: { enabled: false, mode: 'full', whileClosed: true }, backup: null }),
    thumbDir: () => join(dataDir, 'thumbs'),
    readDocument: async (name) => `the ${name}`,
    recordPage: nothing,
    start: async () => undefined,
  };

  registerIpc(context);
});

afterEach(() => {
  forget();
  told.length = 0;
});

afterAll(() => {
  library.close();
  for (const dir of mine.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const packId = () => 'id-mini-arcade';

describe('the contract is answered', () => {
  // That every declared channel is answered is checked in contract.test.ts, by reading the files.
  // What matters here is that they answer when called.
  it('registered a good few of them', () => {
    expect(handlers.size).toBeGreaterThan(100);
  });

  it('answers the ones that take nothing', async () => {
    expect(await ok('app:info')).toMatchObject({ version: expect.any(String) });
    expect(await ok('settings:get')).toMatchObject({ mcp: expect.any(Object) });
    expect(Array.isArray(await ok('jobs:list'))).toBe(true);
    expect(await ok('library:state')).toMatchObject({ status: 'ready' });
    expect(Array.isArray(await ok('bin:list'))).toBe(true);
  });
});

describe('browsing and reading', () => {
  it('finds the pack that is there, and its files', async () => {
    const packs = await ok('browse:packs', { scope: 'library', text: '', filters: {} }, 'added', 0, 50);
    expect(packs.rows.map((p) => p.name)).toContain('Mini Arcade');

    const assets = await ok('browse:assets', { scope: 'library', text: '', filters: {} }, 'added', 0, 50);
    expect(assets.total).toBeGreaterThan(0);

    const facets = await ok('browse:facets', { scope: 'library', text: '', filters: {} }, 'assets');
    expect(Array.isArray(facets.type)).toBe(true);

    const ids = await ok('browse:allIds', { scope: 'library', text: '', filters: {} }, 'assets');
    expect(ids.length).toBe(assets.total);

    expect(typeof (await ok('browse:sum', 'assets', ids))).toBe('number');
  });

  it('reads one pack, its files, and what is inside it', async () => {
    const pack = await ok('pack:get', packId());
    expect(pack?.meta.name).toBe('Mini Arcade');
    expect((await ok('pack:files', packId())).length).toBeGreaterThan(0);
    expect(Array.isArray(await ok('pack:partLicences', packId()))).toBe(true);
    expect(await ok('pack:detect', packId())).toBeTruthy();
    expect(Array.isArray(await ok('pack:folders', packId()))).toBe(true);
    expect(Array.isArray(await ok('pack:proof', packId()))).toBe(true);
    expect(await ok('pack:textures', packId())).toBeTruthy();
  });

  it('reads one asset, and what else stands for the same thing', async () => {
    const files = await ok('pack:files', packId());
    const one = files[0]!;
    expect((await ok('asset:get', one.id))?.id).toBe(one.id);
    expect(Array.isArray(await ok('asset:variants', one.id))).toBe(true);
    expect((await ok('assets:refs', [one.id]))[0]?.packId).toBe(packId());
  });

  it('says so plainly when a pack is not there', async () => {
    expect(await ok('pack:get', 'not-a-pack')).toBeNull();
  });

  it('answers the library own questions', async () => {
    expect(await ok('library:stats')).toMatchObject({ packs: expect.any(Number) });
    expect(Array.isArray(await ok('library:terms', 'creator'))).toBe(true);
    expect(await ok('library:health')).toBeTruthy();
  });
});

describe('changing things', () => {
  it('edits a pack and keeps the games that took from it in step', async () => {
    await ok('pack:edit', packId(), { name: 'Mini Arcade II' });
    expect((await ok('pack:get', packId()))?.meta.name).toBe('Mini Arcade II');
    await ok('pack:edit', packId(), { name: 'Mini Arcade' });
  });

  it('stars a pack, archives it, and puts both back', async () => {
    await ok('favourites:pack', packId(), true);
    expect((await ok('browse:packs', { scope: 'library', text: '', filters: {}, favourites: true }, 'added', 0, 10)).rows[0]?.fav).toBe(true);
    await ok('favourites:pack', packId(), false);
    await ok('library:refresh');
    expect((await ok('browse:packs', { scope: 'library', text: '', filters: {}, favourites: true }, 'added', 0, 10)).total).toBe(0);

    await ok('pack:archive', packId(), true);
    expect((await ok('pack:get', packId()))?.archived).toBe(true);
    // An archived pack is kept in full, and simply left out of browsing.
    expect((await ok('browse:packs', { scope: 'library', text: '', filters: {} }, 'added', 0, 10)).total).toBe(0);
    await ok('pack:archive', packId(), false);
    expect((await ok('pack:get', packId()))?.archived).toBe(false);
  });

  it('stars single files, and takes the star off again', async () => {
    const one = (await ok('pack:files', packId()))[0]!;
    const item = { packId: packId(), ref: one.ref };
    await ok('favourites:assets', [item], true);
    expect((await ok('collections:holding', packId(), one.ref)).length).toBeGreaterThan(0);
    await ok('favourites:assets', [item], false);
  });

  it('refuses to edit a pack that is not there, with a code rather than a crash', async () => {
    const why = await refused('pack:edit', 'not-a-pack', { name: 'nope' });
    expect(why.code).toBeTruthy();
    expect(why.message).toBeTruthy();
  });
});

describe('collections', () => {
  it('makes one, puts a pack in it, and takes it away again', async () => {
    const id = await ok('collections:create', 'For the jam', {});
    expect(id).toBeTruthy();
    expect((await ok('collections:list')).some((c) => c.id === id)).toBe(true);

    await ok('collections:change', id, { addPacks: [packId()] });
    expect((await ok('collections:holding', packId())).some((c) => c.id === id)).toBe(true);

    await ok('collections:change', id, { removePacks: [packId()] });
    expect((await ok('collections:holding', packId())).some((c) => c.id === id)).toBe(false);
  });

  it('renames one', async () => {
    const id = await ok('collections:create', 'Before', {});
    await ok('collections:change', id, { name: 'After' });
    expect((await ok('collections:list')).find((c) => c.id === id)?.name).toBe('After');
  });
});

describe('games', () => {
  it('takes a folder, works out what it is, and remembers it', async () => {
    const game = ownDir();
    mkdirSync(join(game, 'ProjectSettings'), { recursive: true });
    writeFileSync(join(game, 'ProjectSettings', 'ProjectVersion.txt'), 'm_EditorVersion: 6000.3.24f1\n');

    const probe = await ok('projects:probe', game);
    expect(probe.engine).toBe('unity');

    const added = await ok('projects:add', probe);
    expect(added.id).toBeTruthy();
    expect(told).toContain('projects');

    expect((await ok('projects:list')).some((p) => p.id === added.id)).toBe(true);
    expect(await ok('projects:entries', added.id)).toEqual([]);
    expect(await ok('projects:usage', [packId()], [])).toBeTruthy();

    const plan = await ok('projects:plan', added.id, [{ packId: packId(), ref: 'original/Models/arcade.obj' }]);
    expect(plan.files).toBeGreaterThan(0);
    expect(plan.assets).toBe(1);

    await ok('projects:copy', added.id, [{ packId: packId(), ref: 'original/Models/arcade.obj' }]);
    expect(existsSync(join(game, 'Assets', 'ThirdParty'))).toBe(true);
    expect((await ok('projects:entries', added.id)).length).toBe(1);

    await ok('projects:remove', added.id, [{ packId: packId(), ref: 'original/Models/arcade.obj' }]);
    expect(await ok('projects:entries', added.id)).toEqual([]);

    await ok('projects:unlink', added.id);
    expect((await ok('projects:list')).some((p) => p.id === added.id)).toBe(false);
  });

  it('cancels quietly when nobody picks a folder', async () => {
    asked.folder = null;
    expect(await ok('projects:choose')).toBeNull();
  });
});

describe('the desktop', () => {
  it('reveals a path, opens a folder, and opens a link outside', async () => {
    await ok('fs:reveal', root);
    expect(asked.revealed).toContain(root);

    await ok('app:showLogs');
    expect(asked.opened.some((p) => p.includes('logs'))).toBe(true);

    await ok('app:openExternal', 'https://example.com/');
    expect(asked.external).toContain('https://example.com/');
  });

  it('will not open a link that is not a web page', async () => {
    await ok('app:openExternal', 'file:///etc/passwd');
    expect(asked.external).toEqual([]);
  });

  it('says where the usual folders are', async () => {
    const places = await ok('fs:places');
    expect(places.separator).toBeTruthy();
    expect(places.home).toBeTruthy();
  });

  it('describes a folder it is pointed at', async () => {
    expect(await ok('fs:describe', root)).toBeTruthy();
  });

  it('cancels quietly when nobody picks anything', async () => {
    asked.folder = null;
    expect(await ok('dialog:folder', 'Pick one')).toBeNull();
    asked.files = [];
    expect(await ok('dialog:file', 'Pick one')).toBeNull();
  });
});

describe('settings, activity and documents', () => {
  it('changes a setting and hands back the whole of them', async () => {
    const next = await ok('settings:update', { theme: 'dark' });
    expect(next.theme).toBe('dark');
    expect((await ok('settings:get')).theme).toBe('dark');
  });

  it('keeps activity, newest first', async () => {
    activity.add('pack', 'Something happened');
    await new Promise((r) => setTimeout(r, 30));
    const rows = await ok('activity:list', 10);
    expect(rows[0]?.text).toBe('Something happened');
  });

  it('hands over a document the app ships', async () => {
    expect(await ok('app:document', 'licence')).toContain('licence');
  });
});

describe('agents', () => {
  it('says what it is doing and what tools there are', async () => {
    expect(await ok('mcp:status')).toMatchObject({ port: expect.any(Number) });
    const tools = await ok('mcp:tools');
    expect(tools.length).toBeGreaterThan(20);
    expect(tools.every((t) => t.name && t.group)).toBe(true);
    expect(await ok('mcp:calls', 5, 0)).toMatchObject({ total: 0 });
    expect(await ok('mcp:skill')).toContain('Tessera');
    expect((await ok('mcp:clients')).length).toBeGreaterThan(0);
  });

  it('answers whether a port is free', async () => {
    expect(typeof (await ok('mcp:portFree', 65123))).toBe('boolean');
  });
});

describe('updates and reports', () => {
  it('says where it stands without reaching the network', async () => {
    expect(await ok('updates:status')).toMatchObject({ current: '0.0.0-test' });
    expect(await ok('reports:status')).toMatchObject({ available: false });
    expect(await ok('reports:pending')).toEqual([]);
    expect(await ok('reports:problem', 'a note')).toBeTruthy();
    expect(await ok('reports:preview')).toBeNull();
  });
});
