import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { crc32 } from 'node:zlib';
import { packFileStamp, parseRef, readPackFile } from './files';
import { log } from '../log';

/**
 * What every file in the library actually contains.
 *
 * Size and name are what the app could cheaply know, and neither answers the question people
 * really ask: is this the same thing I already have? Two kits from two bundles ship the same barrel
 * under different names; the same pack bought twice has every file twice; a game already holds
 * files that came from a pack nobody recorded. All of those are one question, and the answer is
 * the contents.
 *
 * Hashing is the one expensive thing here, so it happens in the background, a little at a time,
 * and what it works out is kept until the file itself changes.
 */

/** Files bigger than this are left alone: reading gigabytes to compare them is not worth it. */
const MAX_BYTES = 256 * 1024 * 1024;
/** How many to do before giving the rest of the app a turn. */
const BATCH = 24;

export interface HashDeps {
  db: DatabaseSync;
  /** Where a pack's files are, by its id. */
  packDir: (packId: string) => string | null;
  /** Whether to keep going: paused while the app itself is writing to the library. */
  keepGoing: () => boolean;
  onProgress?: (done: number, total: number) => void;
}

export const sha256OfFile = (path: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const h = createHash('sha256');
    const s = createReadStream(path);
    s.on('data', (c) => h.update(c));
    // Closed on the way out either way. Windows will not delete a file something still has open,
    // so a stream left behind by a failed read stops a pack ever going in the bin.
    s.on('error', (e) => {
      s.destroy();
      reject(e);
    });
    s.on('end', () => {
      s.destroy();
      resolve(h.digest('hex'));
    });
  });

export const sha256OfBuffer = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

/** What one file of a pack contains, read now rather than looked up. */
export const sha256OfRef = async (packDir: string, ref: string): Promise<string> => {
  const { file, inside } = parseRef(ref);
  return inside.length ? sha256OfBuffer(await readPackFile(packDir, ref, MAX_BYTES)) : sha256OfFile(join(packDir, ...file.split('/')));
};

/**
 * Work out the contents of files that have none recorded, or whose recorded one is stale.
 *
 * Returns how many it did. Safe to call again at any time: it picks up where it left off, and a
 * file whose size and time still match what was hashed is skipped.
 */
export async function hashSome(d: HashDeps, limit = BATCH): Promise<number> {
  // A library can be closed while this is between batches, which leaves the database shut and its
  // statements finalised. That is an ordinary end to the work, not a fault, so it stops quietly.
  if (!d.keepGoing()) return 0;
  const rows = d.db
    .prepare(
      `SELECT a.pack_id AS packId, a.ref AS ref, a.size AS size, a.mtime AS mtime
         FROM assets a
         LEFT JOIN file_hashes h ON h.pack_id = a.pack_id AND h.ref = a.ref
        WHERE a.size > 0 AND a.size <= ?
          AND (h.sha256 IS NULL OR h.size != a.size OR h.mtime != a.mtime)
        -- By pack, so a batch stays inside one archive. Unordered, a batch of files scattered
        -- across a library's packs reopens an archive per file and parses its whole central
        -- directory again each time, which costs far more than the hashing.
        ORDER BY a.pack_id, a.ref
        LIMIT ?`,
    )
    .all(MAX_BYTES, limit) as { packId: string; ref: string; size: number; mtime: number }[];
  if (!rows.length) return settleCollisions(d, limit);

  if (!d.keepGoing()) return 0;
  const write = d.db.prepare('INSERT OR REPLACE INTO file_hashes (pack_id, ref, size, mtime, crc, sha256) VALUES (?, ?, ?, ?, ?, ?)');
  let done = 0;
  for (const row of rows) {
    if (!d.keepGoing()) break;
    const dir = d.packDir(row.packId);
    if (!dir) continue;
    try {
      const { file, inside } = parseRef(row.ref);
      if (inside.length) {
        // Inside an archive: the table of contents already holds the CRC, so nothing is read.
        // Whether this file is worth reading in full is decided later, by whether anything else
        // turns out to share its size and CRC.
        const stamp = await packFileStamp(dir, row.ref);
        if (stamp) {
          write.run(row.packId, row.ref, stamp.size, row.mtime, stamp.crc32, '');
          done++;
          continue;
        }
      }
      // A loose file has to be read to be known at all, so once it is open both are taken in the
      // same pass: the CRC costs nothing next to the read, and this way it never needs reading twice.
      const path = join(dir, ...file.split('/'));
      const buf = inside.length ? await readPackFile(dir, row.ref, MAX_BYTES) : await readFile(path);
      const now = inside.length ? row : await stat(path).catch(() => row);
      write.run(
        row.packId,
        row.ref,
        row.size,
        Math.round('mtimeMs' in now ? (now as { mtimeMs: number }).mtimeMs : row.mtime),
        crc32(buf),
        sha256OfBuffer(buf),
      );
      done++;
    } catch (e) {
      // Unreadable, gone, or an archive that will not open. Recorded as nothing so it is not tried
      // again on every pass; it will be picked up if the file itself changes.
      write.run(row.packId, row.ref, row.size, row.mtime, 0, '');
      log.warn('hashes', `could not read ${row.ref}`, e instanceof Error ? e.message : e);
    }
  }
  return done;
}

/** How many files are still to be read. */
export function stillToHash(db: DatabaseSync): number {
  const row = db
    .prepare(
      `SELECT count(*) AS n FROM assets a
         LEFT JOIN file_hashes h ON h.pack_id = a.pack_id AND h.ref = a.ref
        WHERE a.size > 0 AND a.size <= ?
          AND (h.sha256 IS NULL OR h.size != a.size OR h.mtime != a.mtime)`,
    )
    .get(MAX_BYTES) as { n: number };
  return row.n;
}

/**
 * CRC-32 collides, so a shared size and CRC is a strong hint and not an answer. These are the only
 * files worth reading in full: everything else has already been told apart by a number the archive
 * handed over for nothing. On a library of game assets this is a few hundred files out of a
 * hundred thousand.
 */
async function settleCollisions(d: HashDeps, limit: number): Promise<number> {
  if (!d.keepGoing()) return 0;
  const rows = d.db
    .prepare(
      `SELECT h.pack_id AS packId, h.ref AS ref, h.size AS size, h.mtime AS mtime
         FROM file_hashes h
         JOIN (SELECT size, crc FROM file_hashes WHERE sha256 = '' AND crc != 0
                GROUP BY size, crc HAVING count(*) > 1) g
           ON g.size = h.size AND g.crc = h.crc
        WHERE h.sha256 = ''
        ORDER BY h.pack_id, h.ref
        LIMIT ?`,
    )
    .all(limit) as { packId: string; ref: string; size: number; mtime: number }[];
  if (!rows.length) return 0;
  const write = d.db.prepare('UPDATE file_hashes SET sha256 = ? WHERE pack_id = ? AND ref = ?');
  let done = 0;
  for (const row of rows) {
    if (!d.keepGoing()) break;
    const dir = d.packDir(row.packId);
    if (!dir) continue;
    try {
      const { file, inside } = parseRef(row.ref);
      const sha = inside.length
        ? sha256OfBuffer(await readPackFile(dir, row.ref, MAX_BYTES))
        : await sha256OfFile(join(dir, ...file.split('/')));
      write.run(sha, row.packId, row.ref);
      done++;
    } catch (e) {
      // Nothing more to try: leave it told apart by size and CRC alone.
      write.run('-', row.packId, row.ref);
      log.warn('hashes', `could not settle ${row.ref}`, e instanceof Error ? e.message : e);
    }
  }
  return done;
}
