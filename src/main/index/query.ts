import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { AssetType } from '@shared/assets';
import { pathWords } from '@shared/assets';
import { FAVOURITES } from '@shared/collection';
import { licenceInfo } from '@shared/licences';
import type { PackMeta } from '@shared/pack';
import {
  FACETS,
  type AssetRow,
  type AssetSort,
  type BrowseQuery,
  type Facet,
  type FacetCounts,
  type LibraryStats,
  type LicenceHealth,
  type Page,
  type PackRow,
  type PackSort,
} from '@shared/query';

type Params = SQLInputValue[];

/** One condition of a WHERE clause with its parameters. */
interface Clause {
  sql: string;
  params: Params;
}

const inList = (column: string, values: string[]): Clause => ({ sql: `${column} IN (${values.map(() => '?').join(', ')})`, params: values });

/**
 * Turn what the user typed into FTS5 prefix terms: "carSedan red" → `"car"* "sedan"* "red"*`.
 * Every term must match, each as the start of a word.
 */
export function searchTerms(text: string): string[] {
  // Only letters and digits: the index holds nothing else, and quotes or operators would break the query.
  return pathWords(text)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter(Boolean)
    .slice(0, 12)
    .map((w) => `"${w.replace(/"/g, '""')}"*`);
}

const TERM_FACETS = new Set<Facet>(['genre', 'style', 'tag']);

/** Where a pack-level facet lives on the `packs` table. */
const PACK_COLUMN: Partial<Record<Facet, string>> = { source: 'p.source', creator: 'p.creator', licence: 'p.licence' };
/** Where an asset-level facet lives on the `assets` table. */
const ASSET_COLUMN: Partial<Record<Facet, string>> = { type: 'a.type', format: 'a.ext', licence: 'a.licence' };

const ASSET_SORT: Record<AssetSort, string> = {
  relevance: 'a.name COLLATE NOCASE, a.id',
  name: 'a.name COLLATE NOCASE, a.id',
  added: 'p.added_at DESC, a.name COLLATE NOCASE, a.id',
  size: 'a.size DESC, a.id',
  pack: 'p.name COLLATE NOCASE, a.dir COLLATE NOCASE, a.name COLLATE NOCASE, a.id',
  type: 'a.type, a.name COLLATE NOCASE, a.id',
};
const PACK_SORT: Record<PackSort, string> = {
  name: 'p.name COLLATE NOCASE, p.id',
  added: 'p.added_at DESC, p.id',
  size: 'p.size DESC, p.id',
  count: 'p.asset_count DESC, p.id',
};

const FACET_LIMIT = 300;

const ASSET_FIELDS = `a.id, a.pack_id AS packId, p.name AS packName, a.ref, a.name, a.dir, a.ext, a.kind, a.type, a.role, a.size, a.formats, a.licence,
  EXISTS (SELECT 1 FROM collection_items f WHERE f.collection_id = '${FAVOURITES}' AND f.pack_id = a.pack_id AND f.ref = a.ref) AS fav`;
type RawAsset = Omit<AssetRow, 'formats' | 'fav'> & { formats: string; fav: number };
const toAsset = (r: RawAsset): AssetRow => ({ ...r, formats: r.formats ? r.formats.split(' ') : [r.ext], fav: !!r.fav });

export class LibraryQueries {
  constructor(private readonly db: DatabaseSync) {}

