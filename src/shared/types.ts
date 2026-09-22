/** Types shared by the main process and the window. */

/** process.platform values the app is built for; others behave like linux. */
export type Platform = 'darwin' | 'win32' | 'linux';

export interface AppInfo {
  name: string;
  version: string;
  platform: Platform;
  /** Versions of the runtime pieces, shown in Settings → About. */
  versions: { electron: string; chrome: string; node: string };
}

export type ThemeMode = 'system' | 'light' | 'dark';

export interface Settings {
  theme: ThemeMode;
  /** Seed for the Material 3 colour scheme, as #rrggbb. */
  seedColor: string;
  /** The open library folder, or null before one is chosen. */
  libraryPath: string | null;
  /** Libraries opened before, newest first. */
  recentLibraries: string[];
  /**
   * Imported packs whose download names their licence and comes from a known site go straight
   * into the library; the rest wait in the Inbox. Off: every import waits in the Inbox.
   */
  skipInboxWhenSure: boolean;
  /** The project "Copy to project" sends assets to. */
  activeProjectId: string | null;
  /** Backups: the folder holding the backup store, or null when backups are off. */
  backupRepo: string | null;
  /** Back up automatically this often while Tessera is open; 0 = only when asked. */
  backupIntervalHours: number;
  lastBackupAt: string | null;
  lastBackupError: string | null;
  /** Syncing the library with other computers (Syncthing) is on. */
  syncEnabled: boolean;
  syncMode: SyncMode;
  /** Sending error reports: ask each session, always, or never. Reports are always kept locally. */
  errorReports: ReportConsent;
}

/** Optional tools Tessera can fetch for the user. */
export type ToolName = 'syncthing' | 'kopia';

/** A place backups are likely to be: a cloud drive's folder, a drive, a personal folder. */
export interface BackupPlace {
  label: string;
  path: string;
  kind: 'cloud' | 'drive' | 'folder';
}

/** A backup store found in one of those places. */
export interface FoundBackup {
  path: string;
  place: string;
  kind: BackupPlace['kind'];
}

/** A library in a backup store: where it was backed up from, and its snapshots, newest first. */
export interface RestoreSource {
  key: string;
  name: string;
  host: string;
  path: string;
  snapshots: Snapshot[];
}

export type ReportConsent = 'ask' | 'always' | 'never';

/** Where an error came from: the main process, the app window, or a process that stopped. */
export type ErrorSource = 'main' | 'window' | 'process';

/** An error that wasn't expected, as it's caught. */
export interface ErrorInput {
  source: ErrorSource;
  kind: 'exception' | 'rejection' | 'page' | 'ipc' | 'crash';
  name: string;
  message: string;
  stack?: string;
  /** Short, non-identifying facts: the page open, the IPC channel. */
  context?: Record<string, string>;
}

export interface ErrorRecord extends ErrorInput {
  id: string;
  at: string;
  /** Errors with the same fingerprint are the same problem. */
  fingerprint: string;
  count: number;
  sent: boolean;
}

export interface ReportsStatus {
  /** This build can send reports (it has somewhere to send them). */
  available: boolean;
  consent: ReportConsent;
  /** Errors caught this session and not sent. */
  unsent: number;
  /** Crash reports from earlier sessions waiting for an answer. */
  crashes: number;
}

/** Push: this computer sends changes only. Pull: it receives only. Full: both ways. */
export type SyncMode = 'push' | 'pull' | 'full';

export interface SyncStatus {
  /** Syncthing is installed. */
  available: boolean;
  /** The Syncthing in use is the copy Tessera downloaded. */
  bundled: boolean;
  enabled: boolean;
  mode: SyncMode;
  running: boolean;
  /** This computer's device ID, to give to the other computers. */
  myId: string | null;
  devices: { id: string; name: string; connected: boolean; shared: boolean; completion: number | null }[];
  folder: { state: string; needBytes: number; errors: number } | null;
  /** Computers asking to connect, and libraries other computers offer to this one. */
  pendingDevices: { id: string; name: string }[];
  pendingFolders: { id: string; label: string; offeredBy: string }[];
}

export type SettingsPatch = Partial<Settings>;

export interface LibraryInfo {
  id: string;
  name: string;
  path: string;
}

