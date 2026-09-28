import { beforeEach, describe, expect, it } from 'vitest';
import { callTool, running, type Running } from './library';

/**
 * The tools that set syncing up.
 *
 * Syncing is the one job in the app that has to be done twice, on two computers, in the right
 * order, so it is the one most worth handing to an agent, and the one where a tool that lies
 * about what it did costs the most. Every one of them is exercised here.
 */
describe('an agent setting syncing up', () => {
  let app: Running;
  beforeEach(async () => {
    app = await running([{ name: 'Arcade', files: { 'Models/a.obj': 'o a\n' }, licence: 'CC0-1.0', source: 'kenney' }]);
  });

  it('reads how syncing stands without changing it', async () => {
    app.syncState.enabled = true;
    app.syncState.devices = [{ id: 'AAA', name: 'Desktop PC', connected: true, shared: true, completion: 100 }];
    const s = (await callTool(app, 'sync_status', {})) as { syncthing: string; on: boolean; thisComputer: string; computers: { name: string; hasThisLibrary: boolean }[] };
    expect(s.syncthing).toBe('already on this computer');
    expect(s.on).toBe(true);
    expect(s.thisComputer).toBe('ABCDEFG-HIJKLMN');
    expect(s.computers[0]).toMatchObject({ name: 'Desktop PC', hasThisLibrary: true });
    // Reading is all it did.
    expect(app.syncCalls).toEqual([]);
  });

  it('fetches Syncthing only when it is not already here', async () => {
    await callTool(app, 'set_up_sync', { mode: 'pull' });
    expect(app.syncCalls).toEqual(['enable:pull']);

    app.syncState.available = false;
    app.syncCalls.length = 0;
    const again = (await callTool(app, 'set_up_sync', {})) as { syncthing: string };
    expect(again.syncthing).toMatch(/fetched/);
    expect(app.syncCalls).toEqual(['install', 'enable:push']);
  });

  it('shares with a computer once it is paired, and says what has to happen next', async () => {
    app.syncState.devices = [{ id: 'AAA', name: 'Desktop PC', connected: true, shared: false, completion: 0 }];
    const shared = (await callTool(app, 'share_library_with', { deviceId: 'AAA' })) as { offered: boolean; next: string };
    expect(shared.offered).toBe(true);
    expect(shared.next).toMatch(/accept/i);
    expect(app.syncCalls).toContain('pair:AAA:Desktop PC');

    // Offering it twice is not an error, and does not ask again.
    app.syncState.devices = [{ id: 'AAA', name: 'Desktop PC', connected: true, shared: true, completion: 0 }];
    app.syncCalls.length = 0;
    expect(await callTool(app, 'share_library_with', { deviceId: 'AAA' })).toEqual({ alreadyShared: true, name: 'Desktop PC' });
    expect(app.syncCalls).toEqual([]);
  });

  it('takes a library another computer is offering', async () => {
    const took = (await callTool(app, 'accept_shared_library', { folderId: 'f1', offeredBy: 'AAA', label: 'Toy Town', path: '/tmp/toy-town', mode: 'pull' })) as { accepted: boolean; into: string };
    expect(took).toEqual({ accepted: true, into: '/tmp/toy-town' });
    expect(app.syncCalls).toContain('accept:f1');
  });

  it('gives this computer’s id, starting Syncthing if it has to', async () => {
    expect(await callTool(app, 'show_my_device_id', {})).toEqual({ thisComputer: 'ABCDEFG-HIJKLMN' });
    // Already had an id, so nothing needed starting.
    expect(app.syncCalls).toEqual([]);
  });

  it('unpairs a computer, and refuses a change that says nothing', async () => {
    await callTool(app, 'change_sync', { unpair: 'AAA', off: true });
    expect(app.syncCalls).toContain('unpair:AAA');
    expect(app.syncCalls).toContain('disable');
    await expect(callTool(app, 'change_sync', {})).rejects.toThrow();
  });

  it('reports previews and syncing together, for "is this library safe"', async () => {
    const kept = (await callTool(app, 'how_it_is_kept', {})) as { previews: { bytes: number; drawingNow: boolean }; sync: { on: boolean }; backup: { setUp: boolean } };
    expect(kept.previews).toMatchObject({ bytes: 0, drawingNow: false });
    expect(typeof kept.sync.on).toBe('boolean');
    expect(typeof kept.backup.setUp).toBe('boolean');
  });
});
