import type { AssetType, Kind, Role } from './assets';
import type { PackStatus } from './pack';

/** The facets a library can be filtered by. Within one facet values are OR'ed; facets are AND'ed. */
export const FACETS = ['type', 'format', 'source', 'creator', 'license', 'genre', 'style', 'tag'] as const;
export type Facet = (typeof FACETS)[number];

export const FACET_LABELS: Record<Facet, string> = {
  type: 'Type',
  format: 'Format',
  source: 'Source',
  creator: 'Creator',
  license: 'License',
  genre: 'Genre',
  style: 'Style',
  tag: 'Tags',
};

export type Filters = Partial<Record<Facet, string[]>>;

/** Which packs a query looks at. Browse shows the library; the Inbox page shows what's waiting. */
export type Scope = 'library' | 'inbox' | 'all';

/** `relevance` puts whole-word matches of the search first; without search text it sorts by name. */
export type AssetSort = 'relevance' | 'name' | 'added' | 'size' | 'pack' | 'type';
export type PackSort = 'name' | 'added' | 'size' | 'count' | 'used';

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
  /** Only what its owner starred: assets in the Favorites collection, or starred packs. */
  favorites?: boolean;
  /**
   * Packs that were put away are left out of browsing; `only` shows those instead. Collections and
   * a pack's own page still show everything, so nothing goes missing where it was put by hand.
   */
  archived?: 'only';
  /** Only packs read from a folder outside the library, for "what is not backed up". */
  kept?: true;
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
  /** Starred by its owner. */
  fav: boolean;
  /** The license covering this file: the pack's own, or the rule for the part of the pack it is in. */
  license: string | null;
}

export interface PackRow {
  id: string;
  name: string;
  folder: string;
  status: PackStatus;
  /** Known site id, or the free-text source name. */
  source: string | null;
  creator: string | null;
  license: string | null;
  addedAt: string;
  fileCount: number;
  /** Files counted as assets (role `main`). */
  assetCount: number;
  size: number;
  coverRef: string | null;
  /** Starred by its owner. */
  fav: boolean;
  /** Put away, out of the way of browsing. */
  archived: boolean;
  /** The folder its files are read from, when they were never brought into the library. */
  keptWhere: string | null;
  /** That folder could not be read when the library was last looked at: an unplugged drive. */
  away: boolean;
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
  /** Packs in the archive: kept in full, out of the way of browsing. */
  archived: number;
  assets: number;
  size: number;
  byType: Partial<Record<AssetType, number>>;
  /** Packs read from a folder outside the library, so backups and sync do not carry their files. */
  kept: number;
  /** Of those, ones whose folder could not be read when the library was last looked at. */
  keptAway: number;
}

/** Packs in the library whose license needs attention before shipping. */
export interface LicenseHealth {
  /** No license on record at all: the one thing that must be fixed. */
  noLicense: { id: string; name: string; license: string | null }[];
  /** Nothing on record about where it came from. */
  noSource: { id: string; name: string; license: string | null }[];
  /** The license asks for credit, but no credit line is recorded. */
  noCreditLine: { id: string; name: string; license: string | null }[];
  /** Not allowed in commercial games, or terms Tessera can't judge: a choice for the game to make. */
  restricted: { id: string; name: string; license: string | null }[];
}
