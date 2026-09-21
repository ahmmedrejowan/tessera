import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { classify } from '@shared/assets';
import type { BrowseQuery } from '@shared/query';
import { displayPath, listPackFiles, parseRef, readPackFile } from '../src/main/index/files';
import { LibraryIndex } from '../src/main/index/indexer';
import { LibraryQueries, searchTerms } from '../src/main/index/query';
import { createLibrary } from '../src/main/library/layout';
import { createPack, editPack, readPack } from '../src/main/library/packs';
import { tempDir } from './helpers';
import { writeZip } from './zipfixture';

describe('classification', () => {
  const noModels = { hasModels: false };
  const withModels = { hasModels: true };
  it.each([
    ['Models/car_sedan.fbx', 0, noModels, 'model', 'main'],
    ['Textures/car_colormap.png', 0, withModels, 'texture', 'support'],
    ['Previews/preview.png', 0, withModels, 'sprite', 'preview'],
    ['PNG/Default/tile_0001.png', 0, noModels, 'sprite', 'main'],
    ['UI Pack/PNG/buttonLong_blue.png', 0, noModels, 'ui', 'main'],
    ['Bricks076_2K_NormalGL.jpg', 0, noModels, 'texture', 'main'],
    ['kloofendal_43d_clear_4k.hdr', 0, noModels, 'hdri', 'main'],
    ['Backgrounds/sky.png', 0, noModels, 'sprite', 'main'],
    ['Audio/footstep_grass_000.ogg', 20_000, noModels, 'sfx', 'main'],
    ['Music/Night Theme.ogg', 20_000, noModels, 'music', 'main'],
    ['Audio/long_track.ogg', 3_000_000, noModels, 'music', 'main'],
    ['Fonts/Kenney Future.ttf', 0, noModels, 'font', 'main'],
    ['License.txt', 0, noModels, 'other', 'doc'],
    ['LICENSE', 0, noModels, 'other', 'doc'],
    ['model.bin', 0, withModels, 'other', 'support'],
    ['Spritesheet/sheet.xml', 0, noModels, 'other', 'support'],
    ['Maps/level1.tmx', 0, noModels, 'other', 'main'],
  ] as const)('%s', (path, size, ctx, type, role) => {
    expect(classify(path, size, ctx)).toMatchObject({ type, role });
  });
});

describe('refs', () => {
  it('splits refs at archive boundaries only', () => {
    expect(parseRef('original/a.png')).toEqual({ file: 'original/a.png', inside: [] });
    expect(parseRef('original/All!.zip!City.ZIP!car.fbx')).toEqual({ file: 'original/All!.zip', inside: ['City.ZIP', 'car.fbx'] });
    expect(displayPath('original/Pack.zip!Models/car.fbx')).toBe('Pack.zip/Models/car.fbx');
  });

  it('turns typed text into prefix terms', () => {
    expect(searchTerms('carSedan  red"')).toEqual(['"car"*', '"sedan"*', '"red"*']);
    expect(searchTerms('   ')).toEqual([]);
  });
});

describe('pack files', () => {
  it('lists loose files and zip contents, nested zips included, and reads them back', async () => {
    const root = tempDir();
    await createLibrary(root, 'lib');
    const pack = await createPack(root, 'City');
    const orig = join(pack.dir, 'original');
    mkdirSync(join(orig, 'Extra'));
    writeFileSync(join(orig, 'Extra', 'readme.txt'), 'hello');
    writeFileSync(join(orig, '.DS_Store'), '');
    await writeZip(join(orig, 'City.zip'), {
      'Models/car.fbx': 'fbx',
      '__MACOSX/Models/._car.fbx': 'junk',
      'Models/car.fbx.meta': 'unity',
      'Inner.zip': { 'tree.glb': 'glb' },
    });
    const { files, problems } = await listPackFiles(pack.dir);
    expect(problems).toEqual([]);
    expect(files.map((f) => f.ref).sort()).toEqual([
      'original/City.zip',
      'original/City.zip!Inner.zip',
      'original/City.zip!Inner.zip!tree.glb',
      'original/City.zip!Models/car.fbx',
      'original/Extra/readme.txt',
    ]);
    expect((await readPackFile(pack.dir, 'original/City.zip!Inner.zip!tree.glb')).toString()).toBe('glb');
    expect((await readPackFile(pack.dir, 'original/Extra/readme.txt')).toString()).toBe('hello');
    await expect(readPackFile(pack.dir, 'original/../pack.json')).rejects.toThrow();
  });

  it('reports a damaged zip instead of failing', async () => {
    const root = tempDir();
    await createLibrary(root, 'lib');
    const pack = await createPack(root, 'Broken');
    writeFileSync(join(pack.dir, 'original', 'bad.zip'), 'not a zip');
    const { files, problems } = await listPackFiles(pack.dir);
    expect(files.map((f) => f.ref)).toEqual(['original/bad.zip']);
    expect(problems[0]).toMatch(/bad\.zip/);
  });
});

