/**
 * What an agent can change about a library: stars, collections, a pack's details, its licence, and
 * putting it away. Every one of these writes to somebody's own files, so each is checked on both
 * sides: what the tool answered, and what the library says afterwards.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => import('./fake-electron'));

import { callTool, running, PIXEL, type PackFixture } from './library';

const PACKS: PackFixture[] = [
  { name: 'Mini Arcade', files: { 'Models/arcade.obj': 'o arcade\n', 'cover.png': PIXEL } },
  { name: 'Interface Sounds', files: { 'Audio/click.wav': 'RIFF....WAVE' } },
];

/** The library, with the pack most tests here work on. */
async function ready() {
  const app = await running(PACKS);
  const packs = app.library.require().queries.packs({ scope: 'library', text: '', filters: {} }, 'added', 0, 10).rows;
  const arcade = packs.find((p) => p.name === 'Mini Arcade')!;
  const file = app.library.require().queries.packFiles(arcade.id).find((f) => f.ref.endsWith('.obj'))!;
  return { app, arcade, file, packs };
}

const pack = (app: Awaited<ReturnType<typeof ready>>['app'], id: string) => app.library.require().queries.pack(id);

describe('starring', () => {
  it('stars a pack and takes the star off again', async () => {
    const { app, arcade } = await ready();
    await callTool(app, 'star', { packIds: [arcade.id], on: true });
    expect(pack(app, arcade.id)?.fav).toBe(true);

    await callTool(app, 'star', { packIds: [arcade.id], on: false });
    await app.library.sync();
    expect(pack(app, arcade.id)?.fav).toBe(false);
  });

  it('stars single files, by the id the library gives them', async () => {
    const { app, arcade, file } = await ready();
    await callTool(app, 'star', { assetIds: [file.id], on: true });
    expect((await app.library.collectionsHolding(arcade.id, file.ref)).length).toBe(1);
  });
});

describe('collections', () => {
  it('makes one, adds to it, takes from it, renames it and deletes it', async () => {
    const { app, arcade } = await ready();
    const made = (await callTool(app, 'create_collection', { name: 'For the jam' })) as { id: string };
    expect(made.id).toBeTruthy();

    await callTool(app, 'add_to_collection', { collectionId: made.id, packIds: [arcade.id] });
    expect((await app.library.collectionsHolding(arcade.id)).some((c) => c.id === made.id)).toBe(true);

    await callTool(app, 'remove_from_collection', { collectionId: made.id, packIds: [arcade.id] });
    expect((await app.library.collectionsHolding(arcade.id)).some((c) => c.id === made.id)).toBe(false);

    await callTool(app, 'edit_collection', { collectionId: made.id, name: 'Renamed' });
    expect((await app.library.collections()).find((c) => c.id === made.id)?.name).toBe('Renamed');

    await callTool(app, 'delete_collection', { collectionId: made.id });
    expect((await app.library.collections()).some((c) => c.id === made.id)).toBe(false);
  });

  it('refuses over a collection that is not there', async () => {
    const { app, arcade } = await ready();
    void arcade;
    await expect(callTool(app, 'edit_collection', { collectionId: 'nope', name: 'x' })).rejects.toThrow();
    await expect(callTool(app, 'delete_collection', { collectionId: 'nope' })).rejects.toThrow();
  });
});

describe('what a pack says about itself', () => {
  it('sets its details, and they are on record afterwards', async () => {
    const { app, arcade } = await ready();
    await callTool(app, 'set_pack_details', {
      packId: arcade.id,
      name: 'Arcade Deluxe',
      licence: 'CC-BY-4.0',
      attribution: 'By Someone',
      creator: 'Someone',
      sourceUrl: 'https://example.test/arcade',
      genres: ['arcade'],
      styles: ['pixel'],
      tags: ['retro'],
    });

    const row = pack(app, arcade.id)!;
    expect(row.name).toBe('Arcade Deluxe');
    expect(row.licence).toBe('CC-BY-4.0');
    expect(row.creator).toBe('Someone');
    expect(row.genres).toContain('arcade');
    expect(row.tags).toContain('retro');
  });

  it('gives one folder of a pack terms of its own', async () => {
    const { app, arcade } = await ready();
    const done = (await callTool(app, 'set_file_licence', { packId: arcade.id, path: 'Models', licence: 'CC-BY-4.0' })) as { files: number };
    expect(done.files).toBeGreaterThan(0);
    expect(pack(app, arcade.id)!.meta.licences.some((r) => r.path === 'Models')).toBe(true);
  });

  it('refuses a rule that would cover nothing, rather than reading as done', async () => {
    const { app, arcade } = await ready();
    await expect(callTool(app, 'set_file_licence', { packId: arcade.id, path: 'Nowhere', licence: 'CC0-1.0' })).rejects.toThrow(/Nothing in this pack/);
  });

  it('chooses the picture a pack is shown by', async () => {
    const { app, arcade } = await ready();
    const cover = app.library.require().queries.packFiles(arcade.id).find((f) => f.ref.endsWith('.png'))!;
    await callTool(app, 'set_pack_cover', { packId: arcade.id, path: cover.ref.replace(/^original\//, '') });
    await app.library.sync();
    expect(pack(app, arcade.id)?.coverRef).toBeTruthy();
  });

  it('puts a pack away and brings it back', async () => {
    const { app, arcade } = await ready();
    await callTool(app, 'archive_pack', { packIds: [arcade.id], on: true });
    await app.library.sync();
    expect(pack(app, arcade.id)?.archived).toBe(true);

    await callTool(app, 'archive_pack', { packIds: [arcade.id], on: false });
    await app.library.sync();
    expect(pack(app, arcade.id)?.archived).toBe(false);
  });

  it('moves a pack out of Review once its papers are in order', async () => {
    const app = await running([{ name: 'No Papers', files: { 'Models/m.obj': 'o m\n' }, licence: null, source: null }]);
    const waiting = app.library.require().queries.packs({ scope: 'inbox', text: '', filters: {} }, 'added', 0, 10).rows[0]!;

    // It cannot join the library until it has both a licence and a source: a batch says which
    // were refused rather than failing the lot.
    const first = (await callTool(app, 'move_to_library', { packIds: [waiting.id] })) as { moved: string[]; refused: { why: string }[] };
    expect(first.moved).toEqual([]);
    expect(first.refused[0]!.why).toBeTruthy();

    await callTool(app, 'set_pack_details', { packId: waiting.id, licence: 'CC0-1.0', sourceName: 'Somewhere' });
    const second = (await callTool(app, 'move_to_library', { packIds: [waiting.id] })) as { moved: string[] };
    expect(second.moved).toEqual([waiting.id]);
    expect(app.library.require().queries.pack(waiting.id)?.status).toBe('library');
  });

  it('refuses over a pack that is not there', async () => {
    const { app } = await ready();
    await expect(callTool(app, 'set_pack_details', { packId: 'nope', name: 'x' })).rejects.toThrow();
    await expect(callTool(app, 'archive_pack', { packIds: ['nope'], on: true })).rejects.toThrow();
    await expect(callTool(app, 'set_pack_cover', { packId: 'nope', path: 'a' })).rejects.toThrow();
    await expect(callTool(app, 'star', { packIds: ['nope'], on: true })).rejects.toThrow();
  });
});
