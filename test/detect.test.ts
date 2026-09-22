import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listPackFiles } from '../src/main/index/files';
import { detectPack, nameFromDownload } from '../src/main/library/detect';
import { createLibrary } from '../src/main/library/layout';
import { createPack } from '../src/main/library/packs';
import { tempDir } from './helpers';
import { writeZip } from './zipfixture';

describe('pack names from downloads', () => {
  it.each([
    ['kenney_city-kit-roads_2.0.zip', 'City Kit Roads'],
    ['KayKit_Adventurers_2.0_FREE.zip', 'Adventurers'],
    ['Ultimate Stylized Nature - May 2022.zip', 'Ultimate Stylized Nature May 2022'],
    ['medieval_village_megakit (1).zip', 'Medieval Village Megakit'],
    ['kenney_3d-road-tiles.zip', '3D Road Tiles'],
    ['LowPolyTrees.zip', 'Low Poly Trees'],
  ])('%s → %s', (file, name) => {
    expect(nameFromDownload(file)).toBe(name);
  });
});

describe('detecting a pack', () => {
  it('reads the licence and site from files in the download', async () => {
    const root = tempDir();
    await createLibrary(root, 'lib');
    const pack = await createPack(root, 'City');
    await writeZip(join(pack.dir, 'original', 'kenney_city-kit.zip'), {
      'License.txt': 'City Kit (1.0)\n\nCreated/distributed by Kenney (www.kenney.nl)\n\nLicense: (Creative Commons Zero, CC0)\nhttp://creativecommons.org/publicdomain/zero/1.0/',
      'Models/car.glb': 'x',
    });
    const { files } = await listPackFiles(pack.dir);
    expect(await detectPack(pack.dir, files)).toEqual({ licence: 'CC0-1.0', licenceFrom: 'License.txt', licenceSure: true, site: 'kenney', url: null, creator: 'Kenney' });
  });

  it('prefers proof files saved in licence/ and picks up the site link', async () => {
    const root = tempDir();
    await createLibrary(root, 'lib');
    const pack = await createPack(root, 'Icons');
    writeFileSync(join(pack.dir, 'licence', 'license.txt'), 'Icons by Lorc, licensed under CC BY 3.0. https://game-icons.net/1x1/lorc/sword.html');
    writeFileSync(join(pack.dir, 'original', 'readme.txt'), 'This pack is public domain (CC0).');
    const { files } = await listPackFiles(pack.dir);
    expect(await detectPack(pack.dir, files)).toMatchObject({ licence: 'CC-BY-3.0', licenceFrom: 'license.txt', site: 'game-icons', url: 'https://game-icons.net/1x1/lorc/sword.html' });
  });

  it("falls back to a free site's usual licence, and says so", async () => {
    const root = tempDir();
    await createLibrary(root, 'lib');
    const pack = await createPack(root, 'Nature');
    writeFileSync(join(pack.dir, 'original', 'quaternius_nature.zip'), 'not really a zip');
    const { files } = await listPackFiles(pack.dir);
    expect(await detectPack(pack.dir, files, { downloadName: 'quaternius_nature.zip' })).toMatchObject({ licence: 'CC0-1.0', licenceFrom: 'Quaternius (usual licence)', site: 'quaternius' });
  });
});
