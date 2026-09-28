/**
 * The rails an agent runs on.
 *
 * Each of these was a real way for an agent, or for text an agent read, to do damage or to give a
 * confidently wrong answer. They are checked here because the window's own protections do not
 * cover the agent's path: the two go to the same library by different roads.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => import('./fake-electron'));

import { callTool, running, type PackFixture } from './library';
import { tempDir } from './helpers';

const PACKS: PackFixture[] = [{ name: 'Mini Arcade', files: { 'Models/arcade.obj': 'o arcade\n' } }];

/** A library, a Unity game, and the ids needed to talk about them. */
async function ready() {
  const app = await running(PACKS);
  const path = tempDir();
  mkdirSync(join(path, 'ProjectSettings'), { recursive: true });
  writeFileSync(join(path, 'ProjectSettings', 'ProjectVersion.txt'), 'm_EditorVersion: 6000.3.24f1\n');
  const game = await callTool(app, 'add_game', { path, name: 'Forest' });
  const pack = app.library.require().queries.packs({ scope: 'library', text: '', filters: {} }, 'added', 0, 10).rows[0]!;
  const file = app.library.require().queries.packFiles(pack.id).find((f) => f.ref.endsWith('.obj'))!;
  return { app, path, projectId: (game as { id: string }).id, pack, file };
}

describe('the credits file an agent may choose', () => {
  it('cannot be aimed at a file that is already there', async () => {
    // It could be aimed at ProjectSettings/ProjectVersion.txt, and the next copy then wrote the
    // credits over the Unity project's own file. An agent can be talked into this by text it
    // reads, so the refusal belongs here rather than in whoever calls it.
    const { app, projectId } = await ready();
    await expect(callTool(app, 'edit_game', { projectId, creditsFile: 'ProjectSettings/ProjectVersion.txt' })).rejects.toThrow(/already a file/i);
  });

  it('has to be a text document', async () => {
    const { app, projectId } = await ready();
    await expect(callTool(app, 'edit_game', { projectId, creditsFile: 'Assets/thing.prefab' })).rejects.toThrow(/text document/i);
  });

  it('can still be moved somewhere free', async () => {
    const { app, projectId, path } = await ready();
    await callTool(app, 'edit_game', { projectId, creditsFile: 'docs/CREDITS.md' });
    const games = (await callTool(app, 'list_projects', {})) as { creditsFile: string }[];
    expect(games[0]!.creditsFile).toBe('docs/CREDITS.md');
    expect(existsSync(join(path, 'ProjectSettings', 'ProjectVersion.txt'))).toBe(true);
  });
});

describe('what an agent is told when it links', () => {
  it('hears the licence problems the window would have shown', async () => {
    // The window will not copy a pack with no licence without saying so. The agent used to be
    // told only how many files moved, which is the one thing this application exists to prevent.
    const { app, projectId, pack, file } = await ready();
    await callTool(app, 'set_pack_details', { packId: pack.id, licence: null });
    const said = (await callTool(app, 'link_to_game', { projectId, assetIds: [file.id] })) as { linked: number; licenceWarnings?: string[] };
    expect(said.linked).toBe(1);
    expect(said.licenceWarnings?.join(' ')).toMatch(/licence/i);
  });
});

describe('a filter value that matches nothing', () => {
  it('says which values do exist, rather than answering "none"', async () => {
    // "CC0" is the obvious thing to ask for and the id is "CC0-1.0". An empty answer is true and
    // useless: the agent reports a library with no CC0 in it.
    const { app } = await ready();
    const said = (await callTool(app, 'search', { text: '', of: 'packs', filters: { licence: ['CC0'] } })) as {
      total: number;
      unknownFilterValues?: Record<string, { youAsked: string[]; theseExist: string[] }>;
    };
    expect(said.total).toBe(0);
    expect(said.unknownFilterValues?.licence?.youAsked).toEqual(['CC0']);
    expect(said.unknownFilterValues?.licence?.theseExist.length).toBeGreaterThan(0);
  });

  it('says nothing when the filter matched', async () => {
    const { app } = await ready();
    const said = (await callTool(app, 'search', { text: '', of: 'packs', filters: { licence: ['CC0-1.0'] } })) as { unknownFilterValues?: unknown };
    expect(said.unknownFilterValues).toBeUndefined();
  });
});

