import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { touchLibrary } from '../src/main/libraries';
import { SettingsStore } from '../src/main/settings';
import { FOLDER_TYPE, SyncService } from '../src/main/sync/service';
import { tempDir } from './helpers';

const ME = 'AAAAAAA-BBBBBBB-CCCCCCC-DDDDDDD-EEEEEEE-FFFFFFF-GGGGGGG-HHHHHHH';
const OTHER = 'IIIIIII-JJJJJJJ-KKKKKKK-LLLLLLL-MMMMMMM-NNNNNNN-OOOOOOO-PPPPPPP';

/** Just enough of Syncthing's REST API to check what Tessera asks of it. */
function fakeSyncthing() {
  const state = { folders: [] as Record<string, unknown>[], devices: [{ deviceID: ME, name: 'this' }] as Record<string, unknown>[], keys: new Set<string>() };
  const server: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      state.keys.add(String(req.headers['x-api-key']));
      const url = new URL(req.url!, 'http://x');
      const json = (v: unknown) => res.end(JSON.stringify(v));
      const data = body ? JSON.parse(body) : null;
      const parts = url.pathname.split('/').filter(Boolean);
      if (url.pathname === '/rest/system/status') return json({ myID: ME });
      if (url.pathname === '/rest/system/connections') return json({ connections: { [OTHER]: { connected: true } } });
      if (url.pathname === '/rest/db/status') return json({ state: 'idle', needFiles: 0, needBytes: 0, globalBytes: 10, inSyncBytes: 10, errors: 0 });
      if (url.pathname === '/rest/db/completion') return json({ completion: 100 });
      if (url.pathname.startsWith('/rest/cluster/pending')) return json({});
      const list = parts[2] === 'folders' ? state.folders : state.devices;
      const key = parts[2] === 'folders' ? 'id' : 'deviceID';
      if (parts.length === 3) {
        if (req.method === 'GET') return json(list);
        list.push(data);
        return json({});
      }
      const i = list.findIndex((x) => x[key] === parts[3]);
      if (req.method === 'PATCH') Object.assign(list[i]!, data);
      if (req.method === 'DELETE') list.splice(i, 1);
      return json(i >= 0 ? list[i] : {});
    });
  });
  return { server, state };
}

let server: Server | null = null;
afterEach(() => server?.close());

describe('sync', () => {
  it('shares the library in the chosen mode, pairs computers and switches modes', async () => {
    const fake = fakeSyncthing();
    server = fake.server;
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    const dataDir = tempDir();
    const settings = new SettingsStore(dataDir);
    await settings.load();
    const lib1 = { id: 'lib1', name: 'My Library', path: '/libraries/mine' };
    await touchLibrary(settings, dataDir, lib1);
    const sync = new SyncService({
      dataDir,
      settings,
      library: () => lib1,
      onChange: () => undefined,
      launcher: async () => ({ base: `http://127.0.0.1:${port}`, key: 'secret', stop: () => undefined }),
    });

    await sync.enable('push');
    expect(fake.state.folders).toMatchObject([{ id: 'tessera-lib1', path: '/libraries/mine', type: FOLDER_TYPE.push, label: 'My Library' }]);
    expect(settings.get().libraries.lib1?.sync).toEqual({ enabled: true, mode: 'push', whileClosed: true });

    await expect(sync.addDevice('not an id', 'x')).rejects.toMatchObject({ code: 'bad-device-id' });
    await expect(sync.addDevice(ME, 'me')).rejects.toMatchObject({ code: 'own-device' });
    await sync.addDevice(OTHER.toLowerCase(), 'Desktop PC');
    expect(fake.state.devices.map((d) => d.deviceID)).toEqual([ME, OTHER]);
    expect(fake.state.folders[0]!.devices).toEqual([{ deviceID: OTHER }]);

    await sync.setMode('full');
    expect(fake.state.folders[0]).toMatchObject({ type: 'sendreceive', versioning: { type: 'trashcan', params: { cleanoutDays: '30' } } });

    const status = await sync.status();
    expect(status).toMatchObject({ enabled: true, mode: 'full', myId: ME, devices: [{ id: OTHER, name: 'Desktop PC', connected: true, shared: true, completion: 100 }], folder: { state: 'idle' } });
    expect([...fake.state.keys]).toEqual(['secret']);

    await sync.disable();
    expect(fake.state.folders[0]).toMatchObject({ paused: true });
    expect(settings.get().libraries.lib1?.sync.enabled).toBe(false);
  });

  it('keeps a library syncing while another is open, only when it may', async () => {
    const fake = fakeSyncthing();
    server = fake.server;
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    const dataDir = tempDir();
    const settings = new SettingsStore(dataDir);
    await settings.load();
    const work = { id: 'work', name: 'Work', path: '/libraries/work' };
    const home = { id: 'home', name: 'Home', path: '/libraries/home' };
    let open: typeof work | null = work;
    const sync = new SyncService({ dataDir, settings, library: () => open, onChange: () => undefined, launcher: async () => ({ base: `http://127.0.0.1:${port}`, key: 'k', stop: () => undefined }) });
    const switchTo = async (lib: typeof work | null) => {
      open = lib;
      if (lib) await touchLibrary(settings, dataDir, lib);
      await sync.reconcile();
    };
    const folder = (id: string) => fake.state.folders.find((f) => f.id === `tessera-${id}`);

    await switchTo(work);
    await sync.enable('full');
    // Home has sync off: opening it leaves Work syncing (it may while not open).
    await switchTo(home);
    expect(folder('work')?.paused).toBe(false);
    expect(folder('home')).toBeUndefined();
    expect((await sync.status()).enabled).toBe(false);

    // Work only while open: switching away pauses it, back resumes it.
    await switchTo(work);
    await sync.setWhileClosed(false);
    await switchTo(home);
    expect(folder('work')?.paused).toBe(true);
    await switchTo(null);
    expect(folder('work')?.paused).toBe(true);
    await switchTo(work);
    expect(folder('work')?.paused).toBe(false);
    expect((await sync.status())).toMatchObject({ enabled: true, whileClosed: false });

    // A folder Tessera doesn't know (a library still arriving) is left alone.
    fake.state.folders.push({ id: 'tessera-arriving', path: '/x', paused: false, devices: [] });
    await switchTo(home);
    expect(folder('arriving')?.paused).toBe(false);
  });
});

