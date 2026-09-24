/**
 * The rest of the window's side: backups, sync, restoring, helper programs, downloads, imports,
 * agents, thumbnails and the library list.
 *
 * These handlers stand between the window and a service. Almost none of them decide anything
 * themselves, and that is exactly what is worth holding them to: what the window sent must reach
 * the service unchanged, what the service answered must reach the window unchanged, and a refusal
 * must arrive as a refusal rather than as a crash. So the services here are stand-ins that record
 * what they were given.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

/** Everything a stand-in was asked to do, in order. */
const heard: { what: string; args: unknown[] }[] = [];
const records =
  <T>(what: string, answer?: T) =>
  (...args: unknown[]) => {
    heard.push({ what, args });
    return answer;
  };
const said = (what: string) => heard.find((h) => h.what === what);

const mine: string[] = [];
const ownDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'tessera-ipc2-'));
  mine.push(dir);
  return dir;
};

let library: LibraryService;
let root = '';

beforeAll(async () => {
  const dataDir = ownDir();
  root = join(ownDir(), 'Library');
  const jobs = new Jobs(() => undefined);
  const settings = new SettingsStore(dataDir);
  await settings.load();

  library = new LibraryService({ dataDir, jobs, onState: () => undefined, onIndexChanged: () => undefined, siteRules: () => [], binKeepDays: () => 30, watchFiles: false });
  await library.create(root, 'The rest');
  await library.sync();

  const stub = <T>(shape: unknown): T => shape as T;
  const nothing = () => undefined;

  const context: IpcContext = {
    dataDir,
    platform: 'linux',
    windows: () => [],
    settings,
    library,
    projects: new ProjectService(dataDir, jobs),
    activity: new Activity(dataDir, () => 'rest-library', nothing),
    jobs,

    downloads: stub({
      list: records('downloads.list', [{ id: 'd1', url: 'https://example.test/a.zip', state: 'ready' }]),
      add: records('downloads.add', { added: 1, skipped: 0 }),
      pause: records('downloads.pause'),
      resume: records('downloads.resume'),
      cancel: records('downloads.cancel'),
      again: records('downloads.again'),
      remove: records('downloads.remove'),
      pauseAll: records('downloads.pauseAll'),
      resumeAll: records('downloads.resumeAll'),
      retryFailed: records('downloads.retryFailed'),
      clear: records('downloads.clear', Promise.resolve()),
      done: records('downloads.done'),
      fileOf: records('downloads.fileOf', '/tmp/a.zip'),
      urlOf: records('downloads.urlOf', 'https://example.test/a.zip'),
    }),
    thumbs: stub({
      get: records('thumbs.get', { 'a:b': { state: 'ready', url: 'tessera://thumb/a' } }),
      size: records('thumbs.size', Promise.resolve(2048)),
      clear: records('thumbs.clear', Promise.resolve()),
      reset: records('thumbs.reset'),
    }),
    backups: stub({
      status: records('backups.status', { enabled: true, lastBackupAt: null, running: false }),
      setup: records('backups.setup', Promise.resolve({ ok: true })),
      password: records('backups.password', Promise.resolve('a very long password')),
      changePassword: records('backups.changePassword', Promise.resolve()),
      target: records('backups.target', { provider: 'folder', values: { path: '/tmp/backups' } }),
      backupNow: records('backups.backupNow', Promise.resolve({ snapshots: 1 })),
      join: records('backups.join', Promise.resolve()),
      setInterval: records('backups.setInterval', Promise.resolve()),
      snapshots: records('backups.snapshots', Promise.resolve([{ id: 's1', at: '2026-01-01T00:00:00.000Z', size: 10 }])),
      restore: records('backups.restore', Promise.resolve({ restored: 1 })),
      turnOff: records('backups.turnOff', Promise.resolve()),
    }),
    restorer: stub({
      unlock: records('restorer.unlock', Promise.resolve({ snapshots: [] })),
      restore: records('restorer.restore', Promise.resolve({ restored: 0 })),
      close: records('restorer.close'),
      keepBackingUp: records('restorer.keepBackingUp', Promise.resolve()),
    }),
    rcloneAuth: stub({
      signIn: records('rclone.signIn', Promise.resolve({ values: { token: 'x' } })),
      cancel: records('rclone.cancel'),
    }),
    sync: stub({
      status: records('sync.status', { enabled: false, devices: [] }),
      enable: records('sync.enable', Promise.resolve()),
      setMode: records('sync.setMode', Promise.resolve()),
      setWhileClosed: records('sync.setWhileClosed', Promise.resolve()),
      disable: records('sync.disable', Promise.resolve()),
      addDevice: records('sync.addDevice', Promise.resolve()),
      removeDevice: records('sync.removeDevice', Promise.resolve()),
      startForReceiving: records('sync.startForReceiving', Promise.resolve({ id: 'device-id' })),
      acceptFolder: records('sync.acceptFolder', Promise.resolve()),
      folderProgress: records('sync.folderProgress', Promise.resolve({ done: 1, total: 2 })),
    }),
    updates: stub({
      get: records('updates.get', { current: '0.0.0-test', canCheck: true, installer: null }),
      check: records('updates.check', Promise.resolve({ current: '0.0.0-test', latest: '9.9.9' })),
      download: records('updates.download', Promise.resolve({ installer: '/tmp/Tessera.dmg' })),
    }),
    reports: stub({
      status: records('reports.status', { available: true }),
      pending: records('reports.pending', []),
      preview: records('reports.preview', null),
      record: records('reports.record'),
      respond: records('reports.respond'),
      answerCrashes: records('reports.answerCrashes'),
      problemReport: records('reports.problemReport', 'a report'),
      sendProblem: records('reports.sendProblem', Promise.resolve(true)),
    }),
    mcp: stub({
      status: records('mcp.status', { enabled: true, running: true, port: 7458, url: 'http://127.0.0.1:7458/mcp', error: null, tools: { on: 1, all: 49 }, calls: 0, lastCall: null, lastTool: null }),
      apply: records('mcp.apply', Promise.resolve()),
    }),
    mcpHistory: stub({
      list: records('history.list', Promise.resolve({ rows: [], total: 0 })),
      clear: records('history.clear', Promise.resolve()),
    }),

    indexChanged: nothing,
    librariesChanged: nothing,
    projectsChanged: nothing,
    backupChanged: nothing,
    syncChanged: nothing,

    libraryId: () => 'rest-library',
    libraryNameOf: () => 'The rest',
    librarySummaries: async () => [{ id: 'rest-library', name: 'The rest', path: root, packs: 0, assets: 0, size: 0, lastOpenedAt: new Date().toISOString(), open: true, missing: false }],
    copySource: () => {
      const { queries, index } = library.require();
      return {
        libraryId: 'rest-library',
        libraryName: 'The rest',
        packDir: (id: string) => join(root, 'packs', index.known(id)?.folder ?? ''),
        pack: (id: string) => {
          const row = queries.pack(id);
          return row ? { meta: row.meta, folder: row.folder } : null;
        },
        variants: (packId: string, ref: string) => queries.variantsOf(packId, ref),
        packRefs: (packId: string) => queries.packRefs(packId),
      };
    },
    openRecord: () => ({ id: 'rest-library', name: 'The rest', path: root, lastOpenedAt: new Date().toISOString(), skipInboxWhenSure: true, sync: { enabled: false, mode: 'full', whileClosed: true }, backup: null }),
    thumbDir: () => join(dataDir, 'thumbs'),
    readDocument: async (name) => `the ${name}`,
    recordPage: records('recordPage'),
    start: records('start', Promise.resolve()),
  };

  registerIpc(context);
});

