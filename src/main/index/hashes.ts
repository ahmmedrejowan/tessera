import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { parseRef, readPackFile } from './files';
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

const sha256OfFile = (path: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const h = createHash('sha256');
    const s = createReadStream(path);
    s.on('data', (c) => h.update(c));
    s.on('error', reject);
    s.on('end', () => resolve(h.digest('hex')));
  });

const sha256OfBuffer = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

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
        LIMIT ?`,
    )
    .all(MAX_BYTES, limit) as { packId: string; ref: string; size: number; mtime: number }[];
  if (!rows.length) return 0;

  if (!d.keepGoing()) return 0;
  const write = d.db.prepare('INSERT OR REPLACE INTO file_hashes (pack_id, ref, size, mtime, sha256) VALUES (?, ?, ?, ?, ?)');
  let done = 0;
  for (const row of rows) {
    if (!d.keepGoing()) break;
    const dir = d.packDir(row.packId);
    if (!dir) continue;
    try {
      const { file, inside } = parseRef(row.ref);
      // A file inside an archive is read out of it; a loose file is streamed, so a large one does
      // not have to be held in memory all at once.
      const sha = inside.length ? sha256OfBuffer(await readPackFile(dir, row.ref, MAX_BYTES)) : await sha256OfFile(join(dir, ...file.split('/')));
      const now = inside.length ? row : await stat(join(dir, ...file.split('/'))).catch(() => row);
      write.run(row.packId, row.ref, row.size, Math.round('mtimeMs' in now ? (now as { mtimeMs: number }).mtimeMs : row.mtime), sha);
      done++;
    } catch (e) {
      // Unreadable, gone, or an archive that will not open. Recorded as nothing so it is not tried
      // again on every pass; it will be picked up if the file itself changes.
      write.run(row.packId, row.ref, row.size, row.mtime, '');
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
