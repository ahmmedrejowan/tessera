/**
 * Archives kept open for a moment.
 *
 * Drawing a pack's thumbnails reads hundreds of files out of one zip, so an archive is kept open
 * and its list of entries kept with it. What matters is that it is still the same archive: a zip
 * that changes on disk must be read again, not answered from what was remembered of it.
 */
import { statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { closeAllZips, readCachedEntry } from '../src/main/index/zipCache';
import { tempDir } from './helpers';
import { makeZip, writeZip } from './zipfixture';

afterEach(() => closeAllZips());

describe('reading from an archive that is kept open', () => {
  it('reads it again when the file on disk has changed', async () => {
    const dir = tempDir();
    const zip = join(dir, 'kit.zip');
    await writeZip(zip, { 'notes.txt': 'first' });
    expect((await readCachedEntry(zip, zip, 'notes.txt', 1_000_000)).toString()).toBe('first');

    await writeZip(zip, { 'notes.txt': 'second, and longer' });
    // A zip written twice in the same millisecond would look unchanged, so its time is moved on.
    const then = statSync(zip).mtime;
    utimesSync(zip, then, new Date(then.getTime() + 2000));

    expect((await readCachedEntry(zip, zip, 'notes.txt', 1_000_000)).toString()).toBe('second, and longer');
  });

  it('reads a zip that is inside another zip, from its bytes', async () => {
    const inner = await makeZip({ 'Models/ship.obj': 'o ship\n' });
    const got = await readCachedEntry('outer.zip!inner.zip', async () => inner, 'Models/ship.obj', 1_000_000);
    expect(got.toString()).toBe('o ship\n');
    // Asked for twice, the second answer comes from the archive already open.
    expect((await readCachedEntry('outer.zip!inner.zip', async () => Buffer.alloc(0), 'Models/ship.obj', 1_000_000)).toString()).toBe('o ship\n');
  });

  it('refuses a file too big to hand over in one piece', async () => {
    const zip = join(tempDir(), 'big.zip');
    await writeZip(zip, { 'huge.bin': 'x'.repeat(5000) });
    await expect(readCachedEntry(zip, zip, 'huge.bin', 100)).rejects.toThrow(/too large/);
  });

  it('keeps working past the number of archives it will hold open', async () => {
    const dir = tempDir();
    const zips: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const zip = join(dir, `kit-${i}.zip`);
      await writeZip(zip, { 'what.txt': `archive ${i}` });
      zips.push(zip);
      expect((await readCachedEntry(zip, zip, 'what.txt', 1_000_000)).toString()).toBe(`archive ${i}`);
    }
    // The oldest were closed to stay within the limit; asking for one again simply opens it.
    expect((await readCachedEntry(zips[0]!, zips[0]!, 'what.txt', 1_000_000)).toString()).toBe('archive 0');
  });

  it('says plainly when the archive cannot be opened at all', async () => {
    const broken = join(tempDir(), 'broken.zip');
    writeFileSync(broken, 'not a zip');
    await expect(readCachedEntry(broken, broken, 'anything', 1000)).rejects.toThrow();
    // A failed open is not remembered: the next attempt tries again rather than answering from it.
    await expect(readCachedEntry(broken, broken, 'anything', 1000)).rejects.toThrow();
  });
});
