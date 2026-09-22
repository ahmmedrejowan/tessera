/**
 * The contract between the main process and the window.
 *
 * `Invokes` are request/response calls the window makes; `Events` are pushed from main. Both sides
 * are typed from these two maps, so a channel can't be misspelled or called with the wrong shape.
 */
import type { PackEdit, PackMeta, PackStatus } from './pack';
import type { CopyPlan, ManifestEntry, Project, ProjectProbe, ProjectSummary } from './project';
import type { AssetRow, AssetSort, BrowseQuery, FacetCounts, LibraryStats, Page, PackRow, PackSort } from './query';
import type { CollectionItem, CollectionSummary, SmartQuery } from './collection';
import type { AppInfo, CollectionChange, Detected, FolderKind, ImportItem, ImportResult, Job, LibraryState, Platform, Settings, SettingsPatch, ThumbState } from './types';

export interface Invokes {
  'app:info': () => AppInfo;
  'settings:get': () => Settings;
  'settings:update': (patch: SettingsPatch) => Settings;
  /** Colours for the window controls drawn by the OS on Windows and Linux, to match the app bar. */
  'window:chrome': (colors: { background: string; foreground: string }) => void;

  /** Ask the user for a folder; null when they cancel. */
  'dialog:folder': (title: string) => string | null;
  'library:state': () => LibraryState;
  'library:inspect': (path: string) => FolderKind;
  'library:create': (path: string, name: string) => LibraryState;
  'library:open': (path: string) => LibraryState;
  'library:close': () => void;
  'library:refresh': () => void;
  'library:stats': () => LibraryStats;
  /** Words already used for a pack field, most used first. */
  'library:terms': (field: 'genre' | 'style' | 'tag' | 'creator') => { value: string; count: number }[];

  'browse:assets': (query: BrowseQuery, sort: AssetSort, offset: number, limit: number) => Page<AssetRow>;
  'browse:packs': (query: BrowseQuery, sort: PackSort, offset: number, limit: number) => Page<PackRow>;
  'browse:facets': (query: BrowseQuery, mode: 'assets' | 'packs') => FacetCounts;

  'pack:get': (id: string) => (PackRow & { meta: PackMeta }) | null;
  'pack:files': (id: string) => AssetRow[];
  'pack:edit': (id: string, edit: PackEdit) => void;
  /** Licence, source and creator read from the pack's own files. */
  'pack:detect': (id: string) => Detected;
  /** Move a pack between the Inbox and the library; joining the library needs a licence and a source. */
  'pack:status': (id: string, status: PackStatus) => void;
  /** Files in the pack's licence/ folder: licence texts, receipts, screenshots. */
  'pack:proof': (id: string) => { name: string; size: number; url: string }[];
  /** Ask for files and copy them into the pack's licence/ folder; returns how many were added. */
  'pack:addProof': (id: string) => number;
  'pack:openProof': (id: string, name: string) => void;
  'asset:get': (id: number) => AssetRow | null;
  'asset:variants': (id: number) => AssetRow[];
  /** Pack and path of assets by id, for adding a selection to a collection. */
  'assets:refs': (ids: number[]) => { packId: string; ref: string }[];
  /** A pack's images by lower-case file name → URL, for finding a model's textures. */
  'pack:textures': (id: string) => Record<string, string>;
  /** Show a pack's folder, or the file on disk that holds one of its files, in Finder / Explorer. */
  'pack:reveal': (id: string, ref?: string) => void;

  'jobs:list': () => Job[];

  'collections:list': () => CollectionSummary[];
  /** Create a collection (manual with items, or smart with a query); returns its id. */
  'collections:create': (name: string, init: { description?: string; items?: CollectionItem[]; query?: SmartQuery | null }) => string;
  'collections:change': (id: string, change: CollectionChange) => void;

  'projects:list': () => ProjectSummary[];
  /** Ask for a game project's folder and say what it is; null when cancelled. */
  'projects:choose': () => ProjectProbe | null;
  /** Say what a folder is as a game project. */
  'projects:probe': (path: string) => ProjectProbe;
  'projects:add': (probe: ProjectProbe) => Project;
  'projects:update': (id: string, patch: Partial<Pick<Project, 'name' | 'target' | 'creditsFile'>>) => void;
  /** Forget a project; its files stay. */
  'projects:unlink': (id: string) => void;
  'projects:entries': (id: string) => ManifestEntry[];
  'projects:plan': (id: string, items: { packId: string; ref: string }[]) => CopyPlan;
  'projects:copy': (id: string, items: { packId: string; ref: string }[]) => number;
  'projects:remove': (id: string, items: { packId: string; ref: string }[]) => number;
  /** Show the project folder, or a file in it, in Finder / Explorer. */
  'projects:reveal': (id: string, rel?: string) => void;

  /** Ask the user for files or a folder to add; null when they cancel. */
  'import:choose': (what: 'files' | 'folder' | 'folderOfPacks') => string[] | null;
  'import:plan': (paths: string[], eachInside: boolean) => ImportItem[];
  'import:run': (items: ImportItem[]) => ImportResult;

  /** Thumbnail states by asset key (see `assetKey`); missing ones are queued, newest request first. */
  'thumbs:get': (keys: string[]) => Record<string, ThumbState>;
}

export interface Events {
  'settings:changed': Settings;
  'library:changed': LibraryState;
  /** The index changed; the number only increases, so the window can tell stale data apart. */
  'index:changed': number;
  'jobs:changed': Job[];
  /** Thumbnails that became ready (or failed) since the last event. */
  'thumbs:ready': Record<string, ThumbState>;
  /** Projects or what's copied into them changed. */
  'projects:changed': number;
}

export type InvokeChannel = keyof Invokes;
export type EventChannel = keyof Events;

/** What a handler's result looks like on the wire: errors travel as data so their message survives. */
export type Wire<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };

/**
 * The bridge the preload script puts on `window.tessera`. `invoke` hands back the raw `Wire` result:
 * errors don't keep their fields across the context bridge, so the window unwraps them itself.
 */
export interface Bridge {
  invoke<K extends InvokeChannel>(channel: K, ...args: Parameters<Invokes[K]>): Promise<Wire<Awaited<ReturnType<Invokes[K]>>>>;
  on<K extends EventChannel>(channel: K, listener: (payload: Events[K]) => void): () => void;
  platform: Platform;
  /** Paths on disk of files dropped on the window. */
  pathsFor(files: File[]): string[];
  /** Write files to disk (extracting from archives) ready to drag out; returns their paths. */
  prepareDrag(items: { packId: string; ref: string }[]): Promise<string[]>;
  /** Start dragging files out of the window. Call from a dragstart handler. */
  startDrag(paths: string[]): void;
  /** Set for automated UI tests (TESSERA_E2E=1): the window exposes test hooks. */
  e2e: boolean;
}
