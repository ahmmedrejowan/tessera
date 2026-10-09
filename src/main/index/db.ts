import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { log } from '../log';
import { DatabaseSync } from 'node:sqlite';

/**
 * The library index: a SQLite database mirroring the packs on disk, for fast browsing, facet
 * counts and search. It holds nothing that isn't in the library folder, so it can always be
 * deleted and rebuilt; a schema change simply rebuilds it.
 */

export const SCHEMA_VERSION = 16;

const SCHEMA = `
CREATE TABLE packs (
  id          TEXT PRIMARY KEY,
  folder      TEXT NOT NULL,
  name        TEXT NOT NULL,
  status      TEXT NOT NULL,
  source      TEXT,
  creator     TEXT,
  license     TEXT,
  added_at    TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  meta_json   TEXT NOT NULL,
  meta_sig    TEXT NOT NULL,
  files_sig   TEXT,
  file_count  INTEGER NOT NULL DEFAULT 0,
  asset_count INTEGER NOT NULL DEFAULT 0,
  size        INTEGER NOT NULL DEFAULT 0,
  cover_ref   TEXT,
  problems    TEXT NOT NULL DEFAULT '[]',
  archived    INTEGER NOT NULL DEFAULT 0,
  -- Set when the pack's files were never brought into the library: the folder they are read from.
  kept_where  TEXT,
  -- Set when that folder could not be read on the last look: an unplugged drive, usually.
  away        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE pack_terms (
  pack_id TEXT NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  facet   TEXT NOT NULL,
  value   TEXT NOT NULL,
  PRIMARY KEY (pack_id, facet, value)
);
CREATE INDEX pack_terms_value ON pack_terms(facet, value);

CREATE TABLE assets (
  -- AUTOINCREMENT, so an id is never handed to a different file later. Re-reading a pack deletes
  -- its rows and writes them again, and without this SQLite reuses the numbers that just became
  -- free. A selection made a moment earlier, or an id an agent wrote down, then pointed at some
  -- other file entirely, and "remove these" removed the wrong things. It is why the window throws
  -- away the selection every time anything is indexed at all. An id that no longer exists matches
  -- nothing, which is a safe way to be stale; an id that means something else is not.
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  pack_id TEXT NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  ref     TEXT NOT NULL,
  name    TEXT NOT NULL,
  dir     TEXT NOT NULL,
  ext     TEXT NOT NULL,
  kind    TEXT NOT NULL,
  type    TEXT NOT NULL,
  role    TEXT NOT NULL,
  size    INTEGER NOT NULL,
  mtime   INTEGER NOT NULL,
  -- The asset this file belongs to: its own id, or for a variant the id of the file that stands for the group.
  group_id INTEGER,
  -- On the file that stands for a group: every format in the group, space separated.
  formats TEXT NOT NULL DEFAULT '',
  -- The license covering this file: the pack's own, or the rule for the part of the pack it is in.
  license TEXT,
  UNIQUE (pack_id, ref)
);

-- What a file actually contains, so two copies of the same thing can be told apart from two files
-- that merely share a name and a size.
--
-- Its own table rather than a column on assets, because re-reading a pack throws those rows away
-- and rewrites them, and hashing is the one thing here that costs real time: a hash already worked
-- out is kept and reused as long as the file has not changed. Nothing here is required; an asset
-- with no row yet simply has not been read.
-- (file_hashes is created before this runs: see KEPT below.)
-- The question this table exists to answer: what else in the library is this same file?
CREATE INDEX IF NOT EXISTS file_hashes_sha ON file_hashes(sha256);
-- Finding the few files worth reading in full: the ones that share both size and CRC.
CREATE INDEX IF NOT EXISTS file_hashes_crc ON file_hashes(size, crc);
CREATE INDEX assets_group ON assets(group_id);
CREATE INDEX assets_pack ON assets(pack_id, role);
-- "Which packs hold a 3D model?" A pack keeps no type of its own, so the only way to answer is to
-- look inside it, once per pack. Without the type in the index that is a scan of every asset the
-- pack holds, and a library whose packs hold thousands of files each makes a click take seconds.
CREATE INDEX assets_pack_type ON assets(pack_id, role, type);
-- And the same question for a license carried by part of a pack rather than the pack itself.
CREATE INDEX assets_pack_license ON assets(pack_id, role, license);
CREATE INDEX assets_type ON assets(type, role);
CREATE INDEX assets_ext ON assets(ext);
CREATE INDEX assets_license ON assets(license);
-- Recognizing the assets a game already has looks every one of its files up by size first, once
-- per file. Without this that is a full scan of the table each time, which on a large library and
-- a large project is minutes of it.
CREATE INDEX assets_size ON assets(size);

-- Words of each asset's file name, and of the folders (and archives) it sits in; rowid is assets.id.
CREATE VIRTUAL TABLE assets_fts USING fts5(name, path, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 2', prefix='2 3');
-- Items of manual collections, mirrored from collections/*.json for queries.
CREATE TABLE collection_items (
  collection_id TEXT NOT NULL,
  pack_id       TEXT NOT NULL,
  ref           TEXT NOT NULL,
  position      INTEGER NOT NULL,
  PRIMARY KEY (collection_id, pack_id, ref)
);
CREATE INDEX collection_items_asset ON collection_items(pack_id, ref);

-- Whole packs in a collection, mirrored from collections/*.json for queries.
CREATE TABLE collection_packs (
  collection_id TEXT NOT NULL,
  pack_id       TEXT NOT NULL,
  position      INTEGER NOT NULL,
  PRIMARY KEY (collection_id, pack_id)
);
CREATE INDEX collection_packs_pack ON collection_packs(pack_id);

-- Files in the library's bin that couldn't be moved out of their pack's archive: hidden until restored.
CREATE TABLE hidden (
  pack_id TEXT NOT NULL,
  ref     TEXT NOT NULL,
  PRIMARY KEY (pack_id, ref)
);

-- Words describing each pack: name, source, creator, genres, styles, tags, description.
CREATE VIRTUAL TABLE packs_fts USING fts5(pack_id UNINDEXED, words, tokenize='unicode61 remove_diacritics 2', prefix='2 3');
`;


