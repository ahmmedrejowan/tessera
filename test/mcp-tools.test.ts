import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { callTool, running, PIXEL, type Running } from './library';
import { tempDir } from './helpers';

/**
 * What the tools actually do, against a real library. The catalogue is checked elsewhere; this is
 * about behaviour: an agent asks, the library changes, and the next question sees the change.
 */

const PACKS = [
  { name: 'Mini Arcade', files: { 'Models/arcade.obj': 'o arcade\nv 0 0 0\n', 'Models/pinball.obj': 'o pinball\nv 1 0 0\n', 'Textures/wood.png': PIXEL } },
  { name: 'Rocks', files: { 'rock_a.obj': 'o rock\n', 'rock_b.obj': 'o rock\n' }, licence: null, source: null },
];

const idOf = async (app: Running, name: string): Promise<string> => {
  const found = (await callTool(app, 'search', { text: name, of: 'packs', scope: 'all' })) as { packs: { id: string; name: string }[] };
  const pack = found.packs.find((p) => p.name === name);
  if (!pack) throw new Error(`${name} is not in the library`);
  return pack.id;
};

describe('looking', () => {
  it('says what is in the library, and what wants attention', async () => {
    const app = await running(PACKS);
    const status = (await callTool(app, 'library_status')) as { open: boolean; packs: number; waitingInReview: number; needsAttention: { noLicence: number } };
    expect(status.open).toBe(true);
    expect(status.packs).toBe(1);
    // The pack with no licence and no source waits in Review, and is counted there.
    expect(status.waitingInReview + status.needsAttention.noLicence).toBeGreaterThan(0);
  });

  it('finds a pack by a word in its name, and a file by a word in its path', async () => {
    const app = await running(PACKS);
    const packs = (await callTool(app, 'search', { text: 'arcade', of: 'packs' })) as { total: number; packs: { name: string }[] };
    expect(packs.total).toBe(1);
    expect(packs.packs[0]!.name).toBe('Mini Arcade');
    const files = (await callTool(app, 'search', { text: 'pinball' })) as { total: number; assets: { name: string }[] };
    expect(files.assets[0]!.name).toContain('pinball');
  });

  it('gives a page of packs and a page of files, with the total behind them', async () => {
    const app = await running(PACKS);
    const list = (await callTool(app, 'list_packs', { scope: 'all', limit: 1 })) as { total: number; packs: unknown[] };
    expect(list.total).toBe(2);
    expect(list.packs).toHaveLength(1);
    const files = (await callTool(app, 'list_assets', { scope: 'all', limit: 100 })) as { total: number; assets: { path: string }[] };
    expect(files.total).toBeGreaterThan(2);
    expect(files.assets.some((a) => a.path.endsWith('arcade.obj'))).toBe(true);
  });

  it('reads one pack in full, and refuses an id that is not there', async () => {
    const app = await running(PACKS);
    const pack = (await callTool(app, 'get_pack', { packId: await idOf(app, 'Mini Arcade') })) as { name: string; licence: string };
    expect(pack).toMatchObject({ name: 'Mini Arcade', licence: 'CC0-1.0' });
    await expect(callTool(app, 'get_pack', { packId: 'nope' })).rejects.toThrow(/No pack/);
  });

  it('says what is waiting in Review and what each one still needs', async () => {
    const app = await running(PACKS);
    const review = (await callTool(app, 'list_review')) as { name: string; needs: string[] }[];
    expect(review).toHaveLength(1);
    expect(review[0]!.name).toBe('Rocks');
    expect(review[0]!.needs.sort()).toEqual(['licence', 'source']);
  });
});