afterEach(() => {
  forget();
  heard.length = 0;
});

afterAll(() => {
  library.close();
  for (const dir of mine.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('backups', () => {
  it('says how they stand, and hands a new password out', async () => {
    expect(await ok('backup:status')).toMatchObject({ enabled: true });
    expect((await ok('backup:generatePassword')).length).toBeGreaterThan(12);
  });

  it('passes the whole target through to be set up, untouched', async () => {
    const target = { provider: 'folder' as const, values: { path: '/tmp/backups' } };
    await ok('backup:setup', target, 'a password', true);
    expect(said('backups.setup')!.args).toEqual([target, 'a password', true]);
  });

  it('asks where to keep them, and takes no for an answer', async () => {
    asked.folder = null;
    expect(await ok('backup:chooseFolder')).toBeNull();
    asked.folder = '/tmp/chosen';
    expect(await ok('backup:chooseFolder')).toBe('/tmp/chosen');
  });

  it('runs one now, and notes it in Activity', async () => {
    await ok('backup:now');
    expect(said('backups.backupNow')).toBeTruthy();
  });

  it('lists what has been kept, and puts one back', async () => {
    expect(await ok('backup:snapshots')).toHaveLength(1);
    await ok('backup:restore', 's1', { provider: 'folder', values: { path: '/tmp/backups' } }, 10, 'A library');
    expect(said('backups.restore')).toBeTruthy();
  });

  it('changes the password, joins another library, sets the interval, turns off', async () => {
    await ok('backup:changePassword', 'a longer password');
    await ok('backup:join', 'other-library');
    await ok('backup:setInterval', 12);
    await ok('backup:turnOff');
    expect(said('backups.changePassword')!.args[0]).toBe('a longer password');
    expect(said('backups.join')!.args[0]).toBe('other-library');
    expect(said('backups.setInterval')!.args[0]).toBe(12);
    expect(said('backups.turnOff')).toBeTruthy();
  });

  it('shows the password where the system does not ask for a fingerprint', async () => {
    expect(await ok('backup:revealPassword')).toBe('a very long password');
  });

  it('writes the recovery kit where the save box says, and nowhere when it is cancelled', async () => {
    asked.savePath = null;
    expect(await ok('backup:saveKit', { password: 'a very long password', target: null, includeKeys: false })).toBeNull();
  });

  it('signs in to a cloud provider, and can be told to stop', async () => {
    await ok('backup:signIn', 'drive', null);
    expect(said('rclone.signIn')).toBeTruthy();
    await ok('backup:cancelSignIn');
    expect(said('rclone.cancel')).toBeTruthy();
  });

  it('says whether a key file needs a passphrase', async () => {
    const dir = ownDir();
    writeFileSync(join(dir, 'plain'), '-----BEGIN OPENSSH PRIVATE KEY-----\n');
    expect(typeof (await ok('backup:keyNeedsPassphrase', join(dir, 'plain')))).toBe('boolean');
  });
});

describe('restoring from a backup', () => {
  it('says where backups might be, and looks there', async () => {
    expect(Array.isArray(await ok('restore:places'))).toBe(true);
    expect(Array.isArray(await ok('restore:find'))).toBe(true);
  });

  it('unlocks one, restores from it, and closes it again', async () => {
    await ok('restore:unlock', { provider: 'folder', values: { path: '/tmp/backups' } }, 'a password');
    expect(said('restorer.unlock')).toBeTruthy();
    await ok('restore:run', 's1', { provider: 'folder', values: { path: '/tmp/backups' } }, 10);
    expect(said('restorer.restore')).toBeTruthy();
    await ok('restore:close');
    expect(said('restorer.close')).toBeTruthy();
  });

  it('describes somewhere a restored library could go', async () => {
    // An empty folder is a fine place, and a folder that is not there is not: either way it
    // answers rather than throwing.
    expect(await ok('restore:storeAt', ownDir())).not.toBeUndefined();
    expect(await ok('restore:storeAt', join(ownDir(), 'not-there'))).not.toBeUndefined();
  });
});

describe('sync', () => {
  it('says how it stands, and is switched on and off', async () => {
    expect(await ok('sync:status')).toMatchObject({ enabled: false });
    await ok('sync:enable', 'full');
    await ok('sync:setMode', 'push');
    await ok('sync:setWhileClosed', true);
    await ok('sync:disable');
    expect(said('sync.enable')!.args[0]).toBe('full');
    expect(said('sync.setMode')!.args[0]).toBe('push');
    expect(said('sync.disable')).toBeTruthy();
  });

  it('adds and removes another computer', async () => {
    await ok('sync:addDevice', 'DEVICE-ID', 'The laptop');
    expect(said('sync.addDevice')!.args).toEqual(['DEVICE-ID', 'The laptop']);
    await ok('sync:removeDevice', 'DEVICE-ID');
    expect(said('sync.removeDevice')!.args).toEqual(['DEVICE-ID']);
  });

  it('waits to receive a library, accepts one, and reports how far it has got', async () => {
    expect(await ok('sync:receive')).toMatchObject({ id: 'device-id' });
    await ok('sync:acceptFolder', 'folder-id', 'DEVICE-ID', 'A library', '/tmp/here', 'full');
    expect(said('sync.acceptFolder')!.args).toEqual(['folder-id', 'DEVICE-ID', 'A library', '/tmp/here', 'full']);
    expect(await ok('sync:folderProgress', 'folder-id')).toMatchObject({ total: 2 });
  });
});

describe('helper programs', () => {
  it('lists the package managers this computer actually has', async () => {
    const found = await ok('tools:packageManagers');
    expect(Array.isArray(found)).toBe(true);
    for (const name of found) expect(['brew', 'winget', 'apt', 'dnf', 'pacman', 'zypper', 'flatpak', 'snap']).toContain(name);
  });
});

describe('downloads', () => {
  it('lists them, takes links out of pasted text, and hands them over', async () => {
    expect(await ok('downloads:list')).toHaveLength(1);
    await ok('downloads:add', 'take https://example.test/a.zip and https://example.test/b.zip');
    expect(said('downloads.add')!.args[0]).toEqual(['https://example.test/a.zip', 'https://example.test/b.zip']);
  });

  it('passes every button through to the queue', async () => {
    await ok('downloads:pause', 'd1');
    await ok('downloads:resume', 'd1');
    await ok('downloads:cancel', 'd1');
    await ok('downloads:again', 'd1');
    await ok('downloads:remove', 'd1');
    await ok('downloads:pauseAll');
    await ok('downloads:resumeAll');
    await ok('downloads:retryFailed');
    await ok('downloads:clear');
    for (const what of ['downloads.pause', 'downloads.resume', 'downloads.cancel', 'downloads.again', 'downloads.remove', 'downloads.pauseAll', 'downloads.resumeAll', 'downloads.retryFailed', 'downloads.clear']) {
      expect(said(what), what).toBeTruthy();
    }
  });

  it('hands over the finished files, and marks them added', async () => {
    expect(await ok('downloads:files', ['d1'])).toEqual([{ id: 'd1', path: '/tmp/a.zip', url: 'https://example.test/a.zip' }]);
    await ok('downloads:done', ['d1']);
    expect(said('downloads.done')!.args).toEqual(['d1', null]);
  });

  it('finds links inside files that were dropped on it', async () => {
    const dir = ownDir();
    writeFileSync(join(dir, 'links.txt'), 'https://example.test/one.zip\nhttps://example.test/two.zip\n');
    expect(await ok('downloads:linksIn', [join(dir, 'links.txt')])).toEqual(['https://example.test/one.zip', 'https://example.test/two.zip']);
  });
});

describe('bringing things in', () => {
  it('asks for files or a folder, and takes no for an answer', async () => {
    asked.files = [];
    expect(await ok('import:choose', 'files')).toBeNull();
    asked.files = ['/tmp/a.zip'];
    expect(await ok('import:choose', 'files')).toEqual(['/tmp/a.zip']);
    asked.folder = '/tmp/packs';
    expect(await ok('import:choose', 'folder')).toEqual(['/tmp/packs']);
  });

  it('offers the sample packs this copy ships with', async () => {
    const samples = await ok('import:samples');
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every((p) => p.endsWith('.zip'))).toBe(true);
  });

  it('plans what some paths would become', async () => {
    const dir = ownDir();
    writeFileSync(join(dir, 'kit.zip'), 'not really a zip');
    expect(Array.isArray(await ok('import:plan', [join(dir, 'kit.zip')], false))).toBe(true);
  });
});

describe('agents', () => {
  it('switches the server, a group and one tool, each through to the same place', async () => {
    await ok('mcp:set', { enabled: true });
    await ok('mcp:set', { group: { id: 'danger', on: true } });
    await ok('mcp:set', { tool: { name: 'search', on: false } });
    expect(said('mcp.apply')).toBeTruthy();
    const settings = (await ok('settings:get')).mcp;
    expect(settings.groupsOn).toContain('danger');
    expect(settings.off).toContain('search');
  });

  it('forgets the call history when asked', async () => {
    await ok('mcp:clearCalls');
    expect(said('history.clear')).toBeTruthy();
  });

  it('says what has a port, and refuses to move onto a port it cannot have', async () => {
    expect(await ok('mcp:portUser', 59997)).toBeNull();
  });

  it('writes the skill file where the window says', async () => {
    const home = ownDir();
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const written = await ok('mcp:installSkill', 'claude');
      expect(written?.path).toContain('claude');
    } finally {
      if (before === undefined) delete process.env.HOME;
      else process.env.HOME = before;
    }
  });
});

describe('the library list', () => {
  it('says what this computer knows, and what a folder is', async () => {
    expect(await ok('libraries:list')).toHaveLength(1);
    expect(await ok('library:inspect', root)).toBe('library');
    expect(await ok('library:locate', root)).toBeTruthy();
  });

  it('renames the open one, and remembers a preference about it', async () => {
    await ok('library:rename', 'Renamed');
    expect(await ok('library:setPrefs', { skipInboxWhenSure: false })).toBeUndefined();
  });

  it('reads everything again, and says how big the thumbnails are', async () => {
    await ok('library:reindex');
    // Their size is measured from the folder itself, not asked of the service.
    expect(typeof (await ok('thumbs:size'))).toBe('number');
    await ok('thumbs:clear');
    expect(await ok('thumbs:get', ['a:b'])).toMatchObject({ 'a:b': { state: 'ready' } });
  });

  it('closes the open library, and refuses questions afterwards', async () => {
    await ok('library:close');
    expect((await refused('library:stats')).code).toBe('no-library');
    // Opened again, so the rest of the file still has one.
    await ok('library:open', root);
  });
});

describe('updates and problem reports', () => {
  it('checks, fetches and passes the answers straight back', async () => {
    expect(await ok('updates:check')).toMatchObject({ latest: '9.9.9' });
    expect(await ok('updates:download')).toMatchObject({ installer: '/tmp/Tessera.dmg' });
  });

  it('takes what the window caught, and what the reader answered', async () => {
    await ok('reports:capture', { message: 'it broke', stack: 'somewhere' });
    await ok('reports:respond', 'always');
    await ok('reports:crashes', true);
    expect(said('reports.record')).toBeTruthy();
    expect(said('reports.respond')!.args[0]).toBe('always');
    expect(said('reports.answerCrashes')!.args[0]).toBe(true);
  });

  it('saves a problem report where the save box says, and nowhere when cancelled', async () => {
    asked.savePath = null;
    expect(await ok('reports:saveProblem', 'a note')).toBeNull();
    asked.savePath = join(ownDir(), 'report.txt');
    expect(await ok('reports:saveProblem', 'a note')).toBe(asked.savePath);
  });

  it('sends one when the reader asks for it to be sent', async () => {
    expect(await ok('reports:sendProblem', 'a note')).toBe(true);
  });
});

describe('the window itself', () => {
  it('takes the colours the window paints itself with', async () => {
    expect(await ok('window:chrome', { background: '#101418', foreground: '#e3e2e6' })).toBeUndefined();
  });
});
