import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hostOf, ruleFor } from '../src/shared/siteRules';
import type { SiteRule } from '../src/shared/types';
import { planImport } from '../src/main/import/plan';
import { runImport } from '../src/main/import/run';
import { LibraryIndex } from '../src/main/index/indexer';
import { listPackFiles } from '../src/main/index/files';
import { createLibrary, DIRS } from '../src/main/library/layout';
import { detectPack } from '../src/main/library/detect';
import { readPack } from '../src/main/library/packs';
import { tempDir } from './helpers';
import { writeZip } from './zipfixture';

/** The one pack in a fresh library. */
async function onlyPack(root: string) {
  const [folder] = (await readdir(join(root, DIRS.packs))).filter((n) => !n.startsWith('.'));
  return readPack(join(root, DIRS.packs, folder!), folder!);
}

const rule = (host: string, licence: string | null, creator: string | null = null): SiteRule => ({ host, licence, creator, addedAt: '2026-01-01T00:00:00.000Z' });

describe('a site the user has settled', () => {
  it('reads the host out of whatever the user typed', () => {
    expect(hostOf('https://polyhaven.com/a/rock_04')).toBe('polyhaven.com');
    expect(hostOf('www.polyhaven.com')).toBe('polyhaven.com');
    expect(hostOf('POLYHAVEN.COM/')).toBe('polyhaven.com');
    expect(hostOf('polyhaven')).toBeNull();
    expect(hostOf('  ')).toBeNull();
  });

  it('covers subdomains, and the most exact host wins', () => {
    const rules = [rule('itch.io', 'CC-BY-4.0'), rule('kaylousberg.itch.io', 'CC0-1.0')];
    expect(ruleFor(rules, 'https://someone.itch.io/pack')?.licence).toBe('CC-BY-4.0');
    expect(ruleFor(rules, 'https://kaylousberg.itch.io/kaykit')?.licence).toBe('CC0-1.0');
    expect(ruleFor(rules, 'https://kenney.nl/assets/x')).toBeNull();
    expect(ruleFor(rules, null)).toBeNull();
  });

  it('fills in the licence and creator for a site Tessera doesn’t know', async () => {
    const root = join(tempDir(), 'lib');
    await createLibrary(root, 'lib');
    const d = tempDir('tessera-rules-');
    await writeZip(join(d, 'stone-set.zip'), { 'readme.txt': 'Stones\n\nFrom https://free-stones.example/packs/stone-set', 'rock.glb': 'x' });
    const items = await planImport([join(d, 'stone-set.zip')]);
    const index = new LibraryIndex(':memory:');
    const rules = [rule('free-stones.example', 'CC0-1.0', 'Stone Person')];
    const out = await runImport(items, { root, index, skipInboxWhenSure: true, siteRules: rules, onProgress: () => undefined });

    // The user said this site is CC0, so it needn't wait in Review.
    expect(out.added[0]!.status).toBe('library');
    const pack = await onlyPack(root);
    expect(pack.meta.licence.id).toBe('CC0-1.0');
    expect(pack.meta.source.url).toBe('https://free-stones.example/packs/stone-set');
    expect(pack.meta.source.creator).toBe('Stone Person');

    const { files } = await listPackFiles(pack.dir);
    const found = await detectPack(pack.dir, files, 'stone-set.zip', rules);
    expect(found.licenceFrom).toBe('your rule for free-stones.example');
  });

  it('never overrules what the pack’s own files say', async () => {
    const root = join(tempDir(), 'lib');
    await createLibrary(root, 'lib');
    const d = tempDir('tessera-rules-');
    await writeZip(join(d, 'tiles.zip'), { 'License.txt': 'Tiles (1.0)\nLicense: Creative Commons Attribution 4.0 (CC BY 4.0)\nhttps://free-stones.example/packs/tiles', 'a.png': 'x' });
    const items = await planImport([join(d, 'tiles.zip')]);
    const index = new LibraryIndex(':memory:');
    const out = await runImport(items, { root, index, skipInboxWhenSure: true, siteRules: [rule('free-stones.example', 'CC0-1.0')], onProgress: () => undefined });
    const pack = await onlyPack(root);
    expect(pack.meta.licence.id).toBe('CC-BY-4.0');
  });
});
