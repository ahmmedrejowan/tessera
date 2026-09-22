import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
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
    const sync = new SyncService({
      dataDir,
      settings,
      library: () => ({ id: 'lib1', name: 'My Library', path: '/libraries/mine' }),
      onChange: () => undefined,
      launcher: async () => ({ base: `http://127.0.0.1:${port}`, key: 'secret', stop: () => undefined }),
    });

    await sync.enable('push');
    expect(fake.state.folders).toMatchObject([{ id: 'tessera-lib1', path: '/libraries/mine', type: FOLDER_TYPE.push, label: 'My Library' }]);
    expect(settings.get()).toMatchObject({ syncEnabled: true, syncMode: 'push' });

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
    expect(settings.get().syncEnabled).toBe(false);
  });
});
