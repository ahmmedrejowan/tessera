import { createHash } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { baseName, classify, extOf, kindOf, pathWords } from '@shared/assets';
import { licenceInfo } from '@shared/licences';
import type { PackMeta } from '@shared/pack';
import { sourceInfo } from '@shared/sources';
import { PACK_DIRS } from '../library/layout';
import { listPacks, type PackProblem, type PackRecord } from '../library/packs';
import { openIndexDb, transaction } from './db';
import { displayPath, listPackFiles, type PackFile } from './files';

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');

/** A quick fingerprint of a pack's files from sizes and times alone, so unchanged packs are skipped without opening archives. */
async function filesSignature(packDir: string): Promise<string> {
  const root = join(packDir, PACK_DIRS.original);
  const parts: string[] = [];
  const walk = async (dir: string) => {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) {
        const s = await stat(p).catch(() => null);
        if (s) parts.push(`${relative(root, p).split(sep).join('/')}|${s.size}|${Math.round(s.mtimeMs)}`);
      }
    }
  };
  await walk(root);
  return sha1(parts.sort().join('\n'));
}

/** Words a pack is found by. */
export function packWords(meta: PackMeta): string {
  const source = sourceInfo(meta.source.site);
  return [
    meta.name,
    source?.name,
    meta.source.name,
    meta.source.creator,
    licenceInfo(meta.licence.id)?.short,
    ...meta.genres,
    ...meta.styles,
    ...meta.tags,
    meta.description.slice(0, 1000),
  ]
    .filter(Boolean)
    .map((w) => pathWords(w!))
    .join(' ');
}

/** The pack's own preview image to use as its cover, if it ships one. */
function pickCover(files: { ref: string; role: string; kind: string; size: number }[]): string | null {
  const previews = files.filter((f) => f.role === 'preview' && f.kind === 'image' && !/\.(svg|psd|exr|hdr|tga|tiff?)$/i.test(f.ref));
  if (!previews.length) return null;
  const score = (ref: string) => (/preview|cover/i.test(baseName(ref)) ? 0 : 1) * 100 + ref.split(/[/!]/).length;
  previews.sort((a, b) => score(a.ref) - score(b.ref) || b.size - a.size);
  return previews[0]!.ref;
}

export interface SyncResult {
  packs: number;
  changed: number;
  removed: number;
  problems: PackProblem[];
}

export type SyncProgress = (done: number, total: number, current: string) => void;

export class LibraryIndex {
  readonly db: DatabaseSync;
  private readonly st: Record<string, StatementSync>;

  constructor(path: string) {
    this.db = openIndexDb(path);
    const p = (sql: string) => this.db.prepare(sql);
    this.st = {
      known: p('SELECT id, folder, meta_sig AS metaSig, files_sig AS filesSig FROM packs'),
      upsertPack: p(`INSERT INTO packs (id, folder, name, status, source, creator, licence, added_at, updated_at, meta_json, meta_sig)
        VALUES ($id, $folder, $name, $status, $source, $creator, $licence, $addedAt, $updatedAt, $metaJson, $metaSig)
        ON CONFLICT(id) DO UPDATE SET folder = excluded.folder, name = excluded.name, status = excluded.status, source = excluded.source,
          creator = excluded.creator, licence = excluded.licence, added_at = excluded.added_at, updated_at = excluded.updated_at,
          meta_json = excluded.meta_json, meta_sig = excluded.meta_sig`),
      deleteTerms: p('DELETE FROM pack_terms WHERE pack_id = ?'),
      insertTerm: p('INSERT OR IGNORE INTO pack_terms (pack_id, facet, value) VALUES (?, ?, ?)'),
      deletePackFts: p('DELETE FROM packs_fts WHERE pack_id = ?'),
      insertPackFts: p('INSERT INTO packs_fts (pack_id, words) VALUES (?, ?)'),
      assetIds: p('SELECT id FROM assets WHERE pack_id = ?'),
      deleteAssetFts: p('DELETE FROM assets_fts WHERE rowid = ?'),
      deleteAssets: p('DELETE FROM assets WHERE pack_id = ?'),
      insertAsset: p(`INSERT INTO assets (pack_id, ref, name, dir, ext, kind, type, role, size, mtime)
        VALUES ($packId, $ref, $name, $dir, $ext, $kind, $type, $role, $size, $mtime)`),
      insertAssetFts: p('INSERT INTO assets_fts (rowid, words) VALUES (?, ?)'),
      packFiles: p(`UPDATE packs SET files_sig = $sig, file_count = $fileCount, asset_count = $assetCount, size = $size,
        cover_ref = $cover, problems = $problems WHERE id = $id`),
      deletePack: p('DELETE FROM packs WHERE id = ?'),
    };
  }

  close(): void {
    this.db.close();
  }

