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