export type LibraryState =
  | { status: 'none' }
  | { status: 'opening'; path: string }
  | { status: 'ready'; library: LibraryInfo; problems: { folder: string; message: string }[] }
  | { status: 'error'; path: string; code: string; message: string };

/** What a folder the user picked is. */
export type FolderKind = 'library' | 'empty' | 'missing' | 'other';

/** A folder as the library dialogs show it. */
export interface FolderInfo {
  path: string;
  name: string;
  kind: FolderKind;
  /** Files and folders in it, ignoring system clutter (0 when missing). */
  entries: number;
  /** Tessera can make folders and files there. */
  writable: boolean;
  /** Free space on its drive, in bytes; null when unknown. */
  free: number | null;
  /** The cloud service that syncs it, if any. */
  cloud: string | null;
  /** When it is a library: its name and how many packs it holds. */
  library: { name: string; packs: number } | null;
}

/** Libraries found from a folder the user picked: the folder itself, one it's inside, or ones in it. */
export interface LocateResult {
  via: 'itself' | 'parent' | 'inside' | 'none';
  found: { path: string; name: string; packs: number }[];
}

/** A piece of background work, shown in the activity indicator. */
export interface Job {
  id: string;
  label: string;
  /** What it is doing right now, e.g. the pack being read. */
  detail: string;
  /** 0–1, or null when the amount of work isn't known. */
  progress: number | null;
  state: 'running' | 'done' | 'failed';
  error?: string;
}

/**
 * Thumbnail state of an asset:
 * - a `tessera://thumb/…` URL when one is ready;
 * - `direct` when the window can draw the file itself (small web images);
 * - `pending` while it's being made; `failed` when it can't be; `none` for files without a picture.
 */
export type ThumbState = string | 'direct' | 'pending' | 'failed' | 'none';

/** Work for the render window. */
export interface RenderJob {
  id: string;
  /** What to draw: a model, an image (scaled), an HDR/EXR image (tone-mapped), a waveform, a font sample. */
  kind: 'model' | 'image' | 'hdr' | 'audio' | 'font';
  ext: string;
  url: string;
  /** Longest edge of the result, in pixels. */
  size: number;
  /** For models: every image in the pack by lower-case file name, to find textures an author's paths no longer point at. */
  textures?: Record<string, string>;
}

export interface RenderResult {
  id: string;
  /** WebP bytes, or null when drawing failed. */
  data: Uint8Array | null;
  error?: string;
}

/** What Tessera worked out about a pack from its files: suggestions, never applied silently. */
export interface Detected {
  licence: string | null;
  /** Where the licence was found, e.g. "License.txt". */
  licenceFrom: string | null;
  site: string | null;
  url: string | null;
  creator: string | null;
}

/** One pack an import would create. */
export interface ImportItem {
  id: string;
  name: string;
  /** Paths it's made from: one archive, one folder, or a few loose files. */
  sources: string[];
  kind: 'archive' | 'folder' | 'files';
  size: number;
  files: number;
  /** Name of a pack already in the library that looks like the same download. */
  duplicateOf: string | null;
}

export interface ImportResult {
  added: { id: string; name: string; status: 'inbox' | 'library' }[];
  failed: { name: string; error: string }[];
}

/** A change to a collection: rename, describe, add or remove items, or delete it. */
export interface CollectionChange {
  name?: string;
  description?: string;
  add?: { packId: string; ref: string }[];
  remove?: { packId: string; ref: string }[];
  delete?: boolean;
}

export interface BackupStatus {
  /** Kopia is installed. */
  available: boolean;
  /** The Kopia in use is the copy Tessera downloaded. */
  bundled: boolean;
  version: string | null;
  repoPath: string | null;
  intervalHours: number;
  lastBackupAt: string | null;
  lastError: string | null;
  running: boolean;
}

export interface Snapshot {
  id: string;
  startTime: string;
  endTime: string;
  size: number;
  files: number;
}

/** Commands the application menu sends to the window. */
export type MenuCommand = 'add' | 'addFolder' | 'addFolderOfPacks' | 'linkProject' | 'settings' | 'find' | 'palette' | 'home' | 'browse' | 'collections' | 'projects' | 'inbox' | 'reportProblem';
