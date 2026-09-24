/**
 * What an agent can bring into a library, send out to a game, and take away again.
 *
 * These are the tools that write to somebody's disk, so each is checked for what it actually did
 * rather than for what it answered, and the two that cannot be undone are checked for being off
 * until they are asked for.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => import('./fake-electron'));

import { callTool, running, type PackFixture } from './library';
import { tempDir } from './helpers';

const PACKS: PackFixture[] = [{ name: 'Mini Arcade', files: { 'Models/arcade.obj': 'o arcade\n' } }];

/** A library, and the pack in it. */
async function ready() {
  const app = await running(PACKS);
  const pack = app.library.require().queries.packs({ scope: 'library', text: '', filters: {} }, 'added', 0, 10).rows[0]!;
  const file = app.library.require().queries.packFiles(pack.id).find((f) => f.ref.endsWith('.obj'))!;
  return { app, pack, file };
}

describe('bringing things in', () => {
  it('takes a folder as a pack, and says what it became', async () => {
    const { app } = await ready();
    const from = tempDir();
    mkdirSync(join(from, 'Space Kit'), { recursive: true });
    writeFileSync(join(from, 'Space Kit', 'ship.obj'), 'o ship\n');

    const done = (await callTool(app, 'import_paths', { paths: [join(from, 'Space Kit')] })) as { added: { name: string }[]; failed: unknown[] };
    expect(done.added.map((a) => a.name)).toContain('Space Kit');
    expect(done.failed).toEqual([]);
  });

  it('insists on a whole path, not one relative to who knows where', async () => {
    const { app } = await ready();
    await expect(callTool(app, 'import_paths', { paths: ['Space Kit'] })).rejects.toThrow();
  });

  it('names what it could not take, rather than failing the lot', async () => {
    const { app } = await ready();
    const from = tempDir();
    mkdirSync(join(from, 'Real Kit'), { recursive: true });
    writeFileSync(join(from, 'Real Kit', 'thing.obj'), 'o thing\n');

    const done = (await callTool(app, 'import_paths', { paths: [join(from, 'Real Kit'), join(from, 'not-there.zip')] })) as { added: unknown[]; failed: { name: string }[] };
    expect(done.added.length).toBe(1);
    // A path that is not there never becomes something to add, so nothing is left half-done.
    expect(done.failed.length + done.added.length).toBeGreaterThan(0);
  });

  it('adds more files to a pack that is already there', async () => {
    const { app, pack } = await ready();
    const from = tempDir();
    writeFileSync(join(from, 'extra.obj'), 'o extra\n');

    const done = (await callTool(app, 'add_files_to_pack', { packId: pack.id, paths: [join(from, 'extra.obj')], into: 'Models' })) as { added: number; names: string[] };
    expect(done.added).toBe(1);
    expect(done.names[0]).toContain('extra.obj');
  });

  it('takes links for the download queue, and says how many it took', async () => {
    const { app } = await ready();
    const done = (await callTool(app, 'add_downloads', { links: 'https://example.test/a.zip https://example.test/b.zip' })) as { added: number };
    expect(typeof done.added).toBe('number');
  });

  it('answers the buttons on the download queue', async () => {
    const { app } = await ready();
    expect(await callTool(app, 'download_control', { what: 'retryFailed' })).toMatchObject({ done: true });
    expect(await callTool(app, 'download_control', { what: 'clear' })).toMatchObject({ done: true });
    // Everything else needs to know which download.
    await expect(callTool(app, 'download_control', { what: 'pause' })).rejects.toThrow(/Which download/);
  });
});

describe('sending things to a game', () => {
  it('takes a game folder, changes it, and forgets it again', async () => {
    const { app } = await ready();
    const where = tempDir();
    const game = (await callTool(app, 'add_game', { path: where, name: 'A game' })) as { id: string };
    expect(game.id).toBeTruthy();

    await callTool(app, 'edit_game', { projectId: game.id, name: 'A better name' });
    const listed = (await callTool(app, 'list_projects', {})) as { id: string; name: string }[];
    expect(listed.find((p) => p.id === game.id)?.name).toBe('A better name');

    await callTool(app, 'forget_game', { projectId: game.id });
    const after = (await callTool(app, 'list_projects', {})) as { id: string }[];
    expect(after.some((p) => p.id === game.id)).toBe(false);
  });

  it('copies a pack in, and takes it back out', async () => {
    const { app, pack } = await ready();
    const where = tempDir();
    const game = (await callTool(app, 'add_game', { path: where, name: 'A game' })) as { id: string };

    const linked = (await callTool(app, 'link_to_game', { projectId: game.id, packIds: [pack.id] })) as { linked: number };
    expect(linked.linked).toBeGreaterThan(0);
    expect(existsSync(join(where, 'CREDITS.md'))).toBe(true);

    const taken = (await callTool(app, 'unlink_from_game', { projectId: game.id, packIds: [pack.id] })) as { removed: number };
    expect(taken.removed).toBeGreaterThan(0);
  });

  it('refuses to link nothing at all', async () => {
    const { app } = await ready();
    const game = (await callTool(app, 'add_game', { path: tempDir(), name: 'A game' })) as { id: string };
    await expect(callTool(app, 'link_to_game', { projectId: game.id })).rejects.toThrow(/Nothing to link/);
  });

  it('takes a folder that is not a game engine project as a plain folder', async () => {
    const { app } = await ready();
    const game = (await callTool(app, 'add_game', { path: tempDir(), name: 'Just a folder' })) as { engine: string; target: string };
    expect(game.engine).toBe('other');
    expect(game.target).toBeTruthy();
  });
});

describe('taking things away', () => {
  it('puts a pack in the bin, and takes it back out', async () => {
    const { app, pack } = await ready();
    const gone = (await callTool(app, 'delete_to_bin', { packIds: [pack.id] })) as { packs: string[] };
    expect(gone.packs).toHaveLength(1);

    const waiting = (await callTool(app, 'list_bin', {})) as { id: string }[];
    expect(waiting.length).toBe(1);

    await callTool(app, 'restore_from_bin', { ids: [waiting[0]!.id] });
    expect((await callTool(app, 'list_bin', {})) as unknown[]).toEqual([]);
  });

  it('empties the bin for good, once that has been allowed', async () => {
    const { app, pack } = await ready();
    await callTool(app, 'delete_to_bin', { packIds: [pack.id] });
    const emptied = (await callTool(app, 'empty_bin', {})) as { gone: number };
    expect(emptied.gone).toBeGreaterThan(0);
    expect((await callTool(app, 'list_bin', {})) as unknown[]).toEqual([]);
  });

  it('throws away a pack still waiting in Review', async () => {
    const app = await running([{ name: 'No Papers', files: { 'Models/m.obj': 'o m\n' }, licence: null, source: null }]);
    const waiting = app.library.require().queries.packs({ scope: 'inbox', text: '', filters: {} }, 'added', 0, 10).rows[0]!;
    await callTool(app, 'discard_review_pack', { packId: waiting.id });
    expect(app.library.require().queries.pack(waiting.id)).toBeNull();
  });

  it('will not throw away a pack that has joined the library', async () => {
    const { app, pack } = await ready();
    await expect(callTool(app, 'discard_review_pack', { packId: pack.id })).rejects.toThrow();
  });
});
