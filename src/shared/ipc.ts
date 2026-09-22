/**
 * The contract between the main process and the window.
 *
 * `Invokes` are request/response calls the window makes; `Events` are pushed from main. Both sides
 * are typed from these two maps, so a channel can't be misspelled or called with the wrong shape.
 */
import type { PackEdit, PackMeta, PackStatus } from './pack';
import type { CopyPlan, ManifestEntry, Project, ProjectProbe, ProjectSummary } from './project';
import type { AssetRow, AssetSort, BrowseQuery, FacetCounts, LibraryStats, LicenceHealth, Page, PackRow, PackSort } from './query';
import type { CollectionItem, CollectionSummary, SmartQuery } from './collection';
import type { AppInfo, BackupStatus, ErrorInput, FolderInfo, LocateResult, ReportsStatus, MenuCommand, CollectionChange, Detected, Snapshot, SyncMode, SyncStatus, FolderKind, ImportItem, ImportResult, Job, LibraryState, Platform, Settings, SettingsPatch, ThumbState } from './types';

export interface Invokes {
  'app:info': () => AppInfo;
  'settings:get': () => Settings;
  'settings:update': (patch: SettingsPatch) => Settings;
  /** Colours for the window controls drawn by the OS on Windows and Linux, to match the app bar. */
  'window:chrome': (colors: { background: string; foreground: string }) => void;

  /**
   * Ask the user for a folder; null when they cancel. `message` shows above the picker on macOS
   * (where the title isn't shown); `defaultPath` is where it opens.
   */
  'dialog:folder': (title: string, options?: { message?: string; defaultPath?: string; buttonLabel?: string }) => string | null;
  /** The folders to suggest first: Documents, the home folder, the desktop. */
  'fs:places': () => { documents: string; home: string; desktop: string; separator: string };
  /** What a folder is and whether a library can go there (it may not exist yet). */
  'fs:describe': (path: string) => FolderInfo;
  /** The library a picked folder means: itself, one it's inside, or ones inside it. */
  'library:locate': (path: string) => LocateResult;
  'library:state': () => LibraryState;
  'library:inspect': (path: string) => FolderKind;
  'library:create': (path: string, name: string) => LibraryState;
  'library:open': (path: string) => LibraryState;
  'library:close': () => void;
  'library:refresh': () => void;
  'library:stats': () => LibraryStats;
  'library:health': () => LicenceHealth;
  /** Read every pack again from scratch (after moving files around by hand, say). */
  'library:reindex': () => void;
  /** Size of the thumbnail cache, and throw it away (thumbnails are drawn again as needed). */
  'thumbs:size': () => number;
  'thumbs:clear': () => void;
  /** Show the app's log folder. */
  'app:showLogs': () => void;
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
  /** Move a pack to the system trash; returns its name. */
  'pack:remove': (id: string) => string;
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

  'backup:status': () => BackupStatus;
  /** Ask for a folder to keep backups in; null when cancelled. */
  'backup:chooseFolder': () => string | null;
  /** Start backing up to a folder, making a new store there or opening an existing one. */
  'backup:setup': (repoPath: string, password: string, create: boolean) => void;
  'backup:now': () => void;
  'backup:snapshots': () => Snapshot[];
  /** Restore a snapshot into a folder the user picks; returns that folder, or null when cancelled. */
  'backup:restore': (id: string) => string | null;
  'backup:turnOff': () => void;

  'sync:status': () => SyncStatus;
  'sync:enable': (mode: SyncMode) => void;
  'sync:setMode': (mode: SyncMode) => void;
  'sync:disable': () => void;
  'sync:addDevice': (deviceId: string, name: string) => void;
  'sync:removeDevice': (deviceId: string) => void;
  /** Start syncing with no library open, to receive one from another computer. */
  'sync:receive': () => void;
  /** Accept a library another computer offers, to arrive in `path` (a new or empty folder). */
  'sync:acceptFolder': (folderId: string, offeredBy: string, label: string, path: string, mode: SyncMode) => void;
  /** How much of a library that's arriving is here. */
  'sync:folderProgress': (folderId: string) => { state: string; globalBytes: number; inSyncBytes: number; needBytes: number } | null;
  /** Download Syncthing into Tessera's data folder (progress comes as `sync:installProgress`); returns its version. */
  'sync:install': () => string;
  /** Package managers on this system that can install Syncthing. */
  'sync:packageManagers': () => string[];

  /** Ask the user for files or a folder to add; null when they cancel. */
  'import:choose': (what: 'files' | 'folder' | 'folderOfPacks') => string[] | null;
  'import:plan': (paths: string[], eachInside: boolean) => ImportItem[];
  'import:run': (items: ImportItem[]) => ImportResult;

  /** An unexpected error caught in the window, to keep (and send, with consent). */
  'reports:capture': (input: ErrorInput) => void;
  'reports:status': () => ReportsStatus;
  /** What to bring up when the window loads: the window was reopened after a crash; a question. */
  'reports:pending': () => { recovered: boolean; ask: boolean };
  /** Exactly what would be sent for the errors waiting, as JSON. */
  'reports:preview': () => string;
  'reports:respond': (answer: 'once' | 'always' | 'never' | 'not-now') => void;
  /** Send crash reports from earlier sessions, or not; they're cleared either way. */
  'reports:crashes': (send: boolean) => void;
  /** A report the user asked for, as text: their words, this session's errors, the recent log. */
  'reports:problem': (note: string) => string;
  /** Save that report where the user chooses; returns the file, or null when cancelled. */
  'reports:saveProblem': (note: string) => string | null;
  'reports:sendProblem': (note: string) => void;

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
  /** Backup settings or state changed. */
  'backup:changed': number;
  /** Sync settings or state changed. */
  'sync:changed': number;
  'sync:installProgress': { stage: 'finding' | 'downloading' | 'checking' | 'unpacking' | 'done'; received: number; total: number; version?: string };
  'menu:command': MenuCommand;
  /** Errors were caught and consent is "ask": time to ask. */
  'reports:ask': number;
  'reports:changed': number;
  /** Something failed in the background, out of sight of the window. */
  'reports:caught': { title: string; details: string };
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
