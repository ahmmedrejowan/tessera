/**
 * The contract between the main process and the window.
 *
 * `Invokes` are request/response calls the window makes; `Events` are pushed from main. Both sides
 * are typed from these two maps, so a channel can't be misspelled or called with the wrong shape.
 */
import type { PackEdit, PackMeta } from './pack';
import type { AssetRow, AssetSort, BrowseQuery, FacetCounts, LibraryStats, Page, PackRow, PackSort } from './query';
import type { AppInfo, FolderKind, Job, LibraryState, Platform, Settings, SettingsPatch } from './types';

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

  'browse:assets': (query: BrowseQuery, sort: AssetSort, offset: number, limit: number) => Page<AssetRow>;
  'browse:packs': (query: BrowseQuery, sort: PackSort, offset: number, limit: number) => Page<PackRow>;
  'browse:facets': (query: BrowseQuery, mode: 'assets' | 'packs') => FacetCounts;

  'pack:get': (id: string) => (PackRow & { meta: PackMeta }) | null;
  'pack:files': (id: string) => AssetRow[];
  'pack:edit': (id: string, edit: PackEdit) => void;
  'asset:get': (id: number) => AssetRow | null;

  'jobs:list': () => Job[];
}

export interface Events {
  'settings:changed': Settings;
  'library:changed': LibraryState;
  /** The index changed; the number only increases, so the window can tell stale data apart. */
  'index:changed': number;
  'jobs:changed': Job[];
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
}
