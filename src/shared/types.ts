/** Types shared by the main process and the window. */

import type { StorageTarget } from './storage';

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

/** One thing waiting in the library's own wastebasket. */
export interface BinEntry {
  id: string;
  kind: 'pack' | 'file';
  deletedAt: string;
  packId: string;
  packName: string;
  /** A pack's folder name, or the file's ref inside its pack. */
  ref: string;
  /** The path shown to people. */
  shown: string;
  size: number;
  /** Inside a pack's archive: hidden rather than moved, so it comes back by itself. */
  hiddenOnly: boolean;
}

export interface Settings {
  theme: ThemeMode;
  /** Seed for the Material 3 colour scheme, as #rrggbb. */
  seedColor: string;
  /** The open library folder (opened again at start), or null. */
  libraryPath: string | null;
  /** Every library this computer knows, by library id: its own settings live here. */
  libraries: Record<string, LibraryRecord>;
  /** The project "Copy to project" sends assets to (projects are shared by every library). */
  activeProjectId: string | null;
  /** Without a keychain: the user agreed to keep the backup password in an owner-only file. */
  backupPasswordInFile: boolean;
  /** Sending error reports: ask each session, always, or never. Reports are always kept locally. */
  errorReports: ReportConsent;
  /** What the user has told Tessera about sites: "everything on this one is CC0". */
  siteRules: SiteRule[];
  /** How many downloads may run at once (1-5). */
  downloadsAtOnce: number;
  /**
   * What happens when a download finishes, whichever library is open: add it (a clear licence
   * goes into the library, the rest wait in Review), send every one to Review, or leave it in
   * Downloads for the user.
   */
  afterDownload: AfterDownload;
  /** How long deleted things wait in the library's bin before they go for good; 0 keeps them. */
  binKeepDays: number;
  /** Look for a newer Tessera on start and once a day. */
  updateCheck: boolean;
  /** Fetch a newer version's installer as soon as one is found (it still waits to be opened). */
  autoInstallUpdates: boolean;
}

/** A site the user has set the licence for, so packs from it fill themselves in. */
export interface SiteRule {
  /** The host it covers, without "www."; subdomains count. */
  host: string;
  /** The licence its packs carry, as a licence id. */
  licence: string | null;
  /** Who to credit, when the site is one creator. */
  creator: string | null;
  addedAt: string;
}

/** Optional tools Tessera can fetch for the user. */
export type ToolName = 'syncthing' | 'kopia' | 'rclone';

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
  /** The open library syncs, in this mode. */
  enabled: boolean;
  mode: SyncMode;
  /** It keeps syncing while another library is open. */
  whileClosed: boolean;
  running: boolean;
  /** This computer's device ID, to give to the other computers. */
  myId: string | null;
  devices: { id: string; name: string; connected: boolean; shared: boolean; completion: number | null }[];
  folder: { state: string; needBytes: number; errors: number } | null;
  /** Computers asking to connect, and libraries other computers offer to this one. */
  pendingDevices: { id: string; name: string }[];
  pendingFolders: { id: string; label: string; offeredBy: string }[];
}

/** One library's backups: where they go, how often, and how the last one went. */
export interface LibraryBackup {
  /** Where backups go, described for people ("Google Drive · Tessera Backups"). */
  repo: string;
  /** Where backups go, without its secrets (those stay in Kopia's own configuration). */
  target: StorageTarget;
  /** Back up automatically this often while Tessera is open; 0 = only when asked. */
  intervalHours: number;
  lastBackupAt: string | null;
  lastError: string | null;
}

/** One library's syncing with other computers. */
export interface LibrarySync {
  enabled: boolean;
  mode: SyncMode;
  /** Keep syncing while another library is open (Tessera running); off: only while it's open. */
  whileClosed: boolean;
}

/** A library this computer knows, with its own settings. */
export interface LibraryRecord {
  id: string;
  /** Its name and folder when last seen. */
  name: string;
  path: string;
  lastOpenedAt: string;
  /**
   * Imported packs whose download names their licence and comes from a known site go straight
   * into the library; the rest wait in the Inbox. Off: every import waits in the Inbox.
   */
  skipInboxWhenSure: boolean;
  sync: LibrarySync;
  backup: LibraryBackup | null;
}

/** What to do with a finished download. */
export type AfterDownload = 'add' | 'review' | 'ask';

