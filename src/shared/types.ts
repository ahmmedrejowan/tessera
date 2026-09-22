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
