import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { binFiles, binPack, emptyBin, readBin, restoreFromBin, sweepBin } from '../src/main/library/bin';
import { createLibrary, DIRS } from '../src/main/library/layout';
import { createPack } from '../src/main/library/packs';
import { tempDir } from './helpers';

describe('the library bin', () => {
  const library = async () => {
    const root = tempDir();
    await createLibrary(root, 'lib');
    const pack = await createPack(root, 'City Kit', { status: 'library' });
    mkdirSync(join(pack.dir, 'original', 'Models'), { recursive: true });
    writeFileSync(join(pack.dir, 'original', 'Models', 'car.fbx'), 'x');
    return { root, pack };
  };

  it('takes a file out and puts it back where it was', async () => {
    const { root, pack } = await library();
    const ref = 'original/Models/car.fbx';
    await binFiles(root, pack.dir, pack.meta.id, 'City Kit', [{ ref, size: 1, inArchive: false }]);
    expect(existsSync(join(pack.dir, 'original', 'Models', 'car.fbx'))).toBe(false);
    const [entry] = await readBin(root);
    expect(entry).toMatchObject({ kind: 'file', shown: 'Models/car.fbx', hiddenOnly: false });

    await restoreFromBin(root, entry!.id, () => pack.dir, join(root, DIRS.packs));
    expect(existsSync(join(pack.dir, 'original', 'Models', 'car.fbx'))).toBe(true);
    expect(await readBin(root)).toHaveLength(0);
  });

  it('only records a file that lives inside an archive, since it cannot be moved out', async () => {
    const { root, pack } = await library();
    await binFiles(root, pack.dir, pack.meta.id, 'City Kit', [{ ref: 'original/kit.zip!Models/car.fbx', size: 1, inArchive: true }]);
    const [entry] = await readBin(root);
    expect(entry).toMatchObject({ hiddenOnly: true, shown: 'kit.zip/Models/car.fbx' });
    // Nothing was written for it, and putting it back simply forgets the record.
    await restoreFromBin(root, entry!.id, () => pack.dir, join(root, DIRS.packs));
    expect(await readBin(root)).toHaveLength(0);
  });

  it('takes a whole pack and gives it back', async () => {
    const { root, pack } = await library();
    const folder = basename(pack.dir);
    await binPack(root, pack.meta.id, 'City Kit', folder, pack.dir, 10);
    expect(existsSync(pack.dir)).toBe(false);
    const [entry] = await readBin(root);
    await restoreFromBin(root, entry!.id, () => pack.dir, join(root, DIRS.packs));
    expect(existsSync(join(pack.dir, 'original', 'Models', 'car.fbx'))).toBe(true);
  });

  it('empties, and sweeps away what has waited too long', async () => {
    const { root, pack } = await library();
    await binFiles(root, pack.dir, pack.meta.id, 'City Kit', [{ ref: 'original/Models/car.fbx', size: 1, inArchive: false }]);
    expect(await sweepBin(root, 30)).toBe(0);
    expect(await sweepBin(root, 0)).toBe(0);
    expect(await emptyBin(root)).toBe(1);
    expect(await readBin(root)).toHaveLength(0);
    expect(existsSync(join(pack.dir, 'original', 'Models', 'car.fbx'))).toBe(false);
  });

  it('sweeps an entry once its time is up', async () => {
    const { root, pack } = await library();
    await binFiles(root, pack.dir, pack.meta.id, 'City Kit', [{ ref: 'original/Models/car.fbx', size: 1, inArchive: false }]);
    const entries = await readBin(root);
    // Pretend it went in two months ago.
    const old = [{ ...entries[0]!, deletedAt: new Date(Date.now() - 60 * 86_400_000).toISOString() }];
    writeFileSync(join(root, DIRS.bin, 'bin.json'), JSON.stringify({ format: 1, entries: old }));
    expect(await sweepBin(root, 30)).toBe(1);
    expect(await readBin(root)).toHaveLength(0);
  });
});
