import { app, BrowserWindow, crashReporter, dialog, nativeTheme, net, session, shell } from 'electron';
import { writeFile } from 'node:fs/promises';
import { release, tmpdir } from 'node:os';
import { readdir, rm, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import type { Platform } from '@shared/types';
import { broadcast, handle, onInternalError, UserError } from './ipc';
import { parseRef } from './index/files';
import { Jobs } from './jobs';
import { DIRS, readLibraryInfo } from './library/layout';
import { describeFolder, locateLibrary } from './library/locate';
import { bundledTool, installTool } from './tools/install';
import { backupPlaces, findBackups, RestoreService, storeAt } from './backup/restore';
import { RcloneAuth } from './backup/rclone';
import { hostKeys } from './backup/storage';
import { providerInfo } from '@shared/storage';
import { findTool } from './tools/find';
import { applySystemProxy } from './tools/proxy';
import { LibraryService } from './libraryService';
import { BackupService, findKopia } from './backup/service';
import { registerDrag } from './drag';
import { installMenu } from './menu';
import { fileSecret } from './secrets';
import { SyncService } from './sync/service';
import { initLog, log } from './log';
import { makeScrubber } from './reports/scrub';
import { parseDsn } from './reports/sentry';
import { ReportService } from './reports/service';
import { handleProtocol, registerSchemePrivileges } from './protocol';
import { packFileUrl } from '@shared/urls';
import { ProjectService } from './projects/service';
import type { CopySource } from './projects/copy';
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
// Native crashes leave a dump on this computer; nothing is uploaded unless the user agrees later.
crashReporter.start({ uploadToServer: false, compress: true });
const settings = new SettingsStore(dataDir);
/** The app's own windows; the hidden render window isn't one of them. */
const appWindows = new Set<BrowserWindow>();
const windows = () => [...appWindows];

const OS_NAMES: Record<Platform, string> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };
let reportsVersion = 0;
const reports = new ReportService({
  logsDir: join(dataDir, 'logs'),
  crashDir: (() => {
    try {
      return app.getPath('crashDumps');
    } catch {
      return null;
    }
  })(),
  settings,
  scrub: () => {
    const state = library.getState();
    return makeScrubber({ app: app.getAppPath(), home: app.getPath('home'), data: dataDir, temp: tmpdir(), library: state.status === 'ready' ? state.library.path : null });
  },
  env: {
    release: `tessera@${app.getVersion()}`,
    environment: app.isPackaged ? 'production' : 'development',
    os: { name: OS_NAMES[platform], version: release(), arch: process.arch },
    runtime: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
  },
  // Development and test runs can point at a service without a rebuild.
  dsn: parseDsn(process.env.TESSERA_REPORTS_DSN || __TESSERA_REPORTS_DSN__),
  fetch: (url, init) => net.fetch(url, init),
  onAsk: () => broadcast(windows, 'reports:ask', ++reportsVersion),
  onChange: () => broadcast(windows, 'reports:changed', ++reportsVersion),
});

