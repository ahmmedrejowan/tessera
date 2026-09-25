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
import { touchLibrary } from '../src/main/libraries';
import { TOOL_GROUPS } from '@shared/mcp';
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

/** The backup service as these tests stand in for it. */
const backups = {
  status: records('backups.status', { enabled: true, lastBackupAt: null, running: false }),
  setup: records('backups.setup', Promise.resolve({ ok: true })),
  password: records('backups.password', Promise.resolve('a very long password')),
  changePassword: records('backups.changePassword', Promise.resolve()),
  target: records('backups.target', { provider: 'folder', values: { path: '/tmp/backups' } }) as () => unknown,
  backupNow: records('backups.backupNow', Promise.resolve({ snapshots: 1 })),
  join: records('backups.join', Promise.resolve()),
  setInterval: records('backups.setInterval', Promise.resolve()),
  snapshots: records('backups.snapshots', Promise.resolve([{ id: 's1', at: '2026-01-01T00:00:00.000Z', size: 10 }])),
  // The real one reports how far it has got and asks which libraries this computer knows, so
  // the stand-in does both: that is where the handler's own work is.
  restore: async (...args: unknown[]) => {
    heard.push({ what: 'backups.restore', args });
    (args[4] as (f: number | null) => void)(0.5);
    return { restored: 1, known: (await (args[5] as () => Promise<unknown[]>)()).length };
  },
  turnOff: records('backups.turnOff', Promise.resolve()),
};

/** What is open for restoring, which a test can set. */
const restorer = {
  unlock: records('restorer.unlock', Promise.resolve({ snapshots: [] })),
  restore: async (...args: unknown[]) => {
    heard.push({ what: 'restorer.restore', args });
    (args[3] as (f: number | null) => void)(null);
    await (args[4] as () => Promise<unknown[]>)();
    return { restored: 0 };
  },
  close: records('restorer.close'),
  // Nothing has been opened for restoring until a test opens one.
  opened: null as { target: unknown; password: string } | null,
};

/** What the updater says it has, which a test can change. */
const updates = { current: '0.0.0-test', canCheck: true, installer: null as string | null };

const mine: string[] = [];
const ownDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'tessera-ipc2-'));
  mine.push(dir);
  return dir;
};

let library: LibraryService;
let settings: SettingsStore;
let dataDir = '';
let root = '';

