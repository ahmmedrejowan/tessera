import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * The library index: a SQLite database mirroring the packs on disk, for fast browsing, facet
 * counts and search. It holds nothing that isn't in the library folder, so it can always be
 * deleted and rebuilt; a schema change simply rebuilds it.
 */

export const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE packs (
  id          TEXT PRIMARY KEY,
  folder      TEXT NOT NULL,
  name        TEXT NOT NULL,
  status      TEXT NOT NULL,
  source      TEXT,
  creator     TEXT,
  licence     TEXT,
  added_at    TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  meta_json   TEXT NOT NULL,
  meta_sig    TEXT NOT NULL,
  files_sig   TEXT,
  file_count  INTEGER NOT NULL DEFAULT 0,
  asset_count INTEGER NOT NULL DEFAULT 0,
  size        INTEGER NOT NULL DEFAULT 0,
  cover_ref   TEXT,
  problems    TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE pack_terms (
  pack_id TEXT NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  facet   TEXT NOT NULL,
  value   TEXT NOT NULL,
  PRIMARY KEY (pack_id, facet, value)
);
CREATE INDEX pack_terms_value ON pack_terms(facet, value);

CREATE TABLE assets (
  id      INTEGER PRIMARY KEY,
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
  UNIQUE (pack_id, ref)
);
CREATE INDEX assets_pack ON assets(pack_id, role);
CREATE INDEX assets_type ON assets(type, role);
CREATE INDEX assets_ext ON assets(ext);

-- Words of each asset's path; rowid is assets.id.
CREATE VIRTUAL TABLE assets_fts USING fts5(words, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 2', prefix='2 3');
-- Words describing each pack: name, source, creator, genres, styles, tags, description.
CREATE VIRTUAL TABLE packs_fts USING fts5(pack_id UNINDEXED, words, tokenize='unicode61 remove_diacritics 2', prefix='2 3');
`;

const DROP = ['packs_fts', 'assets_fts', 'assets', 'pack_terms', 'packs'];

export function openIndexDb(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA temp_store = MEMORY;');
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  if (version !== SCHEMA_VERSION) {
    db.exec('BEGIN');
    for (const t of DROP) db.exec(`DROP TABLE IF EXISTS ${t}`);
    db.exec(SCHEMA);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec('COMMIT');
  }
  return db;
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