/** An error in the main process nobody caught: keep it, and say so in the window. */
function caught(kind: 'exception' | 'rejection', e: unknown): void {
  const err = e instanceof Error ? e : new Error(String(e));
  log.error('app', kind === 'exception' ? 'uncaught exception' : 'unhandled rejection', err);
  try {
    const record = reports.record({ source: 'main', kind, name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) });
    broadcast(windows, 'reports:caught', { title: 'Something went wrong in the background', details: `${record.name}: ${record.message}` });
  } catch (inner) {
    log.error('app', 'could not record an error', inner);
  }
}
process.on('uncaughtException', (e) => caught('exception', e));
process.on('unhandledRejection', (e) => caught('rejection', e));
onInternalError((channel, e) => {
  const err = e instanceof Error ? e : new Error(String(e));
  reports.record({ source: 'main', kind: 'ipc', name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}), context: { channel } });
});
const jobs = new Jobs((list) => broadcast(windows, 'jobs:changed', list));
let indexVersion = 0;
const library = new LibraryService({
  dataDir,
  jobs,
  onState: (state) => {
    broadcast(windows, 'library:changed', state);
    // A library that syncs picks up where it left off.
    if (state.status === 'ready') void sync.resume();
  },
  onIndexChanged: () => {
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

const projects = new ProjectService(dataDir, jobs);
/** rclone, for cloud drives: installed on the system or downloaded by Tessera, with Tessera's own config. */
const findRclone = () => findTool('rclone', [bundledTool(dataDir, 'rclone')]);
const rcloneConfig = join(dataDir, 'rclone', 'rclone.conf');
function rcloneSetup() {
  return { exe: findRclone(), config: rcloneConfig };
}
const rcloneAuth = new RcloneAuth(findRclone, rcloneConfig);
let backupVersion = 0;
const backups = new BackupService({
  dataDir,
  settings,
  secrets: fileSecret(join(dataDir, 'kopia-password.bin')),
  jobs,
  libraryPath: () => {
    const state = library.getState();
    return state.status === 'ready' ? state.library.path : null;
  },
  libraryName: () => {
    const state = library.getState();
    return state.status === 'ready' ? state.library.name : null;
  },
  rclone: rcloneSetup,
  onChange: () => broadcast(windows, 'backup:changed', ++backupVersion),
});
const restorer = new RestoreService(dataDir, () => findKopia(dataDir), rcloneSetup);
let projectsVersion = 0;
const projectsChanged = () => broadcast(windows, 'projects:changed', ++projectsVersion);

/** What copying into projects reads from the open library. */
function copySource(): CopySource {
  const state = library.getState();
  if (state.status !== 'ready') throw new UserError('no-library', 'No library is open.');
  const { queries, index } = library.require();
  return {
    libraryId: state.library.id,
    packDir: (id) => join(state.library.path, DIRS.packs, index.known(id)?.folder ?? ''),
    pack: (id) => {
      const row = queries.pack(id);
      return row ? { meta: row.meta, folder: row.folder } : null;
    },
    variants: (packId, ref) => queries.variantsOf(packId, ref),
    packRefs: (packId) => queries.packRefs(packId),
  };
}
const libraryId = () => {
  const state = library.getState();
  if (state.status !== 'ready') throw new UserError('no-library', 'No library is open.');
  return state.library.id;
};

let syncVersion = 0;
const sync = new SyncService({
  dataDir,
  settings,
  library: () => {
    const state = library.getState();
    return state.status === 'ready' ? state.library : null;
  },
  onChange: () => broadcast(windows, 'sync:changed', ++syncVersion),
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
  void applySystemProxy((url) => session.defaultSession.resolveProxy(url)).then((p) => p && log.info('app', 'using the system proxy for helper programs'));
  installMenu(() => BrowserWindow.getFocusedWindow() ?? windows()[0], join(dataDir, 'logs'));
  registerDrag({
    cacheDir: () => {
      const state = library.getState();
      return state.status === 'ready' ? join(dataDir, 'libraries', state.library.id, 'drag') : null;
    },
    packDir: (id) => {
      const state = library.getState();
      const folder = state.status === 'ready' ? library.require().index.known(id)?.folder : undefined;
      return state.status === 'ready' && folder ? join(state.library.path, DIRS.packs, folder) : null;
    },
  });
  handleProtocol({
    packDir: (id) => {
      const state = library.getState();
      const folder = state.status === 'ready' ? library.require().index.known(id)?.folder : undefined;
      return state.status === 'ready' && folder ? join(state.library.path, DIRS.packs, folder) : null;
    },
    thumbDir,
  });
  if (s.libraryPath) void library.open(s.libraryPath);
  backups.startSchedule();
  await reports.scanCrashes();
  app.on('render-process-gone', (_e, contents, details) => {
    if (details.reason === 'clean-exit') return;
    const win = BrowserWindow.fromWebContents(contents);
    const mine = !!win && appWindows.has(win);
    log.error('app', `${mine ? 'window' : 'render window'} process gone`, details);
    reports.record({ source: 'process', kind: 'crash', name: 'RenderProcessGone', message: `${mine ? 'The window' : 'The thumbnail renderer'} stopped: ${details.reason} (exit ${details.exitCode})` });
    // The window comes back by itself, and says what happened when it does.
    if (mine && !win.isDestroyed()) {
      reports.windowRecovered();
      setTimeout(() => !win.isDestroyed() && win.reload(), 500);
    }
  });
  app.on('child-process-gone', (_e, details) => {
    if (details.reason === 'clean-exit' || details.reason === 'killed') return;
    log.error('app', `${details.type} process gone`, details);
    reports.record({ source: 'process', kind: 'crash', name: `${details.type}ProcessGone`, message: `The ${details.type} process stopped: ${details.reason} (exit ${details.exitCode})`, ...(details.name ? { context: { process: details.name } } : {}) });
  });
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

  handle('dialog:folder', async (title, extra = {}) => {
    const win = BrowserWindow.getFocusedWindow() ?? windows()[0];
    const options: Electron.OpenDialogOptions = {
      title,
      message: extra.message ?? title,
      ...(extra.defaultPath ? { defaultPath: extra.defaultPath } : {}),
      ...(extra.buttonLabel ? { buttonLabel: extra.buttonLabel } : {}),
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  handle('fs:places', () => ({ documents: app.getPath('documents'), home: app.getPath('home'), desktop: app.getPath('desktop'), separator: sep }));
  handle('fs:describe', (path) => describeFolder(path));
  handle('library:locate', (path) => locateLibrary(path));
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
  handle('library:health', () => library.require().queries.health());
  handle('library:reindex', () => library.reindex());
  handle('thumbs:size', async () => {
    const dir = thumbDir();
    if (!dir) return 0;
    let total = 0;
    for (const f of await readdir(dir).catch(() => [] as string[])) total += (await stat(join(dir, f)).catch(() => null))?.size ?? 0;
    return total;
  });
  handle('thumbs:clear', async () => {
    const dir = thumbDir();
    if (dir) await rm(dir, { recursive: true, force: true });
    thumbs.reset();
    broadcast(windows, 'index:changed', ++indexVersion);
  });
  handle('app:showLogs', () => void shell.openPath(join(dataDir, 'logs')));

  handle('browse:assets', (q, sort, offset, limit) => library.require().queries.assets(q, sort, offset, Math.min(limit, 1000)));
  handle('browse:packs', (q, sort, offset, limit) => library.require().queries.packs(q, sort, offset, Math.min(limit, 1000)));
  handle('browse:facets', (q, mode) => library.require().queries.facets(q, mode));

  handle('pack:get', (id) => library.require().queries.pack(id));
  handle('pack:files', (id) => library.require().queries.packFiles(id));
  handle('pack:edit', async (id, edit) => {
    await library.editPack(id, edit);
    // Projects keep the pack's licence and credit line on record: bring them up to date.
    const row = library.require().queries.pack(id);
    if (row) {
      const m = row.meta;
      await projects
        .packChanged(libraryId(), id, { packName: m.name, licence: m.licence.id, attribution: m.licence.attribution, creator: m.source.creator, sourceUrl: m.source.url })
        .catch((e: unknown) => log.warn('projects', 'could not update projects after a pack edit', e));
    }
  });
  handle('pack:detect', (id) => library.detect(id));
  handle('pack:status', (id, status) => library.setStatus(id, status));
  handle('pack:remove', (id) => library.removePack(id, (path) => shell.trashItem(path)));
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
  handle('assets:refs', (ids) => library.require().queries.refs(ids.slice(0, 10_000)));
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

  handle('collections:list', () => library.collections());
  handle('collections:create', (name, init) => library.createCollection(name, init));
  handle('collections:change', (id, change) => library.changeCollection(id, change));

  handle('projects:list', () => projects.list(libraryId()));
  handle('projects:choose', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? windows()[0];
    const options: Electron.OpenDialogOptions = { title: 'Choose a game project', buttonLabel: 'Choose', properties: ['openDirectory'] };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled || !result.filePaths[0] ? null : projects.probe(result.filePaths[0]);
  });
  handle('projects:probe', (path) => projects.probe(path));
  handle('projects:add', async (probe) => {
    const project = await projects.add(probe);
    if (!settings.get().activeProjectId) await settings.update({ activeProjectId: project.id });
    projectsChanged();
    return project;
  });
  handle('projects:update', async (id, patch) => {
    await projects.update(id, patch);
    projectsChanged();
  });
  handle('projects:unlink', async (id) => {
    await projects.unlink(id);
    if (settings.get().activeProjectId === id) await settings.update({ activeProjectId: null });
    projectsChanged();
  });
  handle('projects:entries', (id) => projects.entries(id, libraryId()));
  handle('projects:plan', (id, items) => projects.plan(id, items, copySource()));
  handle('projects:copy', async (id, items) => {
    const n = await projects.copy(id, items, copySource());
    projectsChanged();
    return n;
  });
  handle('projects:remove', async (id, items) => {
    const n = await projects.remove(id, items, libraryId());
    projectsChanged();
    return n;
  });
  handle('projects:reveal', async (id, rel) => {
    const project = await projects.get(id);
    if (rel && !rel.split('/').includes('..')) shell.showItemInFolder(join(project.path, ...rel.split('/')));
    else void shell.openPath(project.path);
  });

  handle('backup:status', () => backups.status());
  handle('backup:chooseFolder', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? windows()[0];
    const options: Electron.OpenDialogOptions = { title: 'Choose where to keep backups', buttonLabel: 'Choose', properties: ['openDirectory', 'createDirectory'] };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  handle('backup:setup', (target, password, create) => backups.setup(target, password, create));
  handle('backup:signIn', (provider) => rcloneAuth.signIn(providerInfo(provider), (url) => broadcast(windows, 'backup:signInUrl', url)));
  handle('backup:cancelSignIn', () => rcloneAuth.cancel());
  handle('backup:hostKey', (host, port) => hostKeys(host, port));
  handle('dialog:file', async (title) => {
    const win = BrowserWindow.getFocusedWindow() ?? windows()[0];
    const options: Electron.OpenDialogOptions = { title, message: title, properties: ['openFile', 'showHiddenFiles'] };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  handle('app:openExternal', (url) => {
    // Only the local sign-in pages rclone serves, and the web.
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  });
  handle('backup:now', () => backups.backupNow());
  handle('backup:snapshots', () => backups.snapshots());
  handle('backup:restore', async (id) => {
    const win = BrowserWindow.getFocusedWindow() ?? windows()[0];
    const options: Electron.OpenDialogOptions = { title: 'Restore into…', buttonLabel: 'Restore here', properties: ['openDirectory', 'createDirectory'] };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    const target = result.canceled ? null : (result.filePaths[0] ?? null);
    if (!target) return null;
    await backups.restore(id, target);
    return target;
  });
  handle('backup:turnOff', () => backups.turnOff());

  handle('restore:places', () => backupPlaces());
  handle('restore:find', async () => findBackups(await backupPlaces()));
  handle('restore:storeAt', (path) => storeAt(path));
  handle('restore:unlock', (target, password) => restorer.unlock(target, password));
  handle('restore:run', (id, target, size) =>
    jobs.run('Restoring a library', (job) =>
      restorer.restore(
        id,
        target,
        size,
        (f) => {
          job.update(f, 'Putting the files back');
          broadcast(windows, 'restore:progress', f);
        },
        async () => {
          // Libraries this computer knows, to keep a restored copy from sharing an id with its original.
          const known: { id: string; path: string }[] = [];
          for (const path of settings.get().recentLibraries) {
            const kind = await library.inspect(path).catch(() => null);
            if (kind === 'library') known.push({ id: (await readLibraryInfo(path)).id, path });
          }
          return known;
        },
      ),
    ),
  );
  handle('restore:keepBackingUp', async () => {
    const opened = restorer.opened;
    if (!opened) throw new UserError('restore-locked', 'Open the backup first.');
    await restorer.close();
    await backups.setup(opened.target, opened.password, false);
  });
  handle('restore:close', () => restorer.close());

  handle('sync:status', () => sync.status());
  handle('sync:enable', (mode) => sync.enable(mode));
  handle('sync:setMode', (mode) => sync.setMode(mode));
  handle('sync:disable', () => sync.disable());
  handle('sync:addDevice', (id, name) => sync.addDevice(id, name));
  handle('sync:removeDevice', (id) => sync.removeDevice(id));
  handle('sync:receive', () => sync.startForReceiving());
  handle('sync:acceptFolder', (folderId, offeredBy, label, path, mode) => sync.acceptFolder(folderId, offeredBy, label, path, mode));
  handle('sync:folderProgress', (folderId) => sync.folderProgress(folderId));
  handle('tools:install', async (tool) => {
    const version = await installTool(tool, dataDir, (url, init) => net.fetch(url, init), (p) => broadcast(windows, 'tools:installProgress', { tool, ...p }));
    broadcast(windows, tool === 'syncthing' ? 'sync:changed' : 'backup:changed', tool === 'syncthing' ? ++syncVersion : ++backupVersion);
    return version;
  });
  handle('tools:packageManagers', () => ['brew', 'winget', 'apt', 'dnf', 'pacman', 'zypper', 'flatpak', 'snap'].filter((tool) => !!findTool(tool)));

  handle('import:choose', async (what) => {
    const win = BrowserWindow.getFocusedWindow() ?? windows()[0];
    const options: Electron.OpenDialogOptions =
      what === 'files'
        ? { title: 'Add packs', buttonLabel: 'Add', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Downloads and assets', extensions: ['*'] }] }
        : { title: what === 'folder' ? 'Add a folder as one pack' : 'Add a folder of packs', buttonLabel: 'Add', properties: ['openDirectory', 'multiSelections'] };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled || !result.filePaths.length ? null : result.filePaths;
  });
  handle('import:plan', (paths, eachInside) => library.planImport(paths, eachInside));
  handle('import:run', (items) => library.import(items, settings.get().skipInboxWhenSure));
  handle('thumbs:get', (keys) => thumbs.get(keys.slice(0, 500)));

  handle('reports:capture', (input) => void reports.record({ ...input, source: 'window' }));
  handle('reports:status', () => reports.status());
  handle('reports:pending', () => reports.pending());
  handle('reports:preview', () => reports.preview());
  handle('reports:respond', (answer) => reports.respond(answer));
  handle('reports:crashes', (send) => reports.answerCrashes(send));
  handle('reports:problem', (note) => reports.problemReport(note));
  handle('reports:saveProblem', async (note) => {
    const win = BrowserWindow.getFocusedWindow() ?? windows()[0];
    const options: Electron.SaveDialogOptions = { title: 'Save problem report', defaultPath: join(app.getPath('desktop'), `tessera-report-${new Date().toISOString().slice(0, 10)}.txt`), filters: [{ name: 'Text', extensions: ['txt'] }] };
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    await writeFile(result.filePath, await reports.problemReport(note));
    return result.filePath;
  });
  handle('reports:sendProblem', (note) => reports.sendProblem(note));
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
app.on('before-quit', () => {
  reports.dispose();
  renderWindow?.close();
  sync.shutdown();
});
