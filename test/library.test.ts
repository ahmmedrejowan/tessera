import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { missingForLibrary } from '@shared/pack';
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

  it('merges edits to source and licence and keeps unknown fields', async () => {
    const root = tempDir();
    await createLibrary(root, 'lib');
    const pack = await createPack(root, 'Pack', { source: { site: 'kenney', name: null, url: 'https://kenney.nl', creator: 'Kenney', creatorUrl: null } });
    const file = join(pack.dir, 'pack.json');
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), futureField: 42 }));
    const [reread] = (await listPacks(root)).packs;
    const edited = await editPack(reread!, { licence: { id: 'CC0-1.0', attribution: null, proof: [], notes: '' }, tags: ['city'] });
    expect(edited.meta.source.site).toBe('kenney');
    expect(edited.meta.licence.id).toBe('CC0-1.0');
    expect(JSON.parse(readFileSync(file, 'utf8')).futureField).toBe(42);
    expect(missingForLibrary(edited.meta)).toEqual([]);
  });

  it('says what a pack still needs before it can leave the Inbox', async () => {
    const root = tempDir();
    await createLibrary(root, 'lib');
    const pack = await createPack(root, 'Pack');
    expect(missingForLibrary(pack.meta)).toEqual(['licence', 'source']);
  });
});