/** A known library as the switcher and the welcome screen show it. */
export interface LibrarySummary {
  id: string;
  name: string;
  path: string;
  lastOpenedAt: string;
  open: boolean;
  /** The folder is there and still holds this library (not moved, drive connected). */
  found: boolean;
  backup: { on: boolean; lastBackupAt: string | null; failing: boolean };
  sync: { on: boolean; whileClosed: boolean };
}

/** What the window may change; backups change through their own calls. */
export type SettingsPatch = Partial<Omit<Settings, 'libraries'>>;

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
  /** The licence was read in the pack or set by the user's rule for the site, not merely usual there. */
  licenceSure?: boolean;
  site: string | null;
  url: string | null;
  /** Where the link came from: "a link in the pack", "the file name". */
  urlFrom?: string | null;
  creator: string | null;
}

/** A detail filled in for the user, and where it came from. */
export interface Suggestion<T> {
  value: T;
  /** "License.txt", "the file name", … */
  from: string;
  /** Read from the pack's own words (true), or worked out and worth a check (false). */
  sure: boolean;
}

/** What a pack's files suggest for its details, beyond the licence and source already applied. */
export interface PackSuggestions {
  name?: Suggestion<string>;
  version?: Suggestion<string>;
  description?: Suggestion<string>;
  creator?: Suggestion<string>;
  styles?: Suggestion<string[]>;
  tags?: Suggestion<string[]>;
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
  /** The folder of downloads it was found in, when a folder was taken as several packs. */
  folder?: string;
  /** The link it was downloaded from, when Tessera fetched it. */
  url?: string;
}

/** Whether a newer Tessera has been published, as the About page shows it. */
export interface UpdateStatus {
  /** This build. */
  current: string;
  checking: boolean;
  /** The newest published version, without its "v". */
  latest: string | null;
  /** Where to read about it and get it. */
  url: string | null;
  /** The first lines of what changed. */
  notes: string | null;
  publishedAt: string | null;
  lastCheckedAt: string | null;
  error: string | null;
  /** The published version is newer than this one. */
  newer: boolean;
  /** This build knows where to look. */
  canCheck: boolean;
  /** An installer for this computer is being fetched, or is ready to open. */
  downloading: boolean;
  installer: string | null;
}

/** What kind of thing happened in a library. */
export type ActivityKind = 'added' | 'downloaded' | 'reviewed' | 'backup' | 'sync' | 'project' | 'library';

/** One thing that happened, as Home shows it. */
export interface ActivityEntry {
  at: string;
  kind: ActivityKind;
  /** One line, in the user's words. */
  text: string;
  /** A second line, when there's more worth saying. */
  detail?: string;
}

/** Where a download has got to. */
export type DownloadState = 'waiting' | 'running' | 'paused' | 'ready' | 'added' | 'failed' | 'cancelled';

/** One link the user brought, on its way to becoming a pack. */
export interface DownloadItem {
  id: string;
  url: string;
  /** The site it's from, without "www.", shown before anything is fetched. */
  host: string;
  name: string;
  state: DownloadState;
  received: number;
  /** Bytes in all, when the site says; null when it doesn't. */
  total: number | null;
  /** Bytes a second while it runs, smoothed. */
  speed: number;
  /** Seconds left at that speed; null when it can't tell. */
  eta: number | null;
  error: string | null;
  /** The finished file, until it's added or cleared. */
  file: string | null;
  addedAt: string;
  /** When it first started, and when it stopped for good. */
  startedAt: string | null;
  finishedAt: string | null;
  /** How many goes it has had. */
  tries: number;
  /** What it became, once it's in the library. */
  packName?: string | null;
}

export interface ImportResult {
  /** `item` is the ImportItem's id. */
  added: { id: string; item: string; name: string; status: 'inbox' | 'library' }[];
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
  /** rclone is there, for cloud drives. */
  rclone: boolean;
  /** The system keychain can keep the password. */
  keychain: boolean;
  /** Where backups go, without secrets. */
  target: StorageTarget | null;
  version: string | null;
  repoPath: string | null;
  intervalHours: number;
  lastBackupAt: string | null;
  lastError: string | null;
  running: boolean;
  /** Other libraries' backups this one could join (same place, same password). */
  others: { libraryId: string; libraryName: string; repo: string }[];
}

export interface Snapshot {
  id: string;
  startTime: string;
  endTime: string;
  size: number;
  files: number;
}

/** Commands the application menu sends to the window. */
export type MenuCommand = 'add' | 'addFolder' | 'addFolderOfPacks' | 'linkProject' | 'settings' | 'find' | 'shortcuts' | 'home' | 'browse' | 'collections' | 'projects' | 'inbox' | 'downloads' | 'help' | 'about' | 'reportProblem';
