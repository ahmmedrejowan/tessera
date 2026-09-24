/**
 * Games, and what a library has put into them.
 *
 * A game project is somebody else's folder, so the tests below care most about the awkward cases:
 * a project that has moved or gone, a pack that has been renamed or archived after its files were
 * copied in, and taking things back out again without disturbing what shares them.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => import('./fake-electron'));

import { Jobs } from '../src/main/jobs';
import { ProjectService } from '../src/main/projects/service';
import { running, type PackFixture } from './library';
import { tempDir } from './helpers';

const PACKS: PackFixture[] = [
  { name: 'Mini Arcade', files: { 'Models/arcade.obj': 'o arcade\n', 'Models/arcade.mtl': 'newmtl a\n' } },
  { name: 'Interface Sounds', files: { 'Audio/click.wav': 'RIFF....WAVE' } },
];

/** A library, a game folder, and a project service pointed at both. */
async function withGame(engine: 'unity' | 'godot' | 'plain' = 'unity') {
  const app = await running(PACKS);
  const projects = new ProjectService(tempDir(), new Jobs(() => undefined));
  const path = tempDir();
  if (engine === 'unity') {
    mkdirSync(join(path, 'ProjectSettings'), { recursive: true });
    writeFileSync(join(path, 'ProjectSettings', 'ProjectVersion.txt'), 'm_EditorVersion: 6000.3.24f1\n');
  } else if (engine === 'godot') {
    writeFileSync(join(path, 'project.godot'), 'config/name="A game"\n');
  }
  const project = await projects.add(await projects.probe(path));
  const all = app.library.require().queries.packs({ scope: 'library', text: '', filters: {} }, 'added', 0, 10).rows;
  // The order packs come back in is the library's business, so the one wanted is named.
  const packs = [all.find((p) => p.name === 'Mini Arcade')!, ...all.filter((p) => p.name !== 'Mini Arcade')];
  const names = () => 'Library';
  /** A real file of that pack, as the index records it. */
  const aFile = app.library.require().queries.packFiles(packs[0]!.id).find((f) => f.ref.endsWith('.obj'))!;
  return { app, projects, project, path, packs, aFile, libraryId: 'test-library', names };
}

describe('taking a folder as a game', () => {
  it('works out what it is, and keeps it', async () => {
    const { projects, project, libraryId, names } = await withGame();
    expect(project.engine).toBe('unity');
    expect(project.target).toBe('Assets/ThirdParty');
    expect((await projects.list(libraryId, names)).some((p) => p.id === project.id)).toBe(true);
    expect((await projects.get(project.id))?.id).toBe(project.id);
  });

  it('recognises a Godot project, and a folder that is neither', async () => {
    expect((await withGame('godot')).project.engine).toBe('godot');
    expect((await withGame('plain')).project.engine).toBe('other');
  });

  it('is renamed, pointed somewhere else, and forgotten', async () => {
    const { projects, project, libraryId, names } = await withGame();
    await projects.update(project.id, { name: 'A better name', target: 'Assets/Bought' });
    expect((await projects.get(project.id))?.name).toBe('A better name');
    expect((await projects.get(project.id))?.target).toBe('Assets/Bought');

    await projects.unlink(project.id);
    await expect(projects.get(project.id)).rejects.toThrow();
    expect((await projects.list(libraryId, names)).some((p) => p.id === project.id)).toBe(false);
  });

  it('refuses clearly over a game it has never heard of', async () => {
    const { projects, libraryId, names } = await withGame();
    await expect(projects.get('not-a-game')).rejects.toMatchObject({ code: expect.any(String) });
    await expect(projects.entries('not-a-game', libraryId, names)).rejects.toThrow();
  });

  it('notices a game whose folder has gone', async () => {
    const { projects, project, path, libraryId, names } = await withGame();
    rmSync(path, { recursive: true, force: true });
    const listed = (await projects.list(libraryId, names)).find((p) => p.id === project.id);
    expect(listed?.exists).toBe(false);
  });
});

