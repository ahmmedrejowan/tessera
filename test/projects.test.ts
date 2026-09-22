import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Project } from '@shared/project';
import { LibraryIndex } from '../src/main/index/indexer';
import { LibraryQueries } from '../src/main/index/query';
import { createLibrary } from '../src/main/library/layout';
import { createPack } from '../src/main/library/packs';
import { planCopy, readManifest, removeFromProject, runCopy, type CopySource } from '../src/main/projects/copy';
import { creditsMarkdown } from '../src/main/projects/credits';
import { ProjectService } from '../src/main/projects/service';
import { Jobs } from '../src/main/jobs';
import { dependencies, resolveRef } from '../src/main/projects/deps';
import { probeProject } from '../src/main/projects/engines';
import { tempDir } from './helpers';
import { writeZip } from './zipfixture';

describe('engine detection', () => {
  it('recognises Unity, Godot, Unreal and plain folders', async () => {
    const unity = tempDir();
    mkdirSync(join(unity, 'ProjectSettings'));
    writeFileSync(join(unity, 'ProjectSettings', 'ProjectVersion.txt'), 'm_EditorVersion: 6000.3.24f1\n');
    expect(await probeProject(unity)).toMatchObject({ engine: 'unity', engineVersion: '6000.3.24f1', target: 'Assets/ThirdParty', gltf: false });
    mkdirSync(join(unity, 'Packages'));
    writeFileSync(join(unity, 'Packages', 'manifest.json'), '{"dependencies":{"com.unity.cloud.gltfast":"6.0.0"}}');
    expect((await probeProject(unity)).gltf).toBe(true);

    const godot = tempDir();
    writeFileSync(join(godot, 'project.godot'), 'config/name="Bunny Dash"\nconfig/features=PackedStringArray("4.4", "Forward Plus")\n');
    expect(await probeProject(godot)).toMatchObject({ engine: 'godot', name: 'Bunny Dash', engineVersion: '4.4', target: 'assets/third_party' });

    const unreal = tempDir();
    writeFileSync(join(unreal, 'Shooter.uproject'), '{"EngineAssociation":"5.4"}');
    expect(await probeProject(unreal)).toMatchObject({ engine: 'unreal', name: 'Shooter', engineVersion: '5.4' });

    expect(await probeProject(tempDir())).toMatchObject({ engine: 'other', target: 'assets' });
  });
});

describe('model dependencies', () => {
  it('resolves relative links inside archives', () => {
    expect(resolveRef('original/K.zip!Models/FBX/car.gltf', 'car.bin')).toBe('original/K.zip!Models/FBX/car.bin');
    expect(resolveRef('original/K.zip!Models/FBX/car.obj', '../Textures/a%20b.png')).toBe('original/K.zip!Models/Textures/a b.png');
    expect(resolveRef('original/K.zip!car.obj', '../../x.png')).toBeNull();
    expect(resolveRef('original/car.obj', 'C:\\Users\\me\\wood.png')).toBeNull();
  });

  it('finds a glTF’s buffers and images, an OBJ’s material and maps, and textures named in an FBX', async () => {
    const root = tempDir();
    await createLibrary(root, 'lib');
    const pack = await createPack(root, 'Kit');
    await writeZip(join(pack.dir, 'original', 'kit.zip'), {
      'Models/car.gltf': JSON.stringify({ buffers: [{ uri: 'car.bin' }], images: [{ uri: '../Textures/car.png' }, { uri: 'data:image/png;base64,AAA' }] }),
      'Models/car.bin': 'x',
      'Textures/car.png': 'x',
      'Models/tree.obj': 'mtllib tree.mtl\no Tree\n',
      'Models/tree.mtl': 'newmtl Leaf\nmap_Kd -s 1 1 1 leaves big.png\nbump C:\\\\Users\\\\me\\\\bark.png\n',
      'Models/leaves big.png': 'x',
      'Textures/bark.png': 'x',
      'Models/rock.fbx': `Kaydara FBX Binary \x00\x00RelativeFilename\x00\x00\x00Textures\\rock_col.png\x00 junk`,
      'Textures/rock_col.png': 'x',
    });
    const refs = ['Models/car.gltf', 'Models/car.bin', 'Textures/car.png', 'Models/tree.obj', 'Models/tree.mtl', 'Models/leaves big.png', 'Textures/bark.png', 'Models/rock.fbx', 'Textures/rock_col.png'].map((r) => `original/kit.zip!${r}`);
    const deps = (r: string) => dependencies(pack.dir, refs, `original/kit.zip!${r}`).then((d) => d.map((x) => x.replace('original/kit.zip!', '')).sort());
    expect(await deps('Models/car.gltf')).toEqual(['Models/car.bin', 'Textures/car.png']);
    expect(await deps('Models/tree.obj')).toEqual(['Models/leaves big.png', 'Models/tree.mtl', 'Textures/bark.png']);
    expect(await deps('Models/rock.fbx')).toEqual(['Textures/rock_col.png']);
  });
});

