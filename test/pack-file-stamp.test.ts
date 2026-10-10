import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cachedEntryInfo, closeAllZips } from '../src/main/index/zipCache';
import { listPackFiles, packFileStamp } from '../src/main/index/files';
import { tempDir } from './helpers';
import { writeZip } from './zipfixture';

/**
 * What an archive already knows about a file it holds.
 *
 * A zip records a CRC-32 and an uncompressed size for every entry in its table of contents, so
 * both can be had without reading or decompressing anything. That is what lets a library of zips
 * be told apart without being read, and it has to be right: a wrong CRC would make two different
 * files look like one.
 */
describe('what an archive already knows about its files', () => {
  afterAll(() => closeAllZips());

  it('gives the size and CRC of a file inside a zip without reading it', async () => {
    const dir = tempDir();
    mkdirSync(join(dir, 'original'), { recursive: true });
    await writeZip(join(dir, 'original', 'kit.zip'), { 'a.txt': 'hello', 'b.txt': 'hello', 'c.txt': 'different' });

    const a = await packFileStamp(dir, 'original/kit.zip!a.txt');
    const b = await packFileStamp(dir, 'original/kit.zip!b.txt');
    const c = await packFileStamp(dir, 'original/kit.zip!c.txt');
    expect(a).toEqual({ size: 5, crc32: expect.any(Number) });
    // Same bytes, same CRC: this is the whole basis for telling copies apart cheaply.
    expect(b!.crc32).toBe(a!.crc32);
    expect(c!.crc32).not.toBe(a!.crc32);
    expect(a!.crc32).toBeGreaterThan(0);
  });

  it('says nothing about a loose file, which keeps no such record', async () => {
    const dir = tempDir();
    mkdirSync(join(dir, 'original'), { recursive: true });
    writeFileSync(join(dir, 'original', 'loose.txt'), 'hello');
    expect(await packFileStamp(dir, 'original/loose.txt')).toBeNull();
  });

  it('says nothing when the archive or the entry is not there', async () => {
    const dir = tempDir();
    mkdirSync(join(dir, 'original'), { recursive: true });
    await writeZip(join(dir, 'original', 'kit.zip'), { 'a.txt': 'hello' });
    expect(await packFileStamp(dir, 'original/kit.zip!missing.txt')).toBeNull();
    expect(await packFileStamp(dir, 'original/gone.zip!a.txt')).toBeNull();
  });

  it('reads an archive once and answers from it again', async () => {
    const dir = tempDir();
    mkdirSync(join(dir, 'original'), { recursive: true });
    const zip = join(dir, 'original', 'kit.zip');
    await writeZip(zip, { 'a.txt': 'hello', 'b.txt': 'world' });
    // Second and third answers come from the archive already open, which is the point of keeping it.
    const one = await cachedEntryInfo(zip, zip, 'a.txt');
    const two = await cachedEntryInfo(zip, zip, 'b.txt');
    const again = await cachedEntryInfo(zip, zip, 'a.txt');
    expect(one!.size).toBe(5);
    expect(two!.size).toBe(5);
    expect(again).toEqual(one);
    expect(await cachedEntryInfo(zip, zip, 'nope.txt')).toBeNull();
    // Closing everything is how a library going away lets go of its file handles.
    closeAllZips();
    expect((await cachedEntryInfo(zip, zip, 'a.txt'))!.crc32).toBe(one!.crc32);
  });

  it('reads a pack whose folder is not there as empty, rather than failing', async () => {
    // The readdir here is guarded, but only ever ran its guard when a folder happened to vanish
    // mid-run: the coverage number moved by a few functions between identical runs because of it.
    // Asking outright pins it, and is the behaviour a pack on a disconnected drive depends on.
    const gone = join(tempDir(), 'not-here');
    const { files, problems } = await listPackFiles(gone);
    expect(files).toEqual([]);
    expect(problems).toEqual([]);
  });
});