describe('copying into a game', () => {
  it('says what would happen before it happens', async () => {
    const { app, projects, project, packs, aFile } = await withGame();
    const plan = await projects.plan(project.id, [{ packId: packs[0]!.id, ref: aFile.ref }], app.context().copySource());
    expect(plan.assets).toBe(1);
    expect(plan.files).toBeGreaterThan(0);
    expect(plan.updating).toBe(0);
  });

  it('copies the files in, with a licence beside them and the credits written', async () => {
    const { app, projects, project, path, packs, aFile, libraryId, names } = await withGame();
    const items = [{ packId: packs[0]!.id, ref: aFile.ref }];
    expect(await projects.copy(project.id, items, app.context().copySource())).toBe(1);

    const entries = await projects.entries(project.id, libraryId, names);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.files.length).toBeGreaterThan(0);

    const credits = join(path, 'CREDITS.md');
    expect(existsSync(credits)).toBe(true);
    expect(readFileSync(credits, 'utf8')).toContain('Mini Arcade');
    expect(existsSync(join(path, 'Assets', 'ThirdParty', 'Mini Arcade', 'LICENCE.txt'))).toBe(true);
  });

  it('says which games use a pack once it has been copied in', async () => {
    const { app, projects, project, packs, aFile, libraryId } = await withGame();
    await projects.copy(project.id, [{ packId: packs[0]!.id, ref: aFile.ref }], app.context().copySource());
    const use = await projects.usage(libraryId, [packs[0]!.id]);
    expect(use.some((u) => u.projectId === project.id)).toBe(true);
    expect(await projects.usage(libraryId, ['not-a-pack'])).toEqual([]);
  });

  it('copying the same thing again updates it rather than doubling it', async () => {
    const { app, projects, project, packs, aFile, libraryId, names } = await withGame();
    const items = [{ packId: packs[0]!.id, ref: aFile.ref }];
    await projects.copy(project.id, items, app.context().copySource());
    const again = await projects.plan(project.id, items, app.context().copySource());
    expect(again.updating).toBe(1);

    await projects.copy(project.id, items, app.context().copySource());
    expect(await projects.entries(project.id, libraryId, names)).toHaveLength(1);
  });

  it('takes things back out, and the credits follow', async () => {
    const { app, projects, project, path, packs, aFile, libraryId, names } = await withGame();
    const items = [{ packId: packs[0]!.id, ref: aFile.ref }];
    await projects.copy(project.id, items, app.context().copySource());

    expect(await projects.remove(project.id, items, libraryId)).toBe(1);
    expect(await projects.entries(project.id, libraryId, names)).toEqual([]);
    expect(readFileSync(join(path, 'CREDITS.md'), 'utf8')).not.toContain('arcade.obj');
  });

  it('keeps the licence in the game when a pack is put away in the archive', async () => {
    const { app, projects, project, path, packs, aFile, libraryId } = await withGame();
    await projects.copy(project.id, [{ packId: packs[0]!.id, ref: aFile.ref }], app.context().copySource());
    await projects.keepLicences(libraryId, [packs[0]!.id], app.context().copySource());
    expect(existsSync(join(path, 'Assets', 'ThirdParty', 'Mini Arcade', 'LICENCE.txt'))).toBe(true);
  });

  it('brings a game up to date when a pack is renamed or its licence changes', async () => {
    const { app, projects, project, path, packs, aFile, libraryId } = await withGame();
    await projects.copy(project.id, [{ packId: packs[0]!.id, ref: aFile.ref }], app.context().copySource());

    await projects.packChanged(libraryId, packs[0]!.id, { packName: 'Arcade Deluxe', licence: 'CC-BY-4.0', attribution: 'Someone', creator: 'Someone', sourceUrl: 'https://example.test/' });

    // What the game has on record is what changed, and the credits are written from that.
    const entries = await projects.entries(project.id, libraryId, () => 'Library');
    expect(entries[0]!.packName).toBe('Arcade Deluxe');
    expect(entries[0]!.licence).toBe('CC-BY-4.0');
    expect(readFileSync(join(path, 'CREDITS.md'), 'utf8')).toContain('Someone');
  });

  it('writes the credits again on request, without copying anything', async () => {
    const { app, projects, project, path, packs, aFile, libraryId } = await withGame();
    await projects.copy(project.id, [{ packId: packs[0]!.id, ref: aFile.ref }], app.context().copySource());
    rmSync(join(path, 'CREDITS.md'), { force: true });
    await projects.refreshCredits(project.id, libraryId);
    expect(existsSync(join(path, 'CREDITS.md'))).toBe(true);
  });

  it('refuses to copy into a game that is not there', async () => {
    const { app, projects, packs, aFile } = await withGame();
    await expect(projects.copy('not-a-game', [{ packId: packs[0]!.id, ref: aFile.ref }], app.context().copySource())).rejects.toThrow();
  });
});
