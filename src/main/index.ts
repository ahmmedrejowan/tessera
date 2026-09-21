import { app, BrowserWindow, dialog, nativeTheme, shell } from 'electron';
import { join } from 'node:path';
import type { Platform } from '@shared/types';
import { broadcast, handle, UserError } from './ipc';
import { parseRef } from './index/files';
import { Jobs } from './jobs';
import { DIRS } from './library/layout';
import { LibraryService } from './libraryService';
import { initLog, log } from './log';
import { handleProtocol, registerSchemePrivileges } from './protocol';
import { packFileUrl } from '@shared/urls';
import { SettingsStore } from './settings';
import { RenderWindow } from './thumbs/renderWindow';
import { ThumbService } from './thumbs/service';
import { defaultSize, loadWindowState, trackWindowState } from './windowState';

const platform = (['darwin', 'win32'].includes(process.platform) ? process.platform : 'linux') as Platform;

// A separate data folder for development and tests, so they never touch a real install's settings.
if (process.env.TESSERA_USER_DATA) app.setPath('userData', process.env.TESSERA_USER_DATA);
else if (!app.isPackaged) app.setPath('userData', `${app.getPath('userData')}-dev`);

const dataDir = app.getPath('userData');
initLog(join(dataDir, 'logs'));
const settings = new SettingsStore(dataDir);
/** The app's own windows; the hidden render window isn't one of them. */
const appWindows = new Set<BrowserWindow>();
const windows = () => [...appWindows];
const jobs = new Jobs((list) => broadcast(windows, 'jobs:changed', list));
let indexVersion = 0;
const library = new LibraryService({
  dataDir,
  jobs,
  onState: (state) => broadcast(windows, 'library:changed', state),
  onIndexChanged: () => {
    // Asset ids change with the index; queued thumbnails would answer to stale ids.
    thumbs.reset();
    broadcast(windows, 'index:changed', ++indexVersion);
  },
});

const thumbDir = () => {
  const state = library.getState();
  return state.status === 'ready' ? join(dataDir, 'libraries', state.library.id, 'thumbs') : null;
};
let renderWindow: RenderWindow | null = null;
const thumbs = new ThumbService({
  queries: () => (library.getState().status === 'ready' ? library.require().queries : null),
  thumbDir,
  render: (job) => (renderWindow ??= new RenderWindow()).render(job),
  publish: (states) => broadcast(windows, 'thumbs:ready', states),
});

registerSchemePrivileges();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = windows()[0];
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });
  void app.whenReady().then(start);
}

async function start(): Promise<void> {
  log.info('app', `Tessera ${app.getVersion()} starting`, { platform, userData: dataDir });
  const s = await settings.load();
  nativeTheme.themeSource = s.theme;
  settings.onChange((next) => {
    nativeTheme.themeSource = next.theme;
    broadcast(windows, 'settings:changed', next);
  });
  registerHandlers();
  handleProtocol({
    packDir: (id) => {
      const state = library.getState();
      const folder = state.status === 'ready' ? library.require().index.known(id)?.folder : undefined;
      return state.status === 'ready' && folder ? join(state.library.path, DIRS.packs, folder) : null;
    },
    thumbDir,
  });
  if (s.libraryPath) void library.open(s.libraryPath);
  await createWindow();
  app.on('activate', () => {
    if (appWindows.size === 0) void createWindow();
  });
}

