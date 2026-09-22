import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isFolderOfPacks, planImport } from '../src/main/import/plan';
import { runImport } from '../src/main/import/run';
import { suggestDetails } from '../src/main/import/suggest';
import { LibraryIndex } from '../src/main/index/indexer';
import { createLibrary } from '../src/main/library/layout';
import { tempDir } from './helpers';
import { writeZip } from './zipfixture';

const f = (ref: string, size = 10) => ({ ref, size, mtime: 0 }) as never;

describe('what a pack suggests', () => {
  it('reads the name, version and creator from a licence file’s first lines', () => {
    const s = suggestDetails({
      files: [f('kenney_mini-arcade.zip!Models/GLB format/arcade-machine.glb'), f('kenney_mini-arcade.zip!Models/FBX format/arcade-machine.fbx'), f('kenney_mini-arcade.zip!Models/GLB format/claw.glb')],
      texts: [{ from: 'License.txt', text: '\n\tMini Arcade (1.2)\n\n\tCreated/distributed by Kenney (www.kenney.nl)\n\tLicense: (Creative Commons Zero, CC0)' }],
      downloadName: 'kenney_mini-arcade.zip',
    });
    expect(s.name).toEqual({ value: 'Mini Arcade', from: 'License.txt', sure: true });
    expect(s.version).toEqual({ value: '1.2', from: 'License.txt', sure: true });
    expect(s.creator?.value).toBe('Kenney');
    // What's inside, counted once per model whatever its formats.
    expect(s.description).toEqual({ value: '2 models, as GLB and FBX.', from: 'the pack’s files', sure: false });
    expect(s.tags?.value).toContain('arcade');
    expect(s.tags?.value).not.toContain('models');
  });

  it('guesses a version from the file name, a style from its words, and prefers a readme’s description', () => {
    const s = suggestDetails({
      files: [f('forest_pixel_sprites_v2.zip!forest/trees/tree_1.png'), f('forest_pixel_sprites_v2.zip!forest/rocks/rock.png')],
      texts: [{ from: 'README.md', text: '# Forest\n\nA set of hand-made trees, rocks and bushes for top-down forest levels.\n\nMore soon.' }],
      downloadName: 'forest_pixel_sprites_v2.zip',
    });
    expect(s.version).toEqual({ value: '2', from: 'the file name', sure: false });
    expect(s.styles?.value).toEqual(['Pixel art']);
    expect(s.description?.value).toBe('A set of hand-made trees, rocks and bushes for top-down forest levels.');
    expect(s.tags?.value[0]).toBe('forest');
  });
});

describe('adding through the add page', () => {
  it('decides by itself whether a folder is one pack or a folder of packs', async () => {
    const d = tempDir('tessera-dl-');
    mkdirSync(join(d, 'bundle'));
    await writeZip(join(d, 'bundle', 'caves.zip'), { 'a.png': 'x' });
    await writeZip(join(d, 'bundle', 'dungeon.zip'), { 'b.png': 'x' });
    writeFileSync(join(d, 'bundle', 'readme.txt'), 'bundle');
    mkdirSync(join(d, 'pack', 'Textures'), { recursive: true });
    writeFileSync(join(d, 'pack', 'Textures', 'wood.png'), 'x');
    writeFileSync(join(d, 'pack', 'rock.glb'), 'x');
    expect(await isFolderOfPacks(join(d, 'bundle'))).toBe(true);
    expect(await isFolderOfPacks(join(d, 'pack'))).toBe(false);
    const items = await planImport([join(d, 'bundle'), join(d, 'pack')], 'auto');
    expect(items.map((i) => [i.name, i.folder ?? null])).toEqual([
      ['Caves', join(d, 'bundle')],
      ['Dungeon', join(d, 'bundle')],
      ['Pack', null],
    ]);
  });

  it('keeps every pack waiting, even sure ones, until the user decides', async () => {
    const root = join(tempDir(), 'lib');
    await createLibrary(root, 'lib');
    const d = tempDir('tessera-dl-');
    await writeZip(join(d, 'kenney_tiny.zip'), { 'License.txt': 'Tiny (1.0)\nCreated/distributed by Kenney\nLicense: (Creative Commons Zero, CC0)', 'a.png': 'x' });
    const items = await planImport([join(d, 'kenney_tiny.zip')]);
    const index = new LibraryIndex(':memory:');
    const staged = await runImport(items, { root, index, skipInboxWhenSure: true, stage: true, onProgress: () => undefined });
    expect(staged.added).toEqual([{ id: expect.any(String), item: items[0]!.id, name: 'Tiny', status: 'inbox' }]);
    const direct = await runImport(await planImport([join(d, 'kenney_tiny.zip')]), { root, index, skipInboxWhenSure: true, onProgress: () => undefined });
    expect(direct.added[0]!.status).toBe('library');
  });
});
