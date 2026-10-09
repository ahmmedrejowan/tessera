/**
 * What a file contains, and what that lets the library answer.
 *
 * Size and name cannot tell two copies of the same thing from two different things, which is the
 * question behind "have I got this already", "did that bundle repeat itself" and "where in my
 * library did this file in my game come from".
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => import('./fake-electron'));

import { LibraryIndex } from '../src/main/index/indexer';
import { LibraryQueries } from '../src/main/index/query';
import { hashSome, stillToHash } from '../src/main/index/hashes';
import { createLibrary } from '../src/main/library/layout';
import { createPack } from '../src/main/library/packs';
import { tempDir } from './helpers';
import { writeZip } from './zipfixture';

/** A library with two packs that share a file, and one file of their own each. */
async function twoPacks() {
  const root = tempDir();
  await createLibrary(root, 'Contents');
  const made: { id: string; dir: string; folder: string }[] = [];
  for (const [name, own] of [
    ['Kit One', 'only-in-one.png'],
    ['Kit Two', 'only-in-two.png'],
  ] as const) {
    const pack = await createPack(root, name, { status: 'library', license: { id: 'CC0-1.0' }, source: { url: 'https://example.test/k' } } as never);
    writeFileSync(join(pack.dir, 'original', 'shared.png'), 'THE SAME BYTES');
    writeFileSync(join(pack.dir, 'original', own), `different ${name}`);
    made.push({ id: pack.meta.id, dir: pack.dir, folder: pack.folder });
  }
  const index = new LibraryIndex(':memory:');
  const q = new LibraryQueries(index.db);
  await index.sync(root);
  const packDir = (packId: string) => made.find((m) => m.id === packId)?.dir ?? null;
  return { root, index, q, made, packDir };
}

describe('reading what files contain', () => {
  it('works through them a few at a time, and picks up where it left off', async () => {
    const { index, packDir } = await twoPacks();
    expect(stillToHash(index.db)).toBeGreaterThan(0);
    const first = await hashSome({ db: index.db, packDir, keepGoing: () => true }, 2);
    expect(first).toBe(2);
    let guard = 0;
    while (stillToHash(index.db) > 0 && guard++ < 50) await hashSome({ db: index.db, packDir, keepGoing: () => true }, 2);
    expect(stillToHash(index.db)).toBe(0);
  });

  it('stops when told to, and loses nothing it had already done', async () => {
    const { index, packDir } = await twoPacks();
    const before = stillToHash(index.db);
    const did = await hashSome({ db: index.db, packDir, keepGoing: () => false }, 10);
    expect(did).toBe(0);
    expect(stillToHash(index.db)).toBe(before);
  });

  it('does not read a file twice unless it has changed', async () => {
    const { index, packDir } = await twoPacks();
    while (stillToHash(index.db) > 0) await hashSome({ db: index.db, packDir, keepGoing: () => true }, 50);
    expect(await hashSome({ db: index.db, packDir, keepGoing: () => true }, 50)).toBe(0);
  });
});

describe('what the contents let it answer', () => {
  it('finds the same file wherever else it is', async () => {
    const { index, q, packDir, made } = await twoPacks();
    while (stillToHash(index.db) > 0) await hashSome({ db: index.db, packDir, keepGoing: () => true }, 50);

    const sha = q.hashOf(made[0]!.id, 'original/shared.png');
    expect(sha).toBeTruthy();
    const everywhere = q.byHash(sha!);
    // The same bytes, in both packs, under the same name here but it need not be.
    expect(everywhere).toHaveLength(2);
    expect(new Set(everywhere.map((a) => a.packId))).toEqual(new Set(made.map((m) => m.id)));

    // A file of its own is in one place only.
    const alone = q.hashOf(made[0]!.id, 'original/only-in-one.png');
    expect(q.byHash(alone!)).toHaveLength(1);
  });

  it('lists what the library holds more than once, the biggest waste first', async () => {
    const { index, q, packDir } = await twoPacks();
    while (stillToHash(index.db) > 0) await hashSome({ db: index.db, packDir, keepGoing: () => true }, 50);

    const dupes = q.duplicates();
    expect(dupes).toHaveLength(1);
    expect(dupes[0]!.copies).toBe(2);
    expect(dupes[0]!.name).toBe('shared.png');
    expect(dupes[0]!.packs).toHaveLength(2);
    // What the second copy costs, not what both do.
    expect(dupes[0]!.bytes).toBe('THE SAME BYTES'.length);
  });

  it('reads files inside an archive, which is where most of a library lives', async () => {
    const root = tempDir();
    await createLibrary(root, 'Zipped');
    const pack = await createPack(root, 'Zipped Kit', { status: 'library', license: { id: 'CC0-1.0' }, source: { url: 'https://example.test/z' } } as never);
    await writeZip(join(pack.dir, 'original', 'kit.zip'), { 'a.png': 'THE SAME BYTES', 'b.png': 'other' });
    const index = new LibraryIndex(':memory:');
    const q = new LibraryQueries(index.db);
    await index.sync(root);
    while (stillToHash(index.db) > 0) await hashSome({ db: index.db, packDir: () => pack.dir, keepGoing: () => true }, 50);

    // Told apart by the CRC the archive already stored: nothing was decompressed to learn it, so
    // there is no SHA-256 and no reason to want one.
    const crc = index.db.prepare("SELECT crc, sha256 FROM file_hashes WHERE ref = ?").get('original/kit.zip!a.png') as { crc: number; sha256: string };
    expect(crc.crc).toBeGreaterThan(0);
    expect(crc.sha256).toBe('');
    // And the question it exists to answer still gets an answer.
    expect(q.sameAs(pack.meta.id, 'original/kit.zip!a.png')).toEqual([]);
  });

  it('reads in full only the files that share a size and a CRC', async () => {
    const root = tempDir();
    await createLibrary(root, 'Twins');
    const pack = await createPack(root, 'Twin Kit', { status: 'library', license: { id: 'CC0-1.0' }, source: { url: 'https://example.test/t' } } as never);
    await writeZip(join(pack.dir, 'original', 'kit.zip'), { 'a.png': 'THE SAME BYTES', 'b.png': 'THE SAME BYTES', 'c.png': 'different' });
    const index = new LibraryIndex(':memory:');
    const q = new LibraryQueries(index.db);
    await index.sync(root);
    while ((await hashSome({ db: index.db, packDir: () => pack.dir, keepGoing: () => true }, 50)) > 0);

    const rows = index.db.prepare('SELECT ref, sha256 FROM file_hashes ORDER BY ref').all() as { ref: string; sha256: string }[];
    // Only what is inside the archive: the zip itself is a loose file, so it is read either way.
    const inside = rows.filter((r) => r.ref.includes('!'));
    const settled = inside.filter((r) => r.sha256 !== '');
    // The twins were worth reading; the odd one out was not.
    expect(settled.map((r) => r.ref.split('!')[1]).sort()).toEqual(['a.png', 'b.png']);
    expect(inside.find((r) => r.ref.endsWith('c.png'))!.sha256).toBe('');
    const twins = q.sameAs(pack.meta.id, 'original/kit.zip!a.png')!;
    expect(twins.map((t) => t.ref.split('!')[1])).toEqual(['b.png']);
  });
});