describe('settings an agent changes', () => {
  it('refuses a value the setting itself would throw away', async () => {
    // It accepted ten years, the setting kept 365 as its ceiling and fell back to its default of
    // 30, and the tool reported success. Asking for a longer bin made it shorter.
    const { app } = await ready();
    await expect(callTool(app, 'set_settings', { binKeepDays: 3650 })).rejects.toThrow();
  });

  it('reports what was stored, not what was asked for', async () => {
    const { app } = await ready();
    const said = (await callTool(app, 'set_settings', { binKeepDays: 90 })) as { stored: Record<string, unknown> };
    expect(said.stored.binKeepDays).toBe(90);
  });
});

describe('a pack whose record two computers disagreed about', () => {
  it('says so, rather than showing the winner in silence', async () => {
    // Syncthing keeps the losing version beside the winner and nothing read it. A licence
    // recorded on the other computer could sit in one of those files, unread and unmentioned,
    // and the game's credits would be written from the version that happened to win.
    const { app } = await ready();
    const pack = app.library.require().queries.packs({ scope: 'library', text: '', filters: {} }, 'added', 0, 5).rows[0]!;
    const folder = app.library.require().root;
    const dir = join(folder, 'packs', pack.folder);
    writeFileSync(join(dir, 'pack.sync-conflict-20260929-101500-ABCDEFG.json'), '{"name":"the other computer\'s version"}');
    await app.library.reindex();
    const again = app.library.require().queries.pack(pack.id)!;
    expect(again.problems.join(' ')).toMatch(/sync-conflict/i);
  });
});

describe('a collection rule an agent gets slightly wrong', () => {
  it('fails, rather than making a collection that refuses nothing', async () => {
    // The field is "licences". A collection made with "licence" kept the name "Only CC0" and let
    // a non-commercial pack straight in, which is the opposite of what it was asked for.
    const { app } = await ready();
    await expect(callTool(app, 'create_collection', { name: 'Only CC0', rules: { licence: ['CC0-1.0'] } })).rejects.toThrow();
    const made = (await callTool(app, 'create_collection', { name: 'Only CC0', rules: { licences: ['CC0-1.0'] } })) as { id: string };
    expect(made.id).toBeTruthy();
  });

  it('does not offer a rule the collection cannot keep', async () => {
    // edit_collection offered needsCreditLine, which is not one of a collection's rules, so it
    // was accepted and quietly dropped.
    const { app } = await ready();
    const made = (await callTool(app, 'create_collection', { name: 'Gathering', rules: { licences: ['CC0-1.0'] } })) as { id: string };
    await expect(callTool(app, 'edit_collection', { collectionId: made.id, rules: { needsCreditLine: true } })).rejects.toThrow();
  });

  it('changes only the rule it was given, and leaves the others', async () => {
    const { app } = await ready();
    const made = (await callTool(app, 'create_collection', { name: 'Gathering', rules: { licences: ['CC0-1.0'], tags: ['trees'] } })) as { id: string };
    await callTool(app, 'edit_collection', { collectionId: made.id, rules: { licences: ['CC-BY-4.0'] } });
    const all = (await callTool(app, 'list_collections', {})) as { id: string; rules: { licences: string[]; tags: string[] } }[];
    const now = all.find((c) => c.id === made.id)!;
    expect(now.rules.licences).toEqual(['CC-BY-4.0']);
    expect(now.rules.tags).toEqual(['trees']);
  });
});
