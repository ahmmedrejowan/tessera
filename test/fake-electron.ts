/**
 * Just enough of Electron to run the app's handlers without a window: they register here, and what
 * they ask the desktop to do is recorded rather than done. A test file reaches for it with
 * `vi.mock('electron', () => import('./fake-electron'))`.
 */
import { join } from 'node:path';

/** Every handler the app registered, by channel. */
export const handlers = new Map<string, (...args: unknown[]) => unknown>();

/** What the fake desktop was asked to do, and what it should answer. */
export const asked = {
  opened: [] as string[],
  revealed: [] as string[],
  external: [] as string[],
  sent: [] as { channel: string; payload: unknown }[],
  /** What the next folder picker answers with, or null for "cancelled". */
  folder: null as string | null,
  /** What the next file picker answers with. */
  files: [] as string[],
  /** Where the next save box says to save, or null for "cancelled". */
  savePath: null as string | null,
  /** What a hidden window should fail with when it is asked to open a page. */
  pageLoad: null as Error | null,
  /** How the Mac answers a request for a fingerprint: not asked for, agreed to, or refused. */
  touchId: 'none' as 'none' | 'agreed' | 'refused',
  /** Answers web requests instead of the network, when a test sets it. */
  fetch: null as ((url: string, init?: RequestInit) => Promise<Response>) | null,
};

export function forget(): void {
  asked.opened = [];
  asked.revealed = [];
  asked.external = [];
  asked.sent = [];
  asked.folder = null;
  asked.files = [];
  asked.savePath = null;
  asked.pageLoad = null;
  asked.fetch = null;
  asked.touchId = 'none';
}

const theWindow = {
  isDestroyed: () => false,
  webContents: {
    send: (channel: string, payload: unknown) => void asked.sent.push({ channel, payload }),
    setWindowOpenHandler: () => undefined,
    setAudioMuted: () => undefined,
    session: { setPermissionRequestHandler: () => undefined },
    // Enough of a PDF for anything that checks it is one.
    printToPDF: async () => Buffer.from('%PDF-1.4\n%fake\n'),
  },
  setBackgroundColor: () => undefined,
  setTitleBarOverlay: () => undefined,
  on: () => undefined,
  once: () => undefined,
  show: () => undefined,
  close: () => undefined,
  destroy: () => undefined,
  loadURL: async () => {
    if (asked.pageLoad) throw asked.pageLoad;
  },
  loadFile: async () => undefined,
  getBounds: () => ({ x: 0, y: 0, width: 1280, height: 800 }),
  isMaximized: () => false,
};

export const windows = [theWindow];

export const ipcMain = {
  handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => {
    handlers.set(channel, (...args: unknown[]) => fn(null, ...args));
  },
  removeHandler: (channel: string) => void handlers.delete(channel),
  on: () => undefined,
};

export const BrowserWindow = Object.assign(
  function BrowserWindow() {
    return theWindow;
  },
  { getAllWindows: () => windows, getFocusedWindow: () => theWindow, fromWebContents: () => theWindow },
);

export const app = {
  getPath: (what: string) => join('/tmp/tessera-fake', what),
  getVersion: () => '0.0.0-test',
  getName: () => 'Tessera',
  getAppPath: () => process.cwd(),
  isPackaged: false,
  on: () => undefined,
  whenReady: async () => undefined,
  quit: () => undefined,
  relaunch: () => undefined,
  setAsDefaultProtocolClient: () => true,
  requestSingleInstanceLock: () => true,
};

export const dialog = {
  showOpenDialog: async (_w: unknown, options: { properties?: string[] }) => {
    const folder = options.properties?.includes('openDirectory');
    const paths = folder ? (asked.folder ? [asked.folder] : []) : asked.files;
    return { canceled: paths.length === 0, filePaths: paths };
  },
  showSaveDialog: async () => ({ canceled: !asked.savePath, filePath: asked.savePath ?? '' }),
  showMessageBox: async () => ({ response: 0 }),
  showErrorBox: () => undefined,
};

export const shell = {
  openPath: async (path: string) => void asked.opened.push(path),
  showItemInFolder: (path: string) => void asked.revealed.push(path),
  openExternal: async (url: string) => void asked.external.push(url),
  trashItem: async () => undefined,
};

export const screen = {
  getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }],
  getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
};

export const systemPreferences = {
  canPromptTouchID: () => asked.touchId !== 'none',
  promptTouchID: async (_reason: string) => {
    if (asked.touchId === 'refused') throw new Error('no match');
  },
};
export const session = {
  fromPartition: () => ({ on: () => undefined, setPermissionRequestHandler: () => undefined }),
};
export const nativeTheme = { shouldUseDarkColors: false, on: () => undefined };
export const net = {
  fetch: (...args: Parameters<typeof globalThis.fetch>) =>
    asked.fetch ? asked.fetch(String(args[0]), args[1]) : globalThis.fetch(...args),
};
export const safeStorage = {
  isEncryptionAvailable: () => false,
  getSelectedStorageBackend: () => 'basic_text',
  encryptString: (s: string) => Buffer.from(s, 'utf8'),
  decryptString: (b: Buffer) => b.toString('utf8'),
};
export const protocol = { handle: () => undefined, registerSchemesAsPrivileged: () => undefined };
export const Menu = { setApplicationMenu: () => undefined, buildFromTemplate: () => ({}) };
export const powerSaveBlocker = { start: () => 1, stop: () => undefined, isStarted: () => false };
export default { app, BrowserWindow, dialog, ipcMain, shell };