  /** Bring the index in line with the library folder. Only packs whose record or files changed are re-read. */
  async sync(root: string, onProgress?: SyncProgress): Promise<SyncResult> {
    const { packs, problems } = await listPacks(root);
    const known = new Map((this.st.known!.all() as { id: string; folder: string; metaSig: string; filesSig: string | null }[]).map((r) => [r.id, r]));
    const seen = new Set<string>();
    let changed = 0;
    let done = 0;
    for (const pack of packs) {
      onProgress?.(done++, packs.length, pack.meta.name);
      if (seen.has(pack.meta.id)) {
        problems.push({ folder: pack.folder, message: 'has the same id as another pack (was the folder copied?). It is left out until the copy is removed.' });
        continue;
      }
      seen.add(pack.meta.id);
      if (await this.syncPack(pack, known.get(pack.meta.id))) changed++;
    }
    const removed = [...known.keys()].filter((id) => !seen.has(id));
    if (removed.length) transaction(this.db, () => removed.forEach((id) => this.removePack(id)));
    onProgress?.(packs.length, packs.length, '');
    return { packs: packs.length, changed, removed: removed.length, problems };
  }

  /** Update one pack. Returns true when anything changed. */
  async syncPack(pack: PackRecord, known?: { folder: string; metaSig: string; filesSig: string | null }): Promise<boolean> {
    const metaSig = sha1(`${pack.folder}\n${JSON.stringify(pack.meta)}`);
    const filesSig = await filesSignature(pack.dir);
    const metaChanged = known?.metaSig !== metaSig;
    const filesChanged = known?.filesSig !== filesSig;
    if (!metaChanged && !filesChanged) return false;
    const listing = filesChanged ? await listPackFiles(pack.dir) : null;
    transaction(this.db, () => {
      if (metaChanged || !known) this.writePackMeta(pack, metaSig);
      if (listing) this.writePackFiles(pack.meta.id, filesSig, listing.files, listing.problems);
    });
    return true;
  }

  private writePackMeta(pack: PackRecord, metaSig: string): void {
    const m = pack.meta;
    this.st.upsertPack!.run({
      $id: m.id,
      $folder: pack.folder,
      $name: m.name,
      $status: m.status,
      $source: m.source.site ?? m.source.name ?? null,
      $creator: m.source.creator ?? null,
      $licence: m.licence.id ?? null,
      $addedAt: m.addedAt,
      $updatedAt: m.updatedAt,
      $metaJson: JSON.stringify(m),
      $metaSig: metaSig,
    });
    this.st.deleteTerms!.run(m.id);
    for (const [facet, values] of [['genre', m.genres], ['style', m.styles], ['tag', m.tags]] as const) {
      for (const v of values) this.st.insertTerm!.run(m.id, facet, v.toLowerCase());
    }
    this.st.deletePackFts!.run(m.id);
    this.st.insertPackFts!.run(m.id, packWords(m));
  }

  private writePackFiles(packId: string, sig: string, files: PackFile[], problems: string[]): void {
    for (const { id } of this.st.assetIds!.all(packId) as { id: number }[]) this.st.deleteAssetFts!.run(id);
    this.st.deleteAssets!.run(packId);
    const hasModels = files.some((f) => kindOf(f.ref) === 'model');
    const classified = files.map((f) => ({ ...f, ...classify(displayPath(f.ref), f.size, { hasModels }) }));
    let size = 0;
    let assetCount = 0;
    for (const f of classified) {
      const shown = displayPath(f.ref);
      const slash = shown.lastIndexOf('/');
      const { lastInsertRowid } = this.st.insertAsset!.run({
        $packId: packId,
        $ref: f.ref,
        $name: baseName(shown),
        $dir: slash >= 0 ? shown.slice(0, slash) : '',
        $ext: extOf(f.ref),
        $kind: f.kind,
        $type: f.type,
        $role: f.role,
        $size: f.size,
        $mtime: Math.round(f.mtimeMs),
      });
      this.st.insertAssetFts!.run(Number(lastInsertRowid), `${pathWords(shown)} ${extOf(f.ref)}`);
      // An archive's size is already counted by the files it holds; a top-level archive on disk is what takes space.
      if (!f.ref.includes('!')) size += f.size;
      if (f.role === 'main') assetCount++;
    }
    this.st.packFiles!.run({
      $id: packId,
      $sig: sig,
      $fileCount: files.length,
      $assetCount: assetCount,
      $size: size,
      $cover: pickCover(classified),
      $problems: JSON.stringify(problems),
    });
  }

  removePack(id: string): void {
    for (const { id: assetId } of this.st.assetIds!.all(id) as { id: number }[]) this.st.deleteAssetFts!.run(assetId);
    this.st.deletePackFts!.run(id);
    this.st.deletePack!.run(id);
  }
}

