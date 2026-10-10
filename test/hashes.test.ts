/**
 * What a file contains, and what that lets the library answer.
 *
 * Size and name cannot tell two copies of the same thing from two different things, which is the
 * question behind "have I got this already", "did that bundle repeat itself" and "where in my
 * library did this file in my game come from".
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => import('./fake-electron'));

import { LibraryIndex } from '../src/main/index/indexer';
import { LibraryQueries } from '../src/main/index/query';
import { hashSome, stillToHash, forgetOrphanHashes } from '../src/main/index/hashes';
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

  it('answers "what else is this file" from whichever of the two it has', async () => {
    const root = tempDir();
    await createLibrary(root, 'Same');
    const pack = await createPack(root, 'Kit', { status: 'library', license: { id: 'CC0-1.0' }, source: { url: 'https://example.test/s' } } as never);
    await writeZip(join(pack.dir, 'original', 'kit.zip'), { 'a.png': 'TWINS', 'b.png': 'TWINS', 'c.png': 'alone' });
    const index = new LibraryIndex(':memory:');
    const q = new LibraryQueries(index.db);
    await index.sync(root);

    // Before anything has been read, nothing can be said: not the same as "nothing matches".
    expect(q.sameAs(pack.meta.id, 'original/kit.zip!a.png')).toBeNull();

    while ((await hashSome({ db: index.db, packDir: () => pack.dir, keepGoing: () => true }, 50)) > 0);

    // The twins were worth reading in full, so they are settled by hash.
    const twins = q.sameAs(pack.meta.id, 'original/kit.zip!a.png')!;
    expect(twins.map((t) => t.ref.split('!')[1])).toEqual(['b.png']);
    // The odd one out was told apart by its CRC alone, and still answers.
    expect(q.sameAs(pack.meta.id, 'original/kit.zip!c.png')).toEqual([]);
  });

  it('notes a file it cannot read instead of asking for it again for ever', async () => {
    const root = tempDir();
    await createLibrary(root, 'Broken');
    const pack = await createPack(root, 'Kit', { status: 'library', license: { id: 'CC0-1.0' }, source: { url: 'https://example.test/b' } } as never);
    mkdirSync(join(pack.dir, 'original', 'M'), { recursive: true });
    writeFileSync(join(pack.dir, 'original', 'M', 'a.glb'), 'a');
    const index = new LibraryIndex(':memory:');
    await index.sync(root);

    // The pack's folder has gone out from under it: every file in the batch fails.
    let passes = 0;
    while ((await hashSome({ db: index.db, packDir: () => join(root, 'nowhere'), keepGoing: () => true }, 50)) > 0) {
      if (++passes > 5) break;
    }
    // Written down rather than left unread, so the next pass does not try it again for ever, and
    // counted as progress, so one unreadable pack does not look like "nothing left to do".
    const rows = index.db.prepare("SELECT sha256, crc FROM file_hashes").all() as { sha256: string; crc: number }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.sha256 === '' && r.crc === 0)).toBe(true);
    expect(passes).toBeLessThanOrEqual(5);
    // And nothing is left claiming to be unread.
    expect(stillToHash(index.db)).toBe(0);
  });

  it('forgets the contents of a pack the library no longer holds', async () => {
    const root = tempDir();
    await createLibrary(root, 'Gone');
    const pack = await createPack(root, 'Kit', { status: 'library', license: { id: 'CC0-1.0' }, source: { url: 'https://example.test/g' } } as never);
    mkdirSync(join(pack.dir, 'original', 'M'), { recursive: true });
    writeFileSync(join(pack.dir, 'original', 'M', 'a.glb'), 'a');
    const index = new LibraryIndex(':memory:');
    await index.sync(root);
    while ((await hashSome({ db: index.db, packDir: () => pack.dir, keepGoing: () => true }, 50)) > 0);
    expect((index.db.prepare('SELECT count(*) AS n FROM file_hashes').get() as { n: number }).n).toBeGreaterThan(0);

    // A pack that went away while the app was closed. The rebuild holds foreign keys off, so
    // nothing clears these on its own any more.
    // Foreign keys off, as the rebuild has them: with them on the cascade clears these rows, and
    // it is precisely because the rebuild cannot afford that cascade that orphans can exist.
    index.db.exec('PRAGMA foreign_keys = OFF');
    index.db.exec("DELETE FROM packs WHERE id = '" + pack.meta.id + "'");
    index.db.exec('PRAGMA foreign_keys = ON');
    expect(forgetOrphanHashes(index.db)).toBeGreaterThan(0);
    expect((index.db.prepare('SELECT count(*) AS n FROM file_hashes').get() as { n: number }).n).toBe(0);
    // And asking again when there is nothing to forget costs nothing and removes nothing.
    expect(forgetOrphanHashes(index.db)).toBe(0);
  });

  it('counts the files still owing a full read, so the work is not called finished early', async () => {
    const root = tempDir();
    await createLibrary(root, 'Twins');
    const pack = await createPack(root, 'Twin Kit', { status: 'library', license: { id: 'CC0-1.0' }, source: { url: 'https://example.test/t' } } as never);
    await writeZip(join(pack.dir, 'original', 'kit.zip'), { 'a.png': 'THE SAME BYTES', 'b.png': 'THE SAME BYTES' });
    const index = new LibraryIndex(':memory:');
    await index.sync(root);
    // One pass over the files themselves: every row now has a CRC and nothing is unread.
    while ((await hashSome({ db: index.db, packDir: () => pack.dir, keepGoing: () => true }, 50)) > 0) {
      const left = stillToHash(index.db);
      if (left === 0) break;
    }
    // Whatever is left must be reported as left. Counting only unread files said zero here while
    // two files still owed a SHA, so the caller returned early and never settled them.
    const unsettled = index.db.prepare("SELECT count(*) AS n FROM file_hashes WHERE sha256 = '' AND crc != 0").get() as { n: number };
    if (unsettled.n > 0) expect(stillToHash(index.db)).toBeGreaterThan(0);
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
