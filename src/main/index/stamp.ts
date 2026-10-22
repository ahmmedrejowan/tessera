import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import { packFileStamp, parseRef, readPackFile } from './files';

/** Files larger than this are left alone: reading them costs more than knowing would be worth. */
export const MAX_BYTES = 256 * 1024 * 1024;

/**
 * What a file contains, worked out rather than looked up.
 *
 * This is the expensive half of reading a library: parsing an archive's table of contents, pulling
 * bytes out of it, and hashing them. It knows nothing about the index, which is what lets it run
 * somewhere other than the main process.
 *
 * `stamp` is the cheap pass: inside an archive the table of contents already holds a CRC, so
 * nothing is read at all. `settle` is for the few files whose size and CRC match something else
 * and so have to be read in full to be told apart.
 */
export type StampMode = 'stamp' | 'settle';

export interface Stamp {
  /** Absent when the archive could not say, and the file had to be read instead. */
  size?: number;
  crc32: number;
  /** Empty when the CRC was enough and nothing was read. */
  sha256: string;
}

/** Both numbers for a loose file in one pass, a chunk at a time, so neither memory nor the thread is held. */
async function stampOfFile(path: string): Promise<Stamp> {
  const h = createHash('sha256');
  let crc = 0;
  for await (const chunk of createReadStream(path)) {
    const b = chunk as Buffer;
    h.update(b);
    crc = crc32(b, crc);
  }
  return { crc32: crc, sha256: h.digest('hex') };
}

export async function stampOne(packDir: string, ref: string, mode: StampMode): Promise<Stamp> {
  const { file, inside } = parseRef(ref);
  if (inside.length) {
    if (mode === 'stamp') {
      // The archive already knows: no reading, no decompressing, the same cost for a 2 GB file
      // as a 2 KB one.
      const known = await packFileStamp(packDir, ref);
      if (known) return { size: known.size, crc32: known.crc32, sha256: '' };
    }
    const b = await readPackFile(packDir, ref, MAX_BYTES);
    return { crc32: crc32(b), sha256: createHash('sha256').update(b).digest('hex') };
  }
  return stampOfFile(join(packDir, ...file.split('/')));
}
