import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cloudService, folderNameProblem, folderPathProblem, pathParts } from '../src/shared/folders';
import { createLibrary } from '../src/main/library/layout';
import { describeFolder, locateLibrary } from '../src/main/library/locate';

describe('folder names and places', () => {
  it('accepts ordinary names and explains bad ones', () => {
    expect(folderNameProblem('Game Assets')).toBeNull();
    expect(folderNameProblem('  ')).toBe('Give it a name.');
    expect(folderNameProblem('a/b')).toMatch(/can’t contain/);
    expect(folderNameProblem('Assets.')).toMatch(/end with a dot/);
    expect(folderNameProblem('con')).toMatch(/Windows keeps/);
    // A slash makes folders inside folders; the last one is the library's folder.
    expect(folderPathProblem('Art/Game Library')).toBeNull();
    expect(pathParts('Art/Game Library')).toEqual(['Art', 'Game Library']);
    expect(pathParts('Art\\2026 / Kits')).toEqual(['Art', '2026', 'Kits']);
    expect(folderPathProblem('Art//Kits')).toMatch(/each side of a slash/);
    expect(folderPathProblem('/Kits')).toMatch(/each side of a slash/);
    expect(folderPathProblem('Art/')).toMatch(/each side of a slash/);
    expect(folderPathProblem('Art/..')).toMatch(/end with a dot/);
    expect(folderPathProblem('Art/a:b')).toMatch(/“a:b”: can’t contain/);
  });

  it('recognises folders a cloud service syncs', () => {
    expect(cloudService('/Users/sam/Library/Mobile Documents/com~apple~CloudDocs/Assets')).toBe('iCloud Drive');
    expect(cloudService('C:\\Users\\Sam\\OneDrive - Studio\\Assets')).toBe('OneDrive');
    expect(cloudService('/Users/sam/Dropbox/Assets')).toBe('Dropbox');
    expect(cloudService('/Users/sam/Library/CloudStorage/GoogleDrive-sam@example.com/My Drive')).toBe('Google Drive');
    expect(cloudService('/Users/sam/Documents/Assets')).toBeNull();
  });
});

describe('finding a library from a picked folder', () => {
  async function setup() {
    const root = await mkdtemp(join(tmpdir(), 'tessera-locate-'));
    const lib = join(root, 'Holder', 'My Library');
    await createLibrary(lib, 'My Library');
    await mkdir(join(lib, 'packs', 'Forest'), { recursive: true });
    return { root, lib };
  }

  it('finds the folder itself, one it is inside, and ones inside it', async () => {
    const { root, lib } = await setup();
    expect(await locateLibrary(lib)).toEqual({ via: 'itself', found: [{ path: lib, name: 'My Library', packs: 1 }] });
    expect((await locateLibrary(join(lib, 'packs', 'Forest'))).via).toBe('parent');
    expect(await locateLibrary(join(root, 'Holder'))).toEqual({ via: 'inside', found: [{ path: lib, name: 'My Library', packs: 1 }] });
    expect((await locateLibrary(root)).via).toBe('none');
  });

  it('describes folders, including ones that don’t exist yet', async () => {
    const { root, lib } = await setup();
    await writeFile(join(root, 'notes.txt'), 'x');
    const here = await describeFolder(root);
    expect(here).toMatchObject({ kind: 'other', entries: 2, writable: true, library: null });
    expect(here.free).toBeGreaterThan(0);
    expect(await describeFolder(join(root, 'New One'))).toMatchObject({ kind: 'missing', entries: 0, writable: true });
    expect((await describeFolder(lib)).library).toEqual({ name: 'My Library', packs: 1 });
  });
});