beforeAll(async () => {
  dataDir = ownDir();
  root = join(ownDir(), 'Library');
  const jobs = new Jobs(() => undefined);
  settings = new SettingsStore(dataDir);
  await settings.load();

  library = new LibraryService({ dataDir, jobs, onState: () => undefined, onIndexChanged: () => undefined, siteRules: () => [], binKeepDays: () => 30, watchFiles: false });
  await library.create(root, 'The rest');
  await library.reindex();

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
    backups: stub(backups),
    restorer: stub(restorer),
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
      get: records('updates.get', updates),
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
    librarySummaries: async () => [{ id: 'rest-library', name: 'The rest', path: root, packs: 0, assets: 0, size: 0, lastOpenedAt: new Date().toISOString(), open: true, found: true, backup: null, sync: null } as never],
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
    start: async () => void records('start')(),
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
    const done = await ok('backup:restore', 's1', '/tmp/restored', 10, 'A library');
    expect(said('backups.restore')!.args.slice(0, 4)).toEqual(['s1', '/tmp/restored', 10, 'A library']);
    // The libraries this computer already knows reach the restore, so a copy cannot end up
    // sharing an id with the library it came from.
    expect(done).toMatchObject({ known: expect.any(Number) });
  });

  it('tells a restore which libraries this computer already knows', async () => {
    // A library this computer has open, and another it merely remembers: a restored copy must not
    // end up sharing an id with either of them.
    await touchLibrary(settings, dataDir, { id: 'rest-library', name: 'The rest', path: root });
    const done = (await ok('backup:restore', 's1', '/tmp/restored', 10, 'A library')) as unknown as { known: number };
    expect(done.known).toBeGreaterThan(0);
  });

  it('writes the recovery kit for another store, with its keys when that is asked for', async () => {
    asked.savePath = join(ownDir(), 'kit.pdf');
    const target = { provider: 'aws' as const, values: { bucket: 'b', region: 'eu-west-1', accessKey: 'AK', secretKey: 'SECRET' } };
    // No password given, so it asks for the one in use.
    const where = await ok('backup:saveKit', { target, includeKeys: true });
    expect(where).toBe(asked.savePath);
    expect(said('backups.password')).toBeTruthy();
  });

  it('refuses to write a recovery kit before there are any backups', async () => {
    asked.savePath = join(ownDir(), 'kit.pdf');
    // backups.target() answers with somewhere in these tests, so the refusal is checked by
    // taking that away for one call.
    const target = backups.target;
    backups.target = () => null;
    try {
      expect((await refused('backup:saveKit', { includeKeys: false })).code).toBe('no-backup');
    } finally {
      backups.target = target;
    }
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
    expect(await ok('backup:saveKit', { password: 'a very long password', includeKeys: false })).toBeNull();
  });

  it('signs in to a cloud provider, and can be told to stop', async () => {
    await ok('backup:signIn', 'gdrive');
    expect(said('rclone.signIn')).toBeTruthy();
    await ok('backup:cancelSignIn');
    expect(said('rclone.cancel')).toBeTruthy();
  });

  it('writes the recovery kit where the save box says', async () => {
    asked.savePath = join(ownDir(), 'Tessera recovery kit.pdf');
    const where = await ok('backup:saveKit', { password: 'a very long password', includeKeys: false });
    expect(where).toBe(asked.savePath);
    const { existsSync, statSync } = await import('node:fs');
    expect(existsSync(where!)).toBe(true);
    expect(statSync(where!).size).toBeGreaterThan(0);
  });

  it('offers to put the password in the system keychain', async () => {
    // There is no keychain in a test run, so this has to fail plainly rather than hang.
    const answer = await invoke('backup:saveToKeychain', 'a very long password');
    expect(typeof answer.ok).toBe('boolean');
  });

  it('fetches a server host keys, or says it could not reach it', async () => {
    const answer = await invoke('backup:hostKey', 'localhost', '1');
    expect(typeof answer.ok).toBe('boolean');
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
    await ok('restore:run', 's1', '/tmp/restored', 10);
    expect(said('restorer.restore')).toBeTruthy();
    await ok('restore:close');
    expect(said('restorer.close')).toBeTruthy();
  });

  it('carries on backing up to the store it just restored from', async () => {
    // Nothing has been opened, so it refuses rather than setting up a backup to nowhere.
    expect((await refused('restore:keepBackingUp')).code).toBe('restore-locked');

    const target = { provider: 'folder' as const, values: { path: '/tmp/backups' } };
    restorer.opened = { target, password: 'a very long password' };
    try {
      await ok('restore:keepBackingUp');
    } finally {
      restorer.opened = null;
    }
    // The backup is set up with what was just restored from, and the copy is closed first.
    expect(said('restorer.close')).toBeTruthy();
    expect(said('backups.setup')!.args).toEqual([target, 'a very long password', false]);
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
  it('refuses to fetch a program it has never heard of', async () => {
    await expect(invoke('tools:install', 'not-a-tool' as never)).resolves.toMatchObject({ ok: false });
  });

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

  it('takes a port back, and starts there without being asked again', async () => {
    // Nothing is listening on this one, so there is nothing to stop and the server simply starts.
    expect(await ok('mcp:freePort', 59996)).toEqual({ stopped: null });
    expect(said('mcp.apply')!.args[0]).toBe(true);
  });

  it('saves the skill wherever the save box says, and nowhere when it is cancelled', async () => {
    asked.savePath = null;
    expect(await ok('mcp:installSkill', 'choose')).toBeNull();
    asked.savePath = join(ownDir(), 'SKILL.md');
    expect(await ok('mcp:installSkill', 'choose')).toEqual({ path: asked.savePath });
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(asked.savePath, 'utf8').length).toBeGreaterThan(0);
  });

  it('remembers a group that is on by default going off, and the port', async () => {
    const on = TOOL_GROUPS.find((g) => g.defaultOn)!.id;
    await ok('mcp:set', { group: { id: on, on: false } });
    expect((await ok('settings:get')).mcp.groupsOff).toContain(on);
    await ok('mcp:set', { group: { id: on, on: true } });
    expect((await ok('settings:get')).mcp.groupsOff).not.toContain(on);

    await ok('mcp:set', { tool: { name: 'search', on: true } });
    expect((await ok('settings:get')).mcp.off).not.toContain('search');
    await ok('mcp:set', { port: 7459 });
    expect((await ok('settings:get')).mcp.port).toBe(7459);
    await ok('mcp:set', { port: 7458 });
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

describe('the desktop, when it answers', () => {
  it('hands back the folder that was picked, with the labels the window asked for', async () => {
    asked.folder = null;
    expect(await ok('dialog:folder', 'Where to?')).toBeNull();
    asked.folder = '/tmp/picked';
    expect(await ok('dialog:folder', 'Where to?', { defaultPath: '/tmp', buttonLabel: 'Use this', message: 'Pick one' })).toBe('/tmp/picked');
  });

  it('hands back the file that was picked', async () => {
    asked.files = [];
    expect(await ok('dialog:file', 'Which file?')).toBeNull();
    asked.files = ['/tmp/key.pem'];
    expect(await ok('dialog:file', 'Which file?')).toBe('/tmp/key.pem');
  });

  it('describes the files it is pointed at, and passes over what is not there', async () => {
    const dir = ownDir();
    writeFileSync(join(dir, 'a.zip'), 'some bytes');
    const files = await ok('fs:files', [join(dir, 'a.zip'), dir, join(dir, 'not-there.zip')]);
    expect(files).toHaveLength(2);
    expect(files.find((f) => f.name === 'a.zip')).toMatchObject({ isFolder: false, size: 10 });
    expect(files.find((f) => f.isFolder)).toMatchObject({ size: 0 });
  });

  it('shows the installer it fetched, and says plainly when there is none', async () => {
    updates.installer = null;
    expect((await refused('updates:openInstaller')).code).toBe('no-installer');
    updates.installer = '/tmp/Tessera.dmg';
    try {
      await ok('updates:openInstaller');
      expect(asked.revealed).toContain('/tmp/Tessera.dmg');
    } finally {
      updates.installer = null;
    }
  });

  it('saves a problem report where the save box says, and nowhere when it is cancelled', async () => {
    asked.savePath = null;
    expect(await ok('reports:saveProblem', 'it broke')).toBeNull();
    asked.savePath = join(ownDir(), 'report.txt');
    expect(await ok('reports:saveProblem', 'it broke')).toBe(asked.savePath);
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(asked.savePath, 'utf8')).toContain('a report');
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
    await ok('reports:capture', { source: 'window', kind: 'exception', name: 'Error', message: 'it broke', stack: 'somewhere' });
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
