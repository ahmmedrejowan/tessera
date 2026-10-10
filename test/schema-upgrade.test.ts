import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openIndexDb, SCHEMA_VERSION } from '../src/main/index/db';
import { tempDir } from './helpers';

/**
 * A library written by an older version has to open, and has to keep what it already worked out.
 * Everything in the index is rebuilt from the folder except `file_hashes`, which is what the
 * files contain: an hour's reading on a large library, and the one thing an upgrade must carry
 * forward rather than throw away.
 */
describe('opening a library an older version wrote', () => {
  it('keeps the hashes it already has and adds what is new', () => {
    const path = join(tempDir(), 'index.sqlite');
    const old = new DatabaseSync(path);
    // 1.0.0's shape: file_hashes with no crc column, and the usual derived tables.
    // With the real foreign key, and a pack for it to point at. Without those this test passed
    // while the upgrade was deleting every row: dropping `packs` fires ON DELETE CASCADE, so the
    // table being carefully kept out of the drop list was emptied on the way past anyway.
    old.exec(`PRAGMA foreign_keys = ON;
      CREATE TABLE packs (id TEXT PRIMARY KEY, folder TEXT);
      CREATE TABLE file_hashes (pack_id TEXT NOT NULL REFERENCES packs(id) ON DELETE CASCADE, ref TEXT NOT NULL, size INTEGER NOT NULL, mtime INTEGER NOT NULL, sha256 TEXT NOT NULL, PRIMARY KEY (pack_id, ref));
      INSERT INTO packs (id, folder) VALUES ('pack-1', 'Pack One');
      INSERT INTO file_hashes VALUES ('pack-1', 'original/a.png', 10, 1, 'deadbeef');
      PRAGMA user_version = 14;`);
    old.close();

    const db = openIndexDb(path);
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(SCHEMA_VERSION);
    const cols = (db.prepare('PRAGMA table_info(file_hashes)').all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain('crc');
    // The expensive part survived, and the new column reads as "not worked out yet".
    const row = db.prepare("SELECT sha256, crc FROM file_hashes WHERE ref = 'original/a.png'").get() as { sha256: string; crc: number };
    expect(row).toEqual({ sha256: 'deadbeef', crc: 0 });
    db.close();
  });

  it('opens a library of its own version without touching it', () => {
    const path = join(tempDir(), 'index.sqlite');
    const first = openIndexDb(path);
    // file_hashes points at a pack, so one has to exist for the row to be allowed.
    first.prepare(
      `INSERT INTO packs (id, folder, name, status, added_at, updated_at, meta_json, meta_sig, file_count, asset_count, size, problems, archived, away)
       VALUES ('p','p','P','library','','','{}','',0,0,0,'',0,0)`,
    ).run();
    first.prepare('INSERT INTO file_hashes (pack_id, ref, size, mtime, crc, sha256) VALUES (?,?,?,?,?,?)').run('p', 'r', 1, 1, 7, 'x');
    first.close();
    const again = openIndexDb(path);
    expect((again.prepare('SELECT count(*) AS n FROM file_hashes').get() as { n: number }).n).toBe(1);
    again.close();
  });
});
