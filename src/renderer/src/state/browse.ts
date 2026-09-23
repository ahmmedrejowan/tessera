import { create } from 'zustand';
import type { AssetSort, BrowseQuery, Facet, Filters, PackSort } from '@shared/query';
import { on } from '../api';

export type BrowseMode = 'assets' | 'packs';

/** A selectable thing in the results: an asset (by id) or a pack (by id). */
export type Selected = { kind: 'asset'; id: number } | { kind: 'pack'; id: string };

interface BrowseState {
  mode: BrowseMode;
  text: string;
  filters: Filters;
  assetSort: AssetSort;
  packSort: PackSort;
  includeSupport: boolean;
  /** Show only what has been starred. */
  favourites: boolean;
  /** Tile edge in pixels. */
  tileSize: number;
  filtersOpen: boolean;
  /** What shows through transparent images: a checkerboard, or plain dark or light. */
  tileBackground: 'checker' | 'dark' | 'light';
  /** The same choice behind a file in the viewer. */
  viewerBackground: 'checker' | 'dark' | 'light';
  /** Ids selected in the current mode. */
  selection: Set<number | string>;
  /** The item shown in the details sheet. */
  focused: Selected | null;
  /** Anchor for shift-click range selection. */
  anchor: number | null;

  setMode(mode: BrowseMode): void;
  setText(text: string): void;
  toggleFilter(facet: Facet, value: string): void;
  setFilter(facet: Facet, values: string[]): void;
  clearFilters(): void;
  setAssetSort(sort: AssetSort): void;
  setPackSort(sort: PackSort): void;
  setIncludeSupport(v: boolean): void;
  setFavourites(v: boolean): void;
  setTileSize(v: number): void;
  setFiltersOpen(v: boolean): void;
  setTileBackground(v: 'checker' | 'dark' | 'light'): void;
  setViewerBackground(v: 'checker' | 'dark' | 'light'): void;
  select(ids: (number | string)[], anchor?: number | null): void;
  focus(item: Selected | null): void;
}

const STORAGE_KEY = 'tessera.browse';
type Persisted = Pick<BrowseState, 'mode' | 'assetSort' | 'packSort' | 'includeSupport' | 'tileSize' | 'filtersOpen' | 'tileBackground' | 'viewerBackground'>;

function load(): Partial<Persisted> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Persisted>;
  } catch {
    return {};
  }
}

export const TILE_MIN = 96;
export const TILE_MAX = 280;

export const useBrowse = create<BrowseState>((set, get) => ({
  mode: 'assets',
  text: '',
  filters: {},
  assetSort: 'relevance',
  packSort: 'name',
  includeSupport: false,
  favourites: false,
  tileSize: 160,
  filtersOpen: true,
  tileBackground: 'checker',
  viewerBackground: 'checker',
  selection: new Set(),
  focused: null,
  anchor: null,
  ...load(),

  setMode: (mode) => set({ mode, selection: new Set(), anchor: null, focused: null }),
  setText: (text) => set({ text, selection: new Set(), anchor: null }),
  toggleFilter(facet, value) {
    const current = get().filters[facet] ?? [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    set({ filters: { ...get().filters, [facet]: next }, selection: new Set(), anchor: null });
  },
  setFilter: (facet, values) => set({ filters: { ...get().filters, [facet]: values }, selection: new Set(), anchor: null }),
  clearFilters: () => set({ filters: {}, selection: new Set(), anchor: null }),
  setAssetSort: (assetSort) => set({ assetSort }),
  setPackSort: (packSort) => set({ packSort }),
  setIncludeSupport: (includeSupport) => set({ includeSupport }),
  setFavourites: (favourites) => set({ favourites, selection: new Set(), anchor: null }),
  setTileSize: (tileSize) => set({ tileSize: Math.max(TILE_MIN, Math.min(TILE_MAX, Math.round(tileSize))) }),
  setFiltersOpen: (filtersOpen) => set({ filtersOpen }),
  setTileBackground: (tileBackground) => set({ tileBackground }),
  setViewerBackground: (viewerBackground) => set({ viewerBackground }),
  select: (ids, anchor) => set({ selection: new Set(ids), ...(anchor !== undefined ? { anchor } : {}) }),
  focus: (focused) => set({ focused }),
}));

// Asset ids are reused after re-indexing: a selection made before would point at other assets.
on('index:changed', () => {
  const { mode, focused } = useBrowse.getState();
  if (mode === 'assets') useBrowse.setState({ selection: new Set(), anchor: null, ...(focused?.kind === 'asset' ? { focused: null } : {}) });
});

// Remember view preferences, not the search or the selection.
useBrowse.subscribe((s) => {
  const keep: Persisted = { mode: s.mode, assetSort: s.assetSort, packSort: s.packSort, includeSupport: s.includeSupport, tileSize: s.tileSize, filtersOpen: s.filtersOpen, tileBackground: s.tileBackground, viewerBackground: s.viewerBackground };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keep));
  } catch {
    // storage full or unavailable: preferences just won't persist
  }
});

/** The query the current browse state describes. */
export function browseQuery(s: Pick<BrowseState, 'text' | 'filters' | 'includeSupport' | 'favourites'>): BrowseQuery {
  const filters: Filters = {};
  for (const [k, v] of Object.entries(s.filters)) if (v?.length) filters[k as Facet] = v;
  return {
    scope: 'library',
    text: s.text.trim(),
    filters,
    includeSupport: s.includeSupport,
    ...(s.favourites ? { favourites: true } : {}),
  };
}

export const activeFilterCount = (filters: Filters) => Object.values(filters).reduce((n, v) => n + (v?.length ?? 0), 0);
