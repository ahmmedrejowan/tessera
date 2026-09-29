import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { eitherSpelling, missingForLibrary, PackMeta } from '@shared/pack';
import { createLibrary, inspectFolder, MARKER, readLibraryInfo } from '../src/main/library/layout';
import { safeFolderName, uniqueName } from '../src/main/library/names';
import { createPack, editPack, listPacks } from '../src/main/library/packs';
import { tempDir } from './helpers';

describe('folder names', () => {
  it('removes characters Windows refuses and trailing dots', () => {
    expect(safeFolderName('Kenney: City Kit / Roads?.')).toBe('Kenney City Kit Roads');
    expect(safeFolderName('  ')).toBe('Untitled');
    expect(safeFolderName('CON')).toBe('CON_');
    expect(safeFolderName('nul.txt')).toBe('nul.txt_');
    expect(safeFolderName('a'.repeat(200))).toHaveLength(80);
  });

  it('numbers duplicates', () => {
    const taken = new Set(['pack', 'pack 2']);
    expect(uniqueName('pack', (c) => taken.has(c))).toBe('pack 3');
    expect(uniqueName('other', (c) => taken.has(c))).toBe('other');
  });
});

describe('library', () => {
  it('creates a library in an empty or missing folder and reads it back', async () => {
    const root = join(tempDir(), 'My Library');
    expect(await inspectFolder(root)).toBe('missing');
    const info = await createLibrary(root, 'My Library');
    expect(await inspectFolder(root)).toBe('library');
    expect(await readLibraryInfo(root)).toEqual(info);
  });

  it('makes the folders of a nested path, but never inside another library', async () => {
    const dir = tempDir();
    const root = join(dir, 'Art', '2026', 'Game Library');
    await createLibrary(root, 'Game Library');
    expect(await inspectFolder(root)).toBe('library');
    await expect(createLibrary(join(root, 'More', 'Inner'), 'Inner')).rejects.toMatchObject({ code: 'inside-library' });
  });

  it('refuses a folder that already holds other files', async () => {
    const root = tempDir();
    writeFileSync(join(root, 'notes.txt'), 'hi');
    expect(await inspectFolder(root)).toBe('other');
    await expect(createLibrary(root, 'x')).rejects.toMatchObject({ code: 'folder-not-empty' });
  });

  it('ignores OS clutter when deciding a folder is empty', async () => {
    const root = tempDir();
    writeFileSync(join(root, '.DS_Store'), '');
    expect(await inspectFolder(root)).toBe('empty');
  });

  it('tells a missing library apart from a folder that isn’t one', async () => {
    await expect(readLibraryInfo(join(tempDir(), 'gone'))).rejects.toMatchObject({ code: 'library-missing' });
    await expect(readLibraryInfo(tempDir())).rejects.toMatchObject({ code: 'not-a-library' });
  });

  it('refuses a library from a newer version', async () => {
    const root = tempDir();
    await createLibrary(root, 'x');
    const marker = JSON.parse(readFileSync(join(root, MARKER), 'utf8'));
    writeFileSync(join(root, MARKER), JSON.stringify({ ...marker, format: 99 }));
    await expect(readLibraryInfo(root)).rejects.toMatchObject({ code: 'library-too-new' });
  });
});

describe('packs', () => {
  it('creates packs with unique folders and lists them by name', async () => {
    const root = tempDir();
    await createLibrary(root, 'lib');
    const a = await createPack(root, 'City Kit');
    const b = await createPack(root, 'City Kit');
    await createPack(root, 'Animals');
    expect(a.folder).toBe('City Kit');
    expect(b.folder).toBe('City Kit 2');
    expect(a.meta.status).toBe('inbox');
    const { packs, problems } = await listPacks(root);
    expect(packs.map((p) => p.meta.name)).toEqual(['Animals', 'City Kit', 'City Kit']);
    expect(problems).toEqual([]);
  });

  it('reports a broken pack without hiding the others', async () => {
    const root = tempDir();
    await createLibrary(root, 'lib');
    await createPack(root, 'Good');
    mkdirSync(join(root, 'packs', 'Broken'));
    writeFileSync(join(root, 'packs', 'Broken', 'pack.json'), '{ not json');
    mkdirSync(join(root, 'packs', 'No record'));
    const { packs, problems } = await listPacks(root);
    expect(packs).toHaveLength(1);
    expect(problems.map((p) => p.folder)).toEqual(['Broken', 'No record']);
  });

  it('merges edits to source and license and keeps unknown fields', async () => {
    const root = tempDir();
    await createLibrary(root, 'lib');
    const pack = await createPack(root, 'Pack', { source: { site: 'kenney', name: null, url: 'https://kenney.nl', creator: 'Kenney', creatorUrl: null } });
    const file = join(pack.dir, 'pack.json');
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), futureField: 42 }));
    const [reread] = (await listPacks(root)).packs;
    const edited = await editPack(reread!, { license: { id: 'CC0-1.0', attribution: null, proof: [], notes: '' }, tags: ['city'] });
    expect(edited.meta.source.site).toBe('kenney');
    expect(edited.meta.license.id).toBe('CC0-1.0');
    expect(JSON.parse(readFileSync(file, 'utf8')).futureField).toBe(42);
    expect(missingForLibrary(edited.meta)).toEqual([]);
  });

  it('says what a pack still needs before it can leave the Inbox', async () => {
    const root = tempDir();
    await createLibrary(root, 'lib');
    const pack = await createPack(root, 'Pack');
    expect(missingForLibrary(pack.meta)).toEqual(['license', 'source']);
  });
});

/**
 * The old keys, spelled out rather than written down.
 *
 * These tests are the only proof that a library written by an older Tessera can still be read, and
 * they only prove it while they use the old spelling. A find-and-replace over the repository for
 * the British spelling has already turned the readers themselves into no-ops once, and it would
 * have done the same here: the fixture would have said "license", the test would still have
 * passed, and it would have been testing nothing. Built from pieces so that sweep cannot reach it,
 * the same way src/shared/pack.ts holds the keys it looks for.
 */
const WAS_LICENSE = `licen${'c'}e`;
const WAS_LICENSES = `${WAS_LICENSE}s`;

describe('a record written before the spelling was settled', () => {
  it('is read, and keeps its license and its part rules', () => {
    // Everything the app writes now says "license". A library made by an older Tessera spells it
    // the British way, and it is somebody's real library, so it is read either way and moves over
    // on its next save rather than needing a migration.
    const old = {
      format: 1,
      id: 'bbbbbbbb-old-pack',
      name: 'Old Kit',
      status: 'library',
      addedAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      source: { url: 'https://example.test/old', site: null, creator: 'Someone', name: null },
      [WAS_LICENSE]: { id: 'CC-BY-4.0', attribution: 'by Someone' },
      [WAS_LICENSES]: [{ path: 'Music', [WAS_LICENSE]: { id: 'CC0-1.0', attribution: null } }],
    };
    const meta = PackMeta.parse(eitherSpelling(old));
    expect(meta.license.id).toBe('CC-BY-4.0');
    expect(meta.license.attribution).toBe('by Someone');
    expect(meta.licenses).toHaveLength(1);
    expect(meta.licenses[0]!.path).toBe('Music');
    expect(meta.licenses[0]!.license.id).toBe('CC0-1.0');
  });

  it('leaves a record that already says license alone', () => {
    const now = { [WAS_LICENSE]: { id: 'CC0-1.0' }, license: { id: 'MIT' } };
    expect((eitherSpelling(now) as { license: { id: string } }).license.id).toBe('MIT');
  });
});