describe('filing', () => {
  it('stars a pack, and the library shows it starred', async () => {
    const app = await running(PACKS);
    const id = await idOf(app, 'Mini Arcade');
    await callTool(app, 'star', { packIds: [id] });
    const starred = (await callTool(app, 'search', { of: 'packs', starred: true })) as { total: number };
    expect(starred.total).toBe(1);
    await callTool(app, 'star', { packIds: [id], on: false });
    expect(((await callTool(app, 'search', { of: 'packs', starred: true })) as { total: number }).total).toBe(0);
  });

  it('edits a pack without disturbing what it was not asked about', async () => {
    const app = await running(PACKS);
    const id = await idOf(app, 'Mini Arcade');
    await callTool(app, 'set_pack_details', { packId: id, tags: ['arcade', 'retro'], creator: 'Someone' });
    const pack = (await callTool(app, 'get_pack', { packId: id })) as { licence: string; tags: string[]; creator: string; name: string };
    expect(pack).toMatchObject({ name: 'Mini Arcade', licence: 'CC0-1.0', creator: 'Someone' });
    expect(pack.tags.sort()).toEqual(['arcade', 'retro']);
  });

  it('says what a pack in Review still needs, and lets it out once it has both', async () => {
    const app = await running(PACKS);
    const id = await idOf(app, 'Rocks');
    const half = (await callTool(app, 'set_pack_details', { packId: id, licence: 'CC0-1.0' })) as { stillNeeds: string[] };
    expect(half.stillNeeds).toEqual(['source']);
    const refused = (await callTool(app, 'move_to_library', { packIds: [id] })) as { moved: string[]; refused: { why: string }[] };
    expect(refused.moved).toEqual([]);
    expect(refused.refused[0]!.why).toMatch(/source/i);
    const ready = (await callTool(app, 'set_pack_details', { packId: id, sourceUrl: 'https://example.com/rocks' })) as { stillNeeds: string[] };
    expect(ready.stillNeeds).toEqual([]);
    expect(((await callTool(app, 'move_to_library', { packIds: [id] })) as { moved: string[] }).moved).toEqual([id]);
    expect(((await callTool(app, 'list_review')) as unknown[]).length).toBe(0);
  });

  it('refuses a licence rule for a path that covers nothing, and says what the paths are', async () => {
    const app = await running(PACKS);
    const id = await idOf(app, 'Mini Arcade');
    await expect(callTool(app, 'set_file_licence', { packId: id, path: 'nowhere.obj', licence: 'CC-BY-4.0' })).rejects.toThrow(/Nothing in this pack/);
    const done = (await callTool(app, 'set_file_licence', { packId: id, path: 'Models', licence: 'CC-BY-4.0' })) as { files: number };
    expect(done.files).toBe(2);
    // Everything, because a texture on its own counts as supporting a model rather than an asset.
    const files = (await callTool(app, 'list_files', { packId: id, only: 'everything' })) as { files: { path: string; licence: string }[] };
    expect(files.files.find((f) => f.path.endsWith('arcade.obj'))?.licence).toBe('CC-BY-4.0');
    expect(files.files.find((f) => f.path.endsWith('wood.png'))?.licence).toBe('CC0-1.0');
  });

  it('gathers a collection, refuses what its rules do not take, and empties again', async () => {
    const app = await running(PACKS);
    const made = (await callTool(app, 'create_collection', { name: 'CC0 only', rules: { licences: ['CC0-1.0'] } })) as { id: string };
    const arcade = await idOf(app, 'Mini Arcade');
    const added = (await callTool(app, 'add_to_collection', { collectionId: made.id, packIds: [arcade] })) as { addedPacks: number; refused: unknown[] };
    expect(added.addedPacks).toBe(1);
    expect(added.refused).toEqual([]);
    const collections = (await callTool(app, 'list_collections')) as { name: string; packs: number }[];
    expect(collections.find((c) => c.name === 'CC0 only')?.packs).toBe(1);
    await callTool(app, 'remove_from_collection', { collectionId: made.id, packIds: [arcade] });
    expect(((await callTool(app, 'list_collections')) as { name: string; packs: number }[]).find((c) => c.name === 'CC0 only')?.packs).toBe(0);
    await callTool(app, 'delete_collection', { collectionId: made.id });
    expect(((await callTool(app, 'list_collections')) as { name: string }[]).some((c) => c.name === 'CC0 only')).toBe(false);
  });

  it('archives a pack, which leaves the library but keeps the pack', async () => {
    const app = await running(PACKS);
    const id = await idOf(app, 'Mini Arcade');
    await callTool(app, 'archive_pack', { packIds: [id] });
    expect(((await callTool(app, 'search', { of: 'packs' })) as { total: number }).total).toBe(0);
    expect(((await callTool(app, 'library_status')) as { archived: number }).archived).toBe(1);
    await callTool(app, 'archive_pack', { packIds: [id], on: false });
    expect(((await callTool(app, 'search', { of: 'packs' })) as { total: number }).total).toBe(1);
  });
});