describe('copying into a project', () => {
  it('copies the engine’s preferred format with its textures and licence, records it, writes credits, and removes cleanly', async () => {
    const root = tempDir();
    await createLibrary(root, 'lib');
    const kit = await createPack(root, 'Car Kit', {
      status: 'library',
      source: { site: 'kenney', name: null, url: 'https://kenney.nl/assets/car-kit', creator: 'Kenney', creatorUrl: null },
      licence: { id: 'CC0-1.0', attribution: null, proof: [], notes: '' },
    });
    await writeZip(join(kit.dir, 'original', 'kenney_car-kit.zip'), {
      'Models/GLB format/van.glb': 'glb',
      'Models/FBX format/van.fbx': 'fbx Textures\\colormap.png',
      'Models/FBX format/Textures/colormap.png': 'png',
      'License.txt': 'CC0',
    });
    const icons = await createPack(root, 'Icons', { status: 'library', licence: { id: 'CC-BY-3.0', attribution: 'Icons by Lorc, CC BY 3.0', proof: [], notes: '' }, source: { site: 'game-icons', name: null, url: null, creator: 'Lorc', creatorUrl: null } });
    mkdirSync(join(icons.dir, 'original', 'png'));
    writeFileSync(join(icons.dir, 'original', 'png', 'sword.png'), 'png');

    const index = new LibraryIndex(':memory:');
    await index.sync(root);
    const q = new LibraryQueries(index.db);
    const src: CopySource = {
      libraryId: 'lib-1',
      libraryName: 'Main',
      packDir: (id) => (id === kit.meta.id ? kit.dir : icons.dir),
      pack: (id) => {
        const row = q.pack(id);
        return row ? { meta: row.meta, folder: row.folder } : null;
      },
      variants: (packId, ref) => q.variantsOf(packId, ref),
      packRefs: (packId) => q.packRefs(packId),
    };
    const game = tempDir('tessera-game-');
    const project: Project = { id: 'p', name: 'Game', path: game, engine: 'unity', engineVersion: null, target: 'Assets/ThirdParty', creditsFile: 'CREDITS.md', addedAt: '' };
    const van = q.assets({ scope: 'all', text: 'van', filters: {} }, 'name', 0, 1).rows[0]!;
    const sword = q.assets({ scope: 'all', text: 'sword', filters: {} }, 'name', 0, 1).rows[0]!;
    const items = [{ packId: van.packId, ref: van.ref }, { packId: sword.packId, ref: sword.ref }];

    // Unity without a glTF importer takes the FBX, which brings its texture.
    const { plan, jobs } = await planCopy(project, items, src, false);
    expect(plan).toMatchObject({ assets: 2, files: 3, warnings: [], updating: 0 });
    await runCopy(project, jobs, src, () => undefined);
    const base = join(game, 'Assets', 'ThirdParty');
    expect(readFileSync(join(base, 'Car Kit', 'FBX format', 'van.fbx'), 'utf8')).toContain('fbx');
    expect(existsSync(join(base, 'Car Kit', 'FBX format', 'Textures', 'colormap.png'))).toBe(true);
    expect(readFileSync(join(base, 'Car Kit', 'LICENCE.txt'), 'utf8')).toContain('Creative Commons Zero');
    expect(existsSync(join(base, 'Icons', 'sword.png'))).toBe(true);
    const manifest = await readManifest(game, 'lib-1');
    expect(manifest.entries.map((e) => e.copiedRef.split('/').pop())).toEqual(['van.fbx', 'sword.png']);
    const credits = readFileSync(join(game, 'CREDITS.md'), 'utf8');
    expect(credits).toMatch(/## Credit required\n\n- Icons by Lorc, CC BY 3.0/);
    expect(credits).toMatch(/## Also used\n\n- “Car Kit” by Kenney — \[CC0\]/);

    // Copying again updates rather than duplicates.
    expect((await planCopy(project, items.slice(0, 1), src, false)).plan.updating).toBe(1);

    // Removing takes the files, the empty folders and the credit away.
    writeFileSync(join(base, 'Car Kit', 'FBX format', 'van.fbx.meta'), 'unity');
    await removeFromProject(project, 'lib-1', items.slice(0, 1));
    expect(existsSync(join(base, 'Car Kit'))).toBe(false);
    expect(existsSync(join(base, 'Icons', 'sword.png'))).toBe(true);
    expect(readFileSync(join(game, 'CREDITS.md'), 'utf8')).not.toContain('Car Kit');

    // A second library (here a restored copy: same pack ids) copies into the same project. Its
    // entries are its own: copying and removing never touch the first library's.
    const copySrc: CopySource = { ...src, libraryId: 'lib-2', libraryName: 'Main from Sep 22' };
    const again = await planCopy(project, items.slice(1), copySrc, false);
    expect(again.plan.updating).toBe(0);
    await runCopy(project, again.jobs, copySrc, () => undefined);
    const both = await readManifest(game, 'lib-1');
    expect(both.entries.map((e) => [e.libraryId, e.libraryName, e.copiedRef.split('/').pop()])).toEqual([
      ['lib-1', 'Main', 'sword.png'],
      ['lib-2', 'Main from Sep 22', 'sword.png'],
    ]);
    await removeFromProject(project, 'lib-1', [{ ...items[1]!, libraryId: 'lib-2' }]);
    expect((await readManifest(game, 'lib-1')).entries.map((e) => e.libraryId)).toEqual(['lib-1']);

    // The project's summary says where its assets came from, by the names this computer knows.
    const svc = new ProjectService(tempDir(), new Jobs(() => undefined));
    await svc.add({ path: game, name: 'Game', engine: 'unity', engineVersion: null, target: 'Assets/ThirdParty', gltf: false } as never);
    await runCopy(project, again.jobs, copySrc, () => undefined);
    const [summary] = await svc.list('lib-1', (id) => (id === 'lib-1' ? 'Main library' : null));
    expect(summary!.sources).toEqual([
      { libraryId: 'lib-1', libraryName: 'Main library', assets: 1 },
      { libraryId: 'lib-2', libraryName: 'Main from Sep 22', assets: 1 },
    ]);
  });

  it('writes a credits file even before anything is copied', () => {
    expect(creditsMarkdown([])).toContain('No assets copied yet.');
  });
});

