import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { AssetType } from '@shared/assets';
import { pathWords } from '@shared/assets';
import type { PackMeta } from '@shared/pack';
import {
  FACETS,
  type AssetRow,
  type AssetSort,
  type BrowseQuery,
  type Facet,
  type FacetCounts,
  type LibraryStats,
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
const ASSET_COLUMN: Partial<Record<Facet, string>> = { type: 'a.type', format: 'a.ext' };

const ASSET_SORT: Record<AssetSort, string> = {
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
    if (q.packIds) out.push(inList('p.id', q.packIds.length ? q.packIds : ['']));
    const role = q.includeSupport ? null : "a.role = 'main'";
    if (mode === 'assets' && role) out.push({ sql: role, params: [] });

    for (const facet of FACETS) {
      const values = q.filters[facet];
      if (!values?.length || facet === skip) continue;
      const assetCol = ASSET_COLUMN[facet];
      const packCol = PACK_COLUMN[facet];
      if (assetCol) {
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
    const rows = this.all<AssetRow>(
      `SELECT a.id, a.pack_id AS packId, p.name AS packName, a.ref, a.name, a.dir, a.ext, a.kind, a.type, a.role, a.size
       ${from} ORDER BY ${ASSET_SORT[sort]} LIMIT ? OFFSET ?`,
      [...w.params, limit, offset],
    );
    return { rows, total };
  }

  packs(q: BrowseQuery, sort: PackSort, offset: number, limit: number): Page<PackRow> {
    const w = this.where(this.clauses(q, 'packs'));
    const total = this.get<{ n: number }>(`SELECT count(*) AS n FROM packs p ${w.sql}`, w.params)!.n;
    const raw = this.all<RawPack>(`SELECT ${PACK_FIELDS} FROM packs p ${w.sql} ORDER BY ${PACK_SORT[sort]} LIMIT ? OFFSET ?`, [...w.params, limit, offset]);
    return { rows: this.toPackRows(raw), total };
  }

  pack(id: string): (PackRow & { meta: PackMeta }) | null {
    const raw = this.get<RawPack & { meta_json: string }>(`SELECT ${PACK_FIELDS}, p.meta_json FROM packs p WHERE p.id = ?`, [id]);
    if (!raw) return null;
    return { ...this.toPackRows([raw])[0]!, meta: JSON.parse(raw.meta_json) as PackMeta };
  }

  /** Every file of one pack, for its contents view. */
  packFiles(id: string): AssetRow[] {
    return this.all<AssetRow>(
      `SELECT a.id, a.pack_id AS packId, p.name AS packName, a.ref, a.name, a.dir, a.ext, a.kind, a.type, a.role, a.size
       FROM assets a JOIN packs p ON p.id = a.pack_id WHERE a.pack_id = ? ORDER BY a.dir COLLATE NOCASE, a.name COLLATE NOCASE`,
      [id],
    );
  }

  asset(id: number): AssetRow | null {
    return (
      this.get<AssetRow>(
        `SELECT a.id, a.pack_id AS packId, p.name AS packName, a.ref, a.name, a.dir, a.ext, a.kind, a.type, a.role, a.size
         FROM assets a JOIN packs p ON p.id = a.pack_id WHERE a.id = ?`,
        [id],
      ) ?? null
    );
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
      if (assetCol) {
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
}

const PACK_FIELDS = `p.id, p.name, p.folder, p.status, p.source, p.creator, p.licence, p.added_at AS addedAt,
  p.file_count AS fileCount, p.asset_count AS assetCount, p.size, p.cover_ref AS coverRef, p.problems`;