describe('sync, the rest of it', () => {
  /** A service pointed at a fake Syncthing, with one library open. */
  async function paired() {
    const fake = fakeSyncthing();
    server = fake.server;
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    const dataDir = tempDir();
    const settings = new SettingsStore(dataDir);
    await settings.load();
    const lib = { id: 'lib1', name: 'My Library', path: '/libraries/mine' };
    await touchLibrary(settings, dataDir, lib);
    let changes = 0;
    const sync = new SyncService({
      dataDir,
      settings,
      library: () => lib,
      onChange: () => void (changes += 1),
      launcher: async () => ({ base: `http://127.0.0.1:${port}`, key: 'secret', stop: () => undefined }),
    });
    return { sync, fake, settings, dataDir, changed: () => changes };
  }

  it('says nothing is set up before anything is', async () => {
    const { sync } = await paired();
    const status = await sync.status();
    expect(status.enabled).toBe(false);
  });

  it('stops sharing with one computer', async () => {
    const { sync, fake } = await paired();
    await sync.enable('full');
    await sync.addDevice(OTHER, 'Desktop PC');
    expect(fake.state.devices.map((d) => d.deviceID)).toContain(OTHER);

    await sync.removeDevice(OTHER);
    expect(fake.state.devices.map((d) => d.deviceID)).not.toContain(OTHER);
  });

  it('refuses a device id that is not one', async () => {
    const { sync } = await paired();
    await sync.enable('full');
    await expect(sync.addDevice('nonsense', 'x')).rejects.toMatchObject({ code: 'bad-device-id' });
  });

  it('waits to be sent a library, and then knows which computer this is', async () => {
    const { sync } = await paired();
    await sync.startForReceiving();
    expect((await sync.status()).myId).toBe(ME);
  });

  it('takes a library another computer offered, and says how far it has got', async () => {
    const { sync, fake } = await paired();
    await sync.startForReceiving();
    const where = join(tempDir(), 'Arriving');
    await sync.acceptFolder('tessera-theirs', OTHER, 'Their Library', where, 'full');
    expect(fake.state.folders.map((f) => f.id)).toContain('tessera-theirs');

    const progress = await sync.folderProgress('tessera-theirs');
    expect(progress).toMatchObject({ state: 'idle' });
  });

  it('shuts the helper down without complaining twice', async () => {
    const { sync } = await paired();
    await sync.enable('full');
    await sync.shutdown();
    await sync.shutdown();
  });

  it('says whether the helper program is there, and whether it is Tessera own copy', async () => {
    const { sync } = await paired();
    expect(typeof sync.available()).toBe('boolean');
    // A test drives it through a launcher of its own, so it is never the bundled one.
    expect(sync.bundled()).toBe(false);
  });

  it('refuses a folder that already has something in it', async () => {
    const { sync } = await paired();
    await sync.startForReceiving();
    const busy = tempDir();
    writeFileSync(join(busy, 'already-here.txt'), 'something');
    await expect(sync.acceptFolder('tessera-x', OTHER, 'Theirs', busy, 'full')).rejects.toMatchObject({ code: 'folder-not-empty' });
  });
});
