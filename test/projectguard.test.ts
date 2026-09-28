import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readManifest, ManifestUnreadableError } from '../src/main/projects/copy';
import { tempDir } from './helpers';

describe('a game’s record of what it took', () => {
  it('is empty for a game that has taken nothing', async () => {
    const dir = tempDir('tessera-manifest-');
    await expect(readManifest(dir, 'lib')).resolves.toEqual({ format: 1, libraryId: 'lib', entries: [] });
  });

  it('refuses to read one that is damaged, rather than treating it as empty', async () => {
    // A merge conflict in this file used to be read as "this game has taken nothing", and the
    // next copy saved that, which silently dropped every credit the game owed.
    const dir = tempDir('tessera-manifest-');
    mkdirSync(join(dir, '.tessera'), { recursive: true });
    writeFileSync(join(dir, '.tessera', 'manifest.json'), '<<<<<<< HEAD\n{"format":1,"entries":[]}\n=======\n>>>>>>> theirs\n');
    await expect(readManifest(dir, 'lib')).rejects.toBeInstanceOf(ManifestUnreadableError);
  });

  it('refuses one that parses but is not the shape Tessera writes', async () => {
    const dir = tempDir('tessera-manifest-');
    mkdirSync(join(dir, '.tessera'), { recursive: true });
    writeFileSync(join(dir, '.tessera', 'manifest.json'), '{"format":99,"entries":"no"}');
    await expect(readManifest(dir, 'lib')).rejects.toBeInstanceOf(ManifestUnreadableError);
  });
});

describe('a path inside a pack', () => {
  it('cannot climb out, whichever separator it uses', async () => {
    const { insidePack } = await import('../src/main/index/files');
    const dir = '/library/packs/Kit';
    expect(insidePack(dir, 'models/tree.obj')).toBe(join(dir, 'models', 'tree.obj'));
    expect(insidePack(dir, '../Other/secret.txt')).toBeNull();
    expect(insidePack(dir, 'a/../../Other/secret.txt')).toBeNull();
    // A URL carries these encoded, and on Windows a backslash is a separator too. Checking for a
    // '..' segment split on '/' alone missed exactly this.
    expect(insidePack(dir, '..\\..\\Users\\Public\\x.jpg')).toBeNull();
    // A ref that looks absolute is treated as relative to the pack, which keeps it inside.
    expect(insidePack(dir, '/etc/passwd')).toBe(join(dir, 'etc', 'passwd'));
    // And a climb that would have landed back inside is still refused: a ref has no reason to.
    expect(insidePack(dir, 'original/../pack.json')).toBeNull();
  });
});

describe('a credit line that carries the creator’s own words', () => {
  it('still names the licence when the creator’s name merely contains it', async () => {
    const { writeCredits } = await import('../src/main/projects/credits');
    const dir = tempDir('tessera-credits-');
    const at = join(dir, 'CREDITS.md');
    await writeCredits(at, [
      { packId: '1', packName: 'Brushes', ref: 'a.png', copiedRef: 'a.png', files: ['a.png'], licence: 'MIT', attribution: 'Art by John Smith', creator: 'John Smith', sourceUrl: null, copiedAt: '2026-01-01T00:00:00Z' },
    ] as never);
    const text = readFileSync(at, 'utf8');
    // "Smith" contains "MIT", so a substring test used to decide the line already said the licence.
    expect(text).toMatch(/MIT/);
    expect(text).toMatch(/Art by John Smith/);
  });
});

describe('one game with a damaged record', () => {
  it('does not take the other games down with it', async () => {
    // Making readManifest refuse a damaged file was right for writing and wrong for looking: one
    // merge conflict emptied the whole Projects page, stopped anything being linked to any game,
    // and made "what uses this pack?" answer nothing for all of them.
    const { readManifestIfReadable } = await import('../src/main/projects/copy');
    const dir = tempDir('tessera-manifest-');
    mkdirSync(join(dir, '.tessera'), { recursive: true });
    writeFileSync(join(dir, '.tessera', 'manifest.json'), '<<<<<<< HEAD\n{}\n=======\n>>>>>>> theirs\n');
    const read = await readManifestIfReadable(dir, 'lib');
    expect(read.damaged).toBe(true);
    expect(read.manifest.entries).toEqual([]);

    const fine = tempDir('tessera-manifest-');
    expect((await readManifestIfReadable(fine, 'lib')).damaged).toBe(false);
  });
});
