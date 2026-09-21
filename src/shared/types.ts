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