describe('index and queries', () => {
  let root: string;
  let index: LibraryIndex;
  let q: LibraryQueries;
  const base: BrowseQuery = { scope: 'all', text: '', filters: {} };

  beforeEach(async () => {
    root = tempDir();
    await createLibrary(root, 'lib');
    const city = await createPack(root, 'City Kit', {
      status: 'library',
      source: { site: 'kenney', name: null, url: null, creator: 'Kenney', creatorUrl: null },
      licence: { id: 'CC0-1.0', attribution: null, proof: [], notes: '' },
      genres: ['City'],
      tags: ['roads'],
    });
    await writeZip(join(city.dir, 'original', 'kenney_city-kit.zip'), {
      'Models/FBX/car_sedan.fbx': 'x',
      'Models/FBX/car_taxi.fbx': 'x',
      'Models/Textures/colormap.png': 'x',
      'Preview.png': 'x',
      'License.txt': 'CC0',
    });
    const sounds = await createPack(root, 'Impact Sounds', {
      status: 'inbox',
      source: { site: null, name: 'A friend', url: null, creator: 'Sam', creatorUrl: null },
      tags: ['impact'],
    });
    mkdirSync(join(sounds.dir, 'original', 'Audio'));
    writeFileSync(join(sounds.dir, 'original', 'Audio', 'impactMetal_heavy_000.ogg'), 'x');
    writeFileSync(join(sounds.dir, 'original', 'Audio', 'car_crash.ogg'), 'x');
    index = new LibraryIndex(':memory:');
    q = new LibraryQueries(index.db);
    await index.sync(root);
  });

  it('indexes packs and their assets, leaving supporting files out by default', () => {
    const all = q.assets(base, 'name', 0, 100);
    expect(all.rows.map((r) => r.name)).toEqual(['car_crash.ogg', 'car_sedan.fbx', 'car_taxi.fbx', 'impactMetal_heavy_000.ogg']);
    const withSupport = q.assets({ ...base, includeSupport: true }, 'name', 0, 100);
    expect(withSupport.total).toBe(8);
    const city = q.packs(base, 'name', 0, 10).rows[0]!;
    expect(city).toMatchObject({ name: 'City Kit', assetCount: 2, fileCount: 6, coverRef: 'original/kenney_city-kit.zip!Preview.png', types: { model: 2 } });
  });

  it('scopes to the library or the inbox', () => {
    expect(q.packs({ ...base, scope: 'library' }, 'name', 0, 10).rows.map((p) => p.name)).toEqual(['City Kit']);
    expect(q.packs({ ...base, scope: 'inbox' }, 'name', 0, 10).rows.map((p) => p.name)).toEqual(['Impact Sounds']);
  });

  it('searches asset names and pack words together', () => {
    const names = (text: string) => q.assets({ ...base, text }, 'name', 0, 100).rows.map((r) => r.name);
    expect(names('car')).toEqual(['car_crash.ogg', 'car_sedan.fbx', 'car_taxi.fbx']);
    expect(names('kenney car')).toEqual(['car_sedan.fbx', 'car_taxi.fbx']);
    expect(names('impact metal')).toEqual(['impactMetal_heavy_000.ogg']);
    expect(names('sed')).toEqual(['car_sedan.fbx']);
    expect(names('roads taxi')).toEqual(['car_taxi.fbx']);
    expect(names('heavy')).toEqual(['impactMetal_heavy_000.ogg']);
    expect(q.packs({ ...base, text: 'sedan' }, 'name', 0, 10).rows.map((p) => p.name)).toEqual(['City Kit']);
  });

  it('ranks whole-word matches first when sorting by relevance', () => {
    const names = (text: string) => q.assets({ ...base, text }, 'relevance', 0, 100).rows.map((r) => r.name);
    // "cra" is only a prefix everywhere; "crash" is a whole word in one name.
    expect(names('crash')).toEqual(['car_crash.ogg']);
    expect(names('sedan car')[0]).toBe('car_sedan.fbx');
    expect(names('ca')).toEqual(['car_crash.ogg', 'car_sedan.fbx', 'car_taxi.fbx']);
  });

  it('filters by facets and counts each facet without its own filter', () => {
    const query: BrowseQuery = { ...base, filters: { type: ['model'] } };
    expect(q.assets(query, 'name', 0, 100).total).toBe(2);
    const f = q.facets(query, 'assets');
    expect(f.type).toEqual([{ value: 'sfx', count: 2 }, { value: 'model', count: 2 }].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)));
    expect(f.source).toEqual([{ value: 'kenney', count: 2 }]);
    expect(f.licence).toEqual([{ value: 'CC0-1.0', count: 2 }]);
    expect(f.genre).toEqual([{ value: 'city', count: 2 }]);
    const packsFacets = q.facets({ ...base, filters: { tag: ['impact'] } }, 'packs');
    expect(packsFacets.type).toEqual([{ value: 'sfx', count: 1 }]);
    expect(packsFacets.tag).toEqual([{ value: 'impact', count: 1 }, { value: 'roads', count: 1 }]);
  });

  it('only re-reads packs that changed, and forgets removed ones', async () => {
    expect((await index.sync(root)).changed).toBe(0);
    const packDir = join(root, 'packs', 'Impact Sounds');
    const rec = await readPack(packDir, 'Impact Sounds');
    await editPack(rec, { tags: ['impact', 'metal'] });
    expect((await index.sync(root)).changed).toBe(1);
    expect(q.packs({ ...base, filters: { tag: ['metal'] } }, 'name', 0, 10).total).toBe(1);
    const { rmSync } = await import('node:fs');
    rmSync(packDir, { recursive: true });
    const result = await index.sync(root);
    expect(result.removed).toBe(1);
    expect(q.assets(base, 'name', 0, 100).total).toBe(2);
    expect(q.stats()).toMatchObject({ packs: 1, inbox: 0, assets: 2, byType: { model: 2 } });
  });
});