function registerHandlers(): void {
  handle('app:info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform,
    versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
  }));
  handle('settings:get', () => settings.get());
  handle('settings:update', (patch) => settings.update(patch));
  handle('window:chrome', ({ background, foreground }) => {
    if (platform === 'darwin') return;
    for (const w of windows()) w.setTitleBarOverlay({ color: background, symbolColor: foreground, height: 64 });
  });

  handle('dialog:folder', async (title) => {
    const win = BrowserWindow.getFocusedWindow() ?? windows()[0];
    const options = { title, properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[] };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  handle('library:state', () => library.getState());
  handle('library:inspect', (path) => library.inspect(path));
  handle('library:create', async (path, name) => {
    const state = await library.create(path, name);
    if (state.status === 'ready') await settings.update({ libraryPath: path });
    return state;
  });
  handle('library:open', async (path) => {
    const state = await library.open(path);
    if (state.status === 'ready') await settings.update({ libraryPath: path });
    return state;
  });
  handle('library:close', async () => {
    library.close();
    await settings.update({ libraryPath: null });
  });
  handle('library:refresh', () => library.sync());
  handle('library:stats', () => library.require().queries.stats());
  handle('library:terms', (field) => library.require().queries.terms(field));

  handle('browse:assets', (q, sort, offset, limit) => library.require().queries.assets(q, sort, offset, Math.min(limit, 1000)));
  handle('browse:packs', (q, sort, offset, limit) => library.require().queries.packs(q, sort, offset, Math.min(limit, 1000)));
  handle('browse:facets', (q, mode) => library.require().queries.facets(q, mode));

  handle('pack:get', (id) => library.require().queries.pack(id));
  handle('pack:files', (id) => library.require().queries.packFiles(id));
  handle('pack:edit', (id, edit) => library.editPack(id, edit));
  handle('pack:detect', (id) => library.detect(id));
  handle('pack:status', (id, status) => library.setStatus(id, status));
  handle('pack:proof', async (id) => (await library.proofFiles(id)).map((f) => ({ ...f, url: packFileUrl(id, `licence/${f.name}`) })));
  handle('pack:addProof', async (id) => {
    const win = BrowserWindow.getFocusedWindow() ?? windows()[0];
    const options = { title: 'Add licence proof', properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[] };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled ? 0 : library.addProof(id, result.filePaths);
  });
  handle('pack:openProof', async (id, name) => {
    const error = await shell.openPath(await library.proofPath(id, name));
    if (error) throw new UserError('open-failed', error);
  });
  handle('asset:get', (id) => library.require().queries.asset(id));
  handle('asset:variants', (id) => library.require().queries.variants(id));
  handle('pack:textures', (id) => {
    const out: Record<string, string> = {};
    for (const img of library.require().queries.packImages(id)) out[img.name.toLowerCase()] ??= packFileUrl(id, img.ref);
    return out;
  });
  handle('pack:reveal', async (id, ref) => {
    const pack = await library.packRecord(id);
    // A file inside an archive can't be shown; the archive holding it can.
    const onDisk = ref ? parseRef(ref).file : null;
    shell.showItemInFolder(onDisk ? join(pack.dir, ...onDisk.split('/')) : join(pack.dir, 'pack.json'));
  });

  handle('jobs:list', () => jobs.list());
  handle('thumbs:get', (ids) => thumbs.get(ids.slice(0, 500)));
}

async function createWindow(): Promise<void> {
  const saved = await loadWindowState(dataDir);
  const win = new BrowserWindow({
    ...defaultSize(),
    ...(saved ?? {}),
    minWidth: 880,
    minHeight: 560,
    show: false,
    title: 'Tessera',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111418' : '#f7f9fc',
    // The app bar is the title bar: macOS keeps its traffic lights inset in it, Windows and Linux
    // draw their window buttons over its right end.
    titleBarStyle: 'hidden',
    ...(platform === 'darwin'
      ? { trafficLightPosition: { x: 20, y: 22 } }
      : { titleBarOverlay: { color: '#00000000', symbolColor: '#888888', height: 64 } }),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  appWindows.add(win);
  win.on('closed', () => {
    appWindows.delete(win);
    if (appWindows.size === 0 && platform !== 'darwin') app.quit();
  });
  if (saved?.maximized) win.maximize();
  trackWindowState(win, dataDir);
  win.once('ready-to-show', () => win.show());

  // Links open in the browser; the window itself never navigates away from the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });

  if (process.env.ELECTRON_RENDERER_URL) await win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
}

app.on('window-all-closed', () => {
  if (platform !== 'darwin') app.quit();
});
app.on('before-quit', () => renderWindow?.close());
