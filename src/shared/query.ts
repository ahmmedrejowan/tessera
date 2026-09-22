import type { AssetType, Kind, Role } from './assets';
import type { PackStatus } from './pack';

/** The facets a library can be filtered by. Within one facet values are OR'ed; facets are AND'ed. */
export const FACETS = ['type', 'format', 'source', 'creator', 'licence', 'genre', 'style', 'tag'] as const;
export type Facet = (typeof FACETS)[number];

export const FACET_LABELS: Record<Facet, string> = {
  type: 'Type',
  format: 'Format',
  source: 'Source',
  creator: 'Creator',
  licence: 'Licence',
  genre: 'Genre',
  style: 'Style',
  tag: 'Tags',
};

export type Filters = Partial<Record<Facet, string[]>>;

/** Which packs a query looks at. Browse shows the library; the Inbox page shows what's waiting. */
export type Scope = 'library' | 'inbox' | 'all';

/** `relevance` puts whole-word matches of the search first; without search text it sorts by name. */
export type AssetSort = 'relevance' | 'name' | 'added' | 'size' | 'pack' | 'type';
export type PackSort = 'name' | 'added' | 'size' | 'count';

export interface BrowseQuery {
  scope: Scope;
  text: string;
  filters: Filters;
  /** Only these packs (a pack page, or a collection's packs). */
  packIds?: string[];
  /** Show supporting files (textures of models, .mtl, buffers) and pack previews too. */
  includeSupport?: boolean;
  /** Only the items of this manual collection (any role), in the order they were added. */
  collectionId?: string;
}

export interface AssetRow {
  id: number;
  packId: string;
  packName: string;
  ref: string;
  /** File name. */
  name: string;
  /** Folder of the file inside the pack, for display (archives shown as folders). */
  dir: string;
  ext: string;
  kind: Kind;
  type: AssetType;
  role: Role;
  size: number;
  /** Every format this asset comes in (its variants included), e.g. ['fbx', 'glb', 'obj']. */
  formats: string[];
}

export interface PackRow {
  id: string;
  name: string;
  folder: string;
  status: PackStatus;
  /** Known site id, or the free-text source name. */
  source: string | null;
  creator: string | null;
  licence: string | null;
  addedAt: string;
  fileCount: number;
  /** Files counted as assets (role `main`). */
  assetCount: number;
  size: number;
  coverRef: string | null;
  /** A few of its assets (images first), for a cover mosaic when the pack ships no preview. */
  samples: Pick<AssetRow, 'id' | 'ref' | 'ext' | 'kind' | 'type'>[];
  /** Main assets by type, for the pack card's summary line. */
  types: Partial<Record<AssetType, number>>;
  genres: string[];
  styles: string[];
  tags: string[];
  problems: string[];
}

export interface FacetValue {
  value: string;
  count: number;
}

export type FacetCounts = Record<Facet, FacetValue[]>;

export interface Page<T> {
  rows: T[];
  total: number;
}

export interface LibraryStats {
  packs: number;
  inbox: number;
  assets: number;
  size: number;
  byType: Partial<Record<AssetType, number>>;
}