describe('bringing things in', () => {
  it('adds files to a pack, under their own terms, where it was asked to put them', async () => {
    const app = await running(PACKS);
    const id = await idOf(app, 'Mini Arcade');
    const from = tempDir();
    writeFileSync(join(from, 'extra.obj'), 'o extra\n');
    const done = (await callTool(app, 'add_files_to_pack', { packId: id, paths: [join(from, 'extra.obj')], into: 'Extras', licence: 'CC-BY-4.0' })) as { added: number; names: string[] };
    expect(done).toMatchObject({ added: 1, names: ['Extras/extra.obj'] });
    const files = (await callTool(app, 'list_files', { packId: id })) as { files: { path: string; licence: string }[] };
    expect(files.files.find((f) => f.path === 'Extras/extra.obj')?.licence).toBe('CC-BY-4.0');
  });

  it('insists on a full path, because a half one means somewhere it cannot know', async () => {
    const app = await running(PACKS);
    const id = await idOf(app, 'Mini Arcade');
    await expect(callTool(app, 'add_files_to_pack', { packId: id, paths: ['extra.obj'] })).rejects.toThrow(/full path/);
    await expect(callTool(app, 'import_paths', { paths: ['./downloads'] })).rejects.toThrow(/full path/);
  });

  it('adds a folder from this computer as a pack, which waits in Review without a licence', async () => {
    const app = await running();
    const from = join(tempDir(), 'Trees');
    mkdirSync(from, { recursive: true });
    writeFileSync(join(from, 'tree.obj'), 'o tree\n');
    const done = (await callTool(app, 'import_paths', { paths: [from] })) as { added: { name: string; status: string }[] };
    expect(done.added).toHaveLength(1);
    expect(done.added[0]).toMatchObject({ name: 'Trees', status: 'inbox' });
  });
});

describe('deleting', () => {
  it('puts a pack in the bin and takes it out again, with the files following', async () => {
    const app = await running(PACKS);
    const id = await idOf(app, 'Mini Arcade');
    await callTool(app, 'delete_to_bin', { packIds: [id] });
    expect(((await callTool(app, 'search', { of: 'packs' })) as { total: number }).total).toBe(0);
    const bin = (await callTool(app, 'list_bin')) as { id: string; shown: string }[];
    expect(bin).toHaveLength(1);
    expect(bin[0]!.shown).toBe('Mini Arcade');
    await callTool(app, 'restore_from_bin', { ids: [bin[0]!.id] });
    expect(((await callTool(app, 'search', { of: 'packs' })) as { total: number }).total).toBe(1);
    expect(existsSync(join(app.root, 'packs', 'Mini Arcade', 'original', 'Models', 'arcade.obj'))).toBe(true);
  });

  it('empties the bin for good, and only then is anything really gone', async () => {
    const app = await running(PACKS);
    await callTool(app, 'delete_to_bin', { packIds: [await idOf(app, 'Mini Arcade')] });
    expect(existsSync(join(app.root, 'packs', 'Mini Arcade'))).toBe(false);
    const gone = (await callTool(app, 'empty_bin')) as { gone: number };
    expect(gone.gone).toBe(1);
    expect((await callTool(app, 'list_bin')) as unknown[]).toEqual([]);
  });
});

describe('linking into a game', () => {
  it('copies a pack into a game, with its licence and credits, and takes it back out', async () => {
    const app = await running(PACKS);
    const folder = join(tempDir(), 'Bunny Dash');
    mkdirSync(folder, { recursive: true });
    const game = (await callTool(app, 'add_game', { path: folder, name: 'Bunny Dash' })) as { id: string; name: string };
    expect(game.name).toBe('Bunny Dash');
    const linked = (await callTool(app, 'link_to_game', { projectId: game.id, packIds: [await idOf(app, 'Mini Arcade')] })) as { linked: number };
    expect(linked.linked).toBeGreaterThan(0);
    const inGame = (await callTool(app, 'project_files', { projectId: game.id })) as { pack: string; licence: string }[];
    expect(inGame[0]).toMatchObject({ pack: 'Mini Arcade', licence: 'CC0-1.0' });
    expect(readFileSync(join(folder, 'CREDITS.md'), 'utf8')).toContain('Mini Arcade');
    const out = (await callTool(app, 'unlink_from_game', { projectId: game.id, packIds: [await idOf(app, 'Mini Arcade')] })) as { removed: number };
    expect(out.removed).toBe(linked.linked);
    expect((await callTool(app, 'project_files', { projectId: game.id })) as unknown[]).toEqual([]);
  });
});

describe('what an agent leaves behind', () => {
  it('writes a line into the library for everything it changes, and none for looking', async () => {
    const app = await running(PACKS);
    await callTool(app, 'search', { text: 'arcade' });
    await callTool(app, 'list_packs', {});
    expect(app.notes).toEqual([]);
    await callTool(app, 'star', { packIds: [await idOf(app, 'Mini Arcade')] });
    expect(app.notes.join(' ')).toMatch(/An agent starred/);
  });
});
