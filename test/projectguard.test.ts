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