/** The one table carried across versions, so it is created before anything indexes it. */
const KEPT = `CREATE TABLE IF NOT EXISTS file_hashes (
  pack_id TEXT NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  ref     TEXT NOT NULL,
  -- What the file was when it was hashed. If either changes the hash is stale and is worked out again.
  size    INTEGER NOT NULL,
  mtime   INTEGER NOT NULL,
  -- CRC-32 of the contents. An archive hands this over with its table of contents, so for a file
  -- inside one it costs nothing: no decompressing, no reading. Size and CRC together are enough
  -- to say two files are *not* the same, which is the answer for almost every pair.
  crc     INTEGER NOT NULL DEFAULT 0,
  -- Worked out only for files whose size and CRC match something else, because CRC-32 does
  -- collide and only this settles it. Empty until then.
  sha256  TEXT NOT NULL,
  PRIMARY KEY (pack_id, ref)
);`;

const DROP = ['hidden', 'collection_packs', 'collection_items', 'packs_fts', 'assets_fts', 'assets', 'pack_terms', 'packs'];


/**
 * Columns added to a kept table since an older version wrote it. Adding one is cheap and keeps
 * every hash already worked out; recreating the table would throw away an hour of reading.
 */
function addMissingColumns(db: DatabaseSync): void {
  const have = new Set((db.prepare('PRAGMA table_info(file_hashes)').all() as { name: string }[]).map((c) => c.name));
  // 16: the CRC an archive already stored, so most files never need reading at all.
  if (!have.has('crc')) db.exec('ALTER TABLE file_hashes ADD COLUMN crc INTEGER NOT NULL DEFAULT 0');
}

function open(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA temp_store = MEMORY;');
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  if (version !== SCHEMA_VERSION) {
    db.exec('BEGIN');
    // Everything here is derived from the library on disk, so it is cheaper to rebuild than to
    // migrate. `file_hashes` is the exception: it is what the files contain, it costs an hour to
    // work out again, and it is not in DROP for that reason. It therefore has to be brought
    // forward rather than recreated, which is why its table and indexes are IF NOT EXISTS and why
    // new columns are added here.
    for (const t of DROP) db.exec(`DROP TABLE IF EXISTS ${t}`);
    // The kept table first, then its new columns, then everything else: an index on a column
    // added in this upgrade cannot be built before the column is there.
    db.exec(KEPT);
    addMissingColumns(db);
    db.exec(SCHEMA);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec('COMMIT');
  }
  return db;
}

/**
 * The index for a library. It is only ever a copy of what the folders say, so an index that will
 * not open (a crash mid-write, a full disk, a file half-copied by something else) is thrown away
 * and built again rather than standing between someone and their library.
 */
export function openIndexDb(path: string): DatabaseSync {
  if (path === ':memory:') return open(path);
  mkdirSync(dirname(path), { recursive: true });
  try {
    return open(path);
  } catch (e) {
    log.warn('index', `the index at ${path} could not be opened; building it again`, e);
    return open(clearOut(path));
  }
}

/**
 * Make room for a new index where a broken one sits. Deleting it is the tidy way; Windows will not
 * delete a file something still has open, so it is moved aside instead, and if even that is
 * refused, the new index simply goes somewhere else. Being able to open the library matters more
 * than the name of a file nobody looks at.
 */
function clearOut(path: string): string {
  for (const f of [`${path}-wal`, `${path}-shm`]) {
    try {
      rmSync(f, { force: true });
    } catch {
      // It goes with the rest, or it is left behind; either way it is not read again.
    }
  }
  try {
    rmSync(path, { force: true });
    return path;
  } catch {
    // Still held open. Move it out of the way.
  }
  const aside = `${path}.broken-${Date.now()}`;
  try {
    renameSync(path, aside);
    log.info('index', `the broken index was moved to ${aside}`);
    return path;
  } catch {
    // Not even that. Build the new one beside it.
  }
  const fresh = `${path}.${Date.now()}.sqlite`;
  log.info('index', `building the index at ${fresh} instead`);
  return fresh;
}

/** Run `fn` in a transaction, rolling back if it throws. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
