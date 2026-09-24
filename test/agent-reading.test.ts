/**
 * Everything an agent can ask about a library without changing it.
 *
 * These are the tools an assistant leans on hardest, and the ones most likely to be called with
 * arguments nobody anticipated, so each is asked for something real and then for something that is
 * not there.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => import('./fake-electron'));

import { describeFolder, locateLibrary } from '../src/main/library/locate';
import { callTool, running, PIXEL, type PackFixture } from './library';
import { tempDir } from './helpers';

const PACKS: PackFixture[] = [
  { name: 'Mini Arcade', files: { 'Models/arcade.obj': 'o arcade\n', 'arcade.png': PIXEL } },
  { name: 'Interface Sounds', files: { 'Audio/click.wav': 'RIFF....WAVE' } },
  { name: 'No Papers', files: { 'Models/mystery.obj': 'o mystery\n' }, licence: null, source: null },
];

describe('what an agent can read', () => {
  it('says what the library holds and what needs attention', async () => {
    const app = await running(PACKS);
    const status = (await callTool(app, 'library_status', {})) as { open: boolean; packs: number };
    expect(status.open).toBe(true);
    expect(status.packs).toBeGreaterThan(0);
  });

  it('searches, and finds nothing without pretending otherwise', async () => {
    const app = await running(PACKS);
    const found = (await callTool(app, 'search', { text: 'arcade' })) as { total: number };
    expect(found.total).toBeGreaterThan(0);
    expect(((await callTool(app, 'search', { text: 'nothing-like-this-exists' })) as { total: number }).total).toBe(0);
  });

  it('lists packs and files, a page at a time', async () => {
    const app = await running(PACKS);
    const packs = (await callTool(app, 'list_packs', { limit: 2 })) as { packs: { id: string }[]; total: number };
    expect(packs.packs.length).toBeLessThanOrEqual(2);
    // A pack whose papers are not in order waits in Review, and is not one of the library's.
    expect(packs.total).toBe(2);

    const files = (await callTool(app, 'list_files', { packId: packs.packs[0]!.id, only: 'everything' })) as { total: number };
    expect(files.total).toBeGreaterThan(0);

    const assets = (await callTool(app, 'list_assets', { limit: 5 })) as { assets: unknown[] };
    expect(Array.isArray(assets.assets)).toBe(true);
  });

  it('reads one asset, and says plainly when there is no such thing', async () => {
    const app = await running(PACKS);
    const assets = (await callTool(app, 'list_assets', { limit: 1 })) as { assets: { id: number }[] };
    const one = assets.assets[0]!;
    expect((await callTool(app, 'get_asset', { assetId: one.id })) as { id: number }).toMatchObject({ id: one.id });
    await expect(callTool(app, 'get_asset', { assetId: 999_999 })).rejects.toThrow();
  });

  it('counts what there is to filter by', async () => {
    const app = await running(PACKS);
    expect(await callTool(app, 'list_facets', {})).toBeTruthy();
  });

  it('lists collections, games, the review queue, the bin and what has happened', async () => {
    const app = await running(PACKS);
    expect(await callTool(app, 'list_collections', {})).toBeTruthy();
    expect(await callTool(app, 'list_projects', {})).toBeTruthy();
    expect(await callTool(app, 'list_review', {})).toBeTruthy();
    expect(await callTool(app, 'list_bin', {})).toBeTruthy();
    expect(await callTool(app, 'list_activity', {})).toBeTruthy();
    expect(await callTool(app, 'list_downloads', {})).toBeTruthy();
  });

  it('says which packs are waiting because their papers are not in order', async () => {
    const app = await running(PACKS);
    const waiting = (await callTool(app, 'list_review', {})) as { name: string; needs: string[] }[];
    const mystery = waiting.find((p) => p.name === 'No Papers');
    expect(mystery).toBeTruthy();
    expect(mystery!.needs.sort()).toEqual(['licence', 'source']);
  });

  it('lists the folders inside a pack', async () => {
    const app = await running(PACKS);
    const packs = (await callTool(app, 'list_packs', {})) as { packs: { id: string; name: string }[] };
    const arcade = packs.packs.find((p) => p.name === 'Mini Arcade')!;
    expect(Array.isArray(((await callTool(app, 'pack_folders', { packId: arcade.id })) as { folders: string[] }).folders)).toBe(true);
  });

  it('says which games use a pack, and what a game has taken', async () => {
    const app = await running(PACKS);
    const packs = (await callTool(app, 'list_packs', {})) as { packs: { id: string }[] };
    expect(await callTool(app, 'usage', { packIds: [packs.packs[0]!.id] })).toBeTruthy();

    const game = tempDir();
    const project = (await callTool(app, 'add_game', { path: game, name: 'A game' })) as { id: string };
    expect(await callTool(app, 'project_files', { projectId: project.id })).toBeTruthy();
  });

  it('refuses over a pack or a game that is not there', async () => {
    const app = await running(PACKS);
    await expect(callTool(app, 'get_pack', { packId: 'not-a-pack' })).rejects.toThrow();
    await expect(callTool(app, 'project_files', { projectId: 'not-a-game' })).rejects.toThrow();
    await expect(callTool(app, 'pack_folders', { packId: 'not-a-pack' })).rejects.toThrow();
  });
});

describe('looking at a folder before opening it', () => {
  it('describes an empty folder, and one with things in it', async () => {
    expect(await describeFolder(tempDir())).toMatchObject({ kind: 'empty', entries: 0, writable: true });

    const busy = tempDir();
    mkdirSync(join(busy, 'something'), { recursive: true });
    writeFileSync(join(busy, 'a-file.txt'), 'hello');
    const described = await describeFolder(busy);
    expect(described.kind).toBe('other');
    expect(described.entries).toBe(2);
  });

  it('says a folder that is not there is not there', async () => {
    expect(await describeFolder(join(tempDir(), 'nowhere'))).toMatchObject({ kind: 'missing', entries: 0 });
  });

  it('finds a library in a folder, and says when there is none', async () => {
    const app = await running(PACKS);
    // It looks at the folder, and inside it, so pointing at a parent still finds the library.
    const here = await locateLibrary(app.root);
    expect(here.via).toBe('itself');
    expect(here.found).toHaveLength(1);

    const nowhere = await locateLibrary(tempDir());
    expect(nowhere.found).toEqual([]);
  });
});