  private all<T>(sql: string, params: Params = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  private get<T>(sql: string, params: Params = []): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  /** Conditions shared by asset and pack queries; `mode` says which table's rows are being counted. */
  private clauses(q: BrowseQuery, mode: 'assets' | 'packs', skip?: Facet): Clause[] {
    const out: Clause[] = [];
    if (q.scope !== 'all') out.push({ sql: 'p.status = ?', params: [q.scope] });
    // Put-away packs are out of the way of browsing, but still in their collections and on their
    // own pages, so nothing filed by hand goes missing.
    if (q.archived === 'only') out.push({ sql: 'p.archived = 1', params: [] });
    else if (q.scope === 'library') out.push({ sql: 'p.archived = 0', params: [] });
    if (q.packIds) out.push(inList('p.id', q.packIds.length ? q.packIds : ['']));
    if (q.favourites) {
      // A starred asset is one in the Favourites collection; a starred pack says so in its own record.
      out.push(
        mode === 'assets'
          ? { sql: `EXISTS (SELECT 1 FROM collection_items f WHERE f.collection_id = ? AND f.pack_id = a.pack_id AND f.ref = a.ref)`, params: [FAVOURITES] }
          : { sql: 'p.fav = 1', params: [] },
      );
    }
    if (q.collectionId) {
      // A collection shows exactly what was put in it, supporting files included.
      const inCollection = 'SELECT 1 FROM collection_items ci WHERE ci.collection_id = ? AND ci.pack_id = a.pack_id AND ci.ref = a.ref';
      out.push(mode === 'assets' ? { sql: `EXISTS (${inCollection})`, params: [q.collectionId] } : { sql: `p.id IN (SELECT pack_id FROM collection_items WHERE collection_id = ?)`, params: [q.collectionId] });
    } else if (mode === 'assets') {
      // Variants are always shown through the asset they belong to.
      out.push({ sql: q.includeSupport ? "a.role != 'variant'" : "a.role = 'main'", params: [] });
    }
    // Files waiting in the bin that couldn't be moved out of their archive are not in the library.
    if (mode === 'assets') out.push({ sql: 'NOT EXISTS (SELECT 1 FROM hidden h WHERE h.pack_id = a.pack_id AND h.ref = a.ref)', params: [] });

    for (const facet of FACETS) {
      const values = q.filters[facet];
      if (!values?.length || facet === skip) continue;
      const assetCol = ASSET_COLUMN[facet];
      const packCol = PACK_COLUMN[facet];
      if (facet === 'format') {
        // An asset matches when any of its variants is in the format.
        const c = inList('v.ext', values);
        out.push(
          mode === 'assets'
            ? { sql: `EXISTS (SELECT 1 FROM assets v WHERE v.group_id = a.id AND ${c.sql})`, params: c.params }
            : { sql: `EXISTS (SELECT 1 FROM assets v WHERE v.pack_id = p.id AND v.role IN ('main', 'variant') AND ${c.sql})`, params: c.params },
        );
      } else if (assetCol) {
        const c = inList(assetCol, values);
        // Packs match when they hold at least one such asset.
        out.push(mode === 'assets' ? c : { sql: `EXISTS (SELECT 1 FROM assets a WHERE a.pack_id = p.id AND a.role = 'main' AND ${c.sql})`, params: c.params });
      } else if (packCol) {
        out.push(inList(packCol, values));
      } else if (TERM_FACETS.has(facet)) {
        const c = inList('t.value', values.map((v) => v.toLowerCase()));
        out.push({ sql: `EXISTS (SELECT 1 FROM pack_terms t WHERE t.pack_id = p.id AND t.facet = ? AND ${c.sql})`, params: [facet, ...c.params] });
      }
    }

    for (const term of searchTerms(q.text)) {
      const inPack = 'p.id IN (SELECT pack_id FROM packs_fts WHERE packs_fts MATCH ?)';
      if (mode === 'assets') {
        out.push({ sql: `(a.id IN (SELECT rowid FROM assets_fts WHERE assets_fts MATCH ?) OR ${inPack})`, params: [term, term] });
      } else {
        const inAssets = `p.id IN (SELECT a2.pack_id FROM assets a2 JOIN assets_fts f ON f.rowid = a2.id WHERE assets_fts MATCH ? AND a2.role = 'main')`;
        out.push({ sql: `(${inPack} OR ${inAssets})`, params: [term, term] });
      }
    }
    return out;
  }

  private where(clauses: Clause[]): { sql: string; params: Params } {
    return clauses.length ? { sql: `WHERE ${clauses.map((c) => c.sql).join(' AND ')}`, params: clauses.flatMap((c) => c.params) } : { sql: '', params: [] };
  }

  assets(q: BrowseQuery, sort: AssetSort, offset: number, limit: number): Page<AssetRow> {
    const w = this.where(this.clauses(q, 'assets'));
    const from = `FROM assets a JOIN packs p ON p.id = a.pack_id ${w.sql}`;
    const total = this.get<{ n: number }>(`SELECT count(*) AS n ${from}`, w.params)!.n;
    // Relevance: a search word that is a whole word of the file name scores 3, the start of one 2,
    // a whole word of its folders 1. Matches through the pack's own words score nothing extra.
    const terms = sort === 'relevance' ? searchTerms(q.text) : [];
    const exact: string[] = [];
    for (const t of terms) exact.push(`name : ${t.slice(0, -1)}`, `name : ${t}`, `path : ${t.slice(0, -1)}`);
    const hit = 'a.id IN (SELECT rowid FROM assets_fts WHERE assets_fts MATCH ?)';
    const score = terms.length
      ? `(${terms.map(() => `(CASE WHEN ${hit} THEN 3 WHEN ${hit} THEN 2 WHEN ${hit} THEN 1 ELSE 0 END)`).join(' + ')}) DESC, `
      : '';
    // In a collection, "best match" without search words is the order things were added.
    const order = q.collectionId && !terms.length && sort === 'relevance'
      ? '(SELECT position FROM collection_items ci WHERE ci.collection_id = ? AND ci.pack_id = a.pack_id AND ci.ref = a.ref), a.id'
      : `${score}${ASSET_SORT[sort]}`;
    const orderParams = q.collectionId && !terms.length && sort === 'relevance' ? [q.collectionId] : exact;
    const rows = this.all<RawAsset>(`SELECT ${ASSET_FIELDS} ${from} ORDER BY ${order} LIMIT ? OFFSET ?`, [...w.params, ...orderParams, limit, offset]);
    return { rows: rows.map(toAsset), total };
  }

  packs(q: BrowseQuery, sort: PackSort, offset: number, limit: number): Page<PackRow> {
    const w = this.where(this.clauses(q, 'packs'));
    const total = this.get<{ n: number }>(`SELECT count(*) AS n FROM packs p ${w.sql}`, w.params)!.n;
    const raw = this.all<RawPack>(`SELECT ${PACK_FIELDS} FROM packs p ${w.sql} ORDER BY ${PACK_SORT[sort]} LIMIT ? OFFSET ?`, [...w.params, limit, offset]);
    return { rows: this.toPackRows(raw), total };
  }

  /** Every id a query matches, in no particular order: for picking the lot out at once. */
  allIds(q: BrowseQuery, mode: 'assets' | 'packs'): (number | string)[] {
    const w = this.where(this.clauses(q, mode));
    if (mode === 'packs') return this.all<{ id: string }>(`SELECT p.id AS id FROM packs p ${w.sql}`, w.params).map((r) => r.id);
    return this.all<{ id: number }>(`SELECT a.id AS id FROM assets a JOIN packs p ON p.id = a.pack_id ${w.sql}`, w.params).map((r) => r.id);
  }

  /** What a pile of picked assets, or picked packs, comes to in bytes. */
  sum(mode: 'assets' | 'packs', ids: (number | string)[]): number {
    let total = 0;
    // SQLite takes only so many values in one statement, so ask in batches.
    for (let i = 0; i < ids.length; i += 500) {
      const batch = ids.slice(i, i + 500);
      const marks = batch.map(() => '?').join(',');
      const sql =
        mode === 'packs'
          ? `SELECT coalesce(sum(size), 0) AS n FROM packs WHERE id IN (${marks})`
          : `SELECT coalesce(sum(size), 0) AS n FROM assets WHERE id IN (${marks})`;
      total += this.get<{ n: number }>(sql, batch as Params)!.n;
    }
    return total;
  }

  pack(id: string): (PackRow & { meta: PackMeta }) | null {
    const raw = this.get<RawPack & { meta_json: string }>(`SELECT ${PACK_FIELDS}, p.meta_json FROM packs p WHERE p.id = ?`, [id]);
    if (!raw) return null;
    return { ...this.toPackRows([raw])[0]!, meta: JSON.parse(raw.meta_json) as PackMeta };
  }

  /** Every file of one pack, for its contents view. Files waiting in the bin are left out. */
  packFiles(id: string): AssetRow[] {
    return this.all<RawAsset>(
      `SELECT ${ASSET_FIELDS} FROM assets a JOIN packs p ON p.id = a.pack_id
       WHERE a.pack_id = ? AND NOT EXISTS (SELECT 1 FROM hidden h WHERE h.pack_id = a.pack_id AND h.ref = a.ref)
       ORDER BY a.dir COLLATE NOCASE, a.name COLLATE NOCASE`,
      [id],
    ).map(toAsset);
  }

  /** One file of a pack by its ref, for what it weighs before it goes to the bin. */
  assetByRef(packId: string, ref: string): AssetRow | null {
    const r = this.get<RawAsset>(`SELECT ${ASSET_FIELDS} FROM assets a JOIN packs p ON p.id = a.pack_id WHERE a.pack_id = ? AND a.ref = ?`, [packId, ref]);
    return r ? toAsset(r) : null;
  }

  asset(id: number): AssetRow | null {
    const r = this.get<RawAsset>(`SELECT ${ASSET_FIELDS} FROM assets a JOIN packs p ON p.id = a.pack_id WHERE a.id = ?`, [id]);
    return r ? toAsset(r) : null;
  }

  /**
   * A pack that already holds this download: a top-level file of the same name and size, or a
   * top-level folder of the same name holding the same number of bytes.
   */
  findDownload(name: string, size: number, folder: boolean): string | null {
    const ref = `original/${name}`;
    const row = folder
      ? this.get<{ name: string }>(
          `SELECT p.name FROM assets a JOIN packs p ON p.id = a.pack_id WHERE a.ref LIKE ? ESCAPE '\\' AND a.ref NOT LIKE '%!%'
           GROUP BY a.pack_id HAVING sum(a.size) = ? LIMIT 1`,
          [`${ref.replace(/[\\%_]/g, (c) => `\\${c}`)}/%`, size],
        )
      : this.get<{ name: string }>(`SELECT p.name FROM assets a JOIN packs p ON p.id = a.pack_id WHERE a.ref = ? AND a.size = ? LIMIT 1`, [ref, size]);
    return row?.name ?? null;
  }

  /** Words already used in the library for a pack field, most used first, for suggestions. */
  terms(field: 'genre' | 'style' | 'tag' | 'creator'): { value: string; count: number }[] {
    if (field === 'creator') {
      return this.all('SELECT creator AS value, count(*) AS count FROM packs WHERE creator IS NOT NULL GROUP BY creator ORDER BY 2 DESC, 1 LIMIT 500');
    }
    return this.all('SELECT value, count(*) AS count FROM pack_terms WHERE facet = ? GROUP BY value ORDER BY 2 DESC, 1 LIMIT 500', [field]);
  }

  /** What the thumbnailer needs to know about assets. */
  thumbInfo(files: { packId: string; ref: string }[]): { packId: string; ref: string; ext: string; kind: string; type: string; size: number; mtime: number }[] {
    const st = this.db.prepare('SELECT pack_id AS packId, ref, ext, kind, type, size, mtime FROM assets WHERE pack_id = ? AND ref = ?');
    const out: ReturnType<LibraryQueries['thumbInfo']> = [];
    for (const f of files) {
      const row = st.get(f.packId, f.ref) as ReturnType<LibraryQueries['thumbInfo']>[number] | undefined;
      if (row) out.push(row);
    }
    return out;
  }

  /** Every image in a pack, for finding a model's textures by file name. */
  packImages(packId: string): { ref: string; name: string }[] {
    return this.all(`SELECT ref, name FROM assets WHERE pack_id = ? AND kind = 'image'`, [packId]);
  }

  /** Every file of the asset at this pack and path (see `variants`). */
  variantsOf(packId: string, ref: string): AssetRow[] {
    const row = this.get<{ id: number }>('SELECT id FROM assets WHERE pack_id = ? AND ref = ?', [packId, ref]);
    return row ? this.variants(row.id) : [];
  }

  packRefs(packId: string): string[] {
    return this.all<{ ref: string }>('SELECT ref FROM assets WHERE pack_id = ?', [packId]).map((r) => r.ref);
  }

  refs(ids: number[]): { packId: string; ref: string }[] {
    const out: { packId: string; ref: string }[] = [];
    // SQLite takes only so many values in one statement, and a whole library can be picked out.
    for (let i = 0; i < ids.length; i += 500) {
      const batch = ids.slice(i, i + 500);
      out.push(...this.all<{ packId: string; ref: string }>(`SELECT pack_id AS packId, ref FROM assets WHERE id IN (${batch.map(() => '?').join(', ')})`, batch));
    }
    return out;
  }

  /** Every file of an asset: the one that stands for it first, then its other formats and sizes. */
  variants(id: number): AssetRow[] {
    return this.all<RawAsset>(
      `SELECT ${ASSET_FIELDS} FROM assets a JOIN packs p ON p.id = a.pack_id
       WHERE a.group_id = (SELECT group_id FROM assets WHERE id = ?) ORDER BY a.id = ? DESC, a.ext, a.dir`,
      [id, id],
    ).map(toAsset);
  }

  /**
   * How many results each facet value would give. Each facet is counted with every other filter
   * applied but not its own, so picking a second value in a facet shows what it would add.
   */
  facets(q: BrowseQuery, mode: 'assets' | 'packs'): FacetCounts {
    const out = {} as FacetCounts;
    for (const facet of FACETS) {
      const w = this.where(this.clauses(q, mode, facet));
      const count = mode === 'assets' ? 'count(*)' : 'count(DISTINCT p.id)';
      let sql: string;
      const params = [...w.params];
      const assetCol = ASSET_COLUMN[facet];
      const packCol = PACK_COLUMN[facet];
      if (facet === 'format') {
        sql = mode === 'assets'
          ? `SELECT v.ext AS value, count(DISTINCT a.id) AS count FROM assets a JOIN packs p ON p.id = a.pack_id JOIN assets v ON v.group_id = a.id ${w.sql} GROUP BY 1`
          : `SELECT v.ext AS value, count(DISTINCT p.id) AS count FROM packs p JOIN assets v ON v.pack_id = p.id AND v.role IN ('main', 'variant') ${w.sql} GROUP BY 1`;
      } else if (assetCol) {
        sql = mode === 'assets'
          ? `SELECT ${assetCol} AS value, ${count} AS count FROM assets a JOIN packs p ON p.id = a.pack_id ${w.sql} GROUP BY 1`
          : `SELECT ${assetCol} AS value, ${count} AS count FROM packs p JOIN assets a ON a.pack_id = p.id AND a.role = 'main' ${w.sql} GROUP BY 1`;
      } else if (packCol) {
        const base = mode === 'assets' ? `FROM assets a JOIN packs p ON p.id = a.pack_id` : 'FROM packs p';
        sql = `SELECT ${packCol} AS value, ${count} AS count ${base} ${w.sql ? `${w.sql} AND` : 'WHERE'} ${packCol} IS NOT NULL GROUP BY 1`;
      } else {
        const base = mode === 'assets' ? `FROM assets a JOIN packs p ON p.id = a.pack_id` : 'FROM packs p';
        sql = `SELECT t.value AS value, ${count} AS count ${base} JOIN pack_terms t ON t.pack_id = p.id AND t.facet = ? ${w.sql} GROUP BY 1`;
        params.unshift(facet);
      }
      out[facet] = this.all<{ value: string; count: number }>(`${sql} ORDER BY 2 DESC, 1 LIMIT ${FACET_LIMIT}`, params);
    }
    return out;
  }

  /** Library packs whose licence needs attention (see LicenceHealth). */
  health(): LicenceHealth {
    const rows = this.all<{ id: string; name: string; licence: string; attribution: string | null }>(
      `SELECT id, name, licence, json_extract(meta_json, '$.licence.attribution') AS attribution FROM packs WHERE status = 'library' AND licence IS NOT NULL ORDER BY name COLLATE NOCASE`,
    );
    const out: LicenceHealth = { noCreditLine: [], restricted: [] };
    for (const r of rows) {
      const info = licenceInfo(r.licence);
      if (!info || !info.commercial) out.restricted.push({ id: r.id, name: r.name, licence: r.licence });
      else if (info.attribution && !r.attribution) out.noCreditLine.push({ id: r.id, name: r.name, licence: r.licence });
    }
    return out;
  }

  stats(): LibraryStats {
    const packs = this.get<{ packs: number; inbox: number; size: number }>(
      `SELECT count(*) FILTER (WHERE status = 'library') AS packs, count(*) FILTER (WHERE status = 'inbox') AS inbox, coalesce(sum(size), 0) AS size FROM packs`,
    )!;
    const byType: Partial<Record<AssetType, number>> = {};
    let assets = 0;
    for (const r of this.all<{ type: AssetType; n: number }>(
      `SELECT a.type, count(*) AS n FROM assets a JOIN packs p ON p.id = a.pack_id WHERE a.role = 'main' AND p.status = 'library' GROUP BY a.type`,
    )) {
      byType[r.type] = r.n;
      assets += r.n;
    }
    return { ...packs, assets, byType };
  }

  private toPackRows(raw: RawPack[]): PackRow[] {
    if (!raw.length) return [];
    const ids = raw.map((r) => r.id);
    const marks = ids.map(() => '?').join(', ');
    const types = new Map<string, Partial<Record<AssetType, number>>>();
    for (const t of this.all<{ packId: string; type: AssetType; n: number }>(
      `SELECT pack_id AS packId, type, count(*) AS n FROM assets WHERE role = 'main' AND pack_id IN (${marks}) GROUP BY pack_id, type`,
      ids,
    )) {
      const m = types.get(t.packId) ?? {};
      m[t.type] = t.n;
      types.set(t.packId, m);
    }
    const samples = new Map<string, PackRow['samples']>();
    for (const a of this.all<{ packId: string } & PackRow['samples'][number]>(
      // Spread across the pack (every quarter of it) rather than its first folder, and skip
      // animation rigs and sample scenes, which say little about what the pack holds.
      `SELECT id, packId, ref, ext, kind, type FROM (
         SELECT id, pack_id AS packId, ref, ext, kind, type,
           ROW_NUMBER() OVER w AS n, COUNT(*) OVER (PARTITION BY pack_id) AS c
         FROM assets
         WHERE role = 'main' AND pack_id IN (${marks})
         WINDOW w AS (PARTITION BY pack_id ORDER BY
           (lower(dir) GLOB '*anim*' OR lower(dir) GLOB '*rig*' OR lower(dir) GLOB '*sample*' OR lower(name) GLOB 'rig*'),
           (kind = 'image' AND ext IN ('png', 'jpg', 'jpeg', 'webp', 'gif')) DESC, (kind = 'model') DESC, dir, name))
       WHERE (n - 1) % MAX(1, c / 4) = 0 AND n <= MAX(1, c / 4) * 4`,
      ids,
    )) {
      const list = samples.get(a.packId) ?? [];
      list.push({ id: a.id, ref: a.ref, ext: a.ext, kind: a.kind, type: a.type });
      samples.set(a.packId, list);
    }
    const terms = new Map<string, { genre: string[]; style: string[]; tag: string[] }>();
    for (const t of this.all<{ packId: string; facet: 'genre' | 'style' | 'tag'; value: string }>(
      `SELECT pack_id AS packId, facet, value FROM pack_terms WHERE pack_id IN (${marks}) ORDER BY value`,
      ids,
    )) {
      const m = terms.get(t.packId) ?? { genre: [], style: [], tag: [] };
      m[t.facet].push(t.value);
      terms.set(t.packId, m);
    }
    return raw.map((r) => ({
      id: r.id,
      name: r.name,
      folder: r.folder,
      status: r.status,
      source: r.source,
      creator: r.creator,
      licence: r.licence,
      addedAt: r.addedAt,
      fileCount: r.fileCount,
      assetCount: r.assetCount,
      size: r.size,
      coverRef: r.coverRef,
      fav: !!r.fav,
      archived: !!r.archived,
      samples: samples.get(r.id) ?? [],
      types: types.get(r.id) ?? {},
      genres: terms.get(r.id)?.genre ?? [],
      styles: terms.get(r.id)?.style ?? [],
      tags: terms.get(r.id)?.tag ?? [],
      problems: JSON.parse(r.problems) as string[],
    }));
  }
}

interface RawPack {
  id: string;
  name: string;
  folder: string;
  status: PackRow['status'];
  source: string | null;
  creator: string | null;
  licence: string | null;
  addedAt: string;
  fileCount: number;
  assetCount: number;
  size: number;
  coverRef: string | null;
  problems: string;
  fav: number;
  archived: number;
}

const PACK_FIELDS = `p.id, p.name, p.folder, p.status, p.source, p.creator, p.licence, p.added_at AS addedAt,
  p.file_count AS fileCount, p.asset_count AS assetCount, p.size, p.cover_ref AS coverRef, p.problems, p.fav, p.archived`;
