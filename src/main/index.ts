import { app, BrowserWindow, crashReporter, dialog, nativeTheme, net, session, shell, systemPreferences } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { release, tmpdir } from 'node:os';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { basename, join, sep } from 'node:path';
import type { DownloadItem, LibrarySummary, Platform, Settings } from '@shared/types';
import { byRecent, patchRecord, recordOf, touchLibrary } from './libraries';
import { broadcast, onInternalError, UserError } from './ipc';
import { registerIpc, type IpcContext } from './ipc/index';
import { parseRef } from './index/files';
import { Jobs, type JobHandle } from './jobs';
import { DIRS, readLibraryInfo } from './library/layout';
import { describeFolder, locateLibrary } from './library/locate';
import { bundledTool, installTool } from './tools/install';
import { backupPlaces, findBackups, RestoreService, storeAt } from './backup/restore';
import { RcloneAuth } from './backup/rclone';
import { hostKeys, keyFileNeedsPassphrase } from './backup/ssh';
import { describeTarget, providerInfo, type StorageTarget } from '@shared/storage';
import { generatePassword, saveToKeychain } from './backup/password';
import { writeRecoveryKit } from './backup/kit';
import { findTool } from './tools/find';
import { applySystemProxy } from './tools/proxy';
import { LibraryService } from './libraryService';
import { BackupService, findKopia } from './backup/service';
import { registerDrag } from './drag';
import { installMenu } from './menu';
import { fileSecret, keychainAvailable } from './secrets';
import { archivePage, snapshotPage } from './import/pageRecord';
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
import { Activity } from './activity';
import { TOOL_GROUPS } from '@shared/mcp';
import { McpService, catalogue, portFree } from './mcp/server';
import { McpHistory } from './mcp/history';
import { clients, installFor } from './mcp/clients';
import { freePort, whoHasPort } from './mcp/port';
import { skillMarkdown } from './mcp/skill';
import { Updates } from './updates';
import { DownloadService, linksInFiles } from './downloads/service';
import { linksIn } from '@shared/links';
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
let activityVersion = 0;
const activity = new Activity(
  dataDir,
  () => {
    const state = library.getState();
    return state.status === 'ready' ? state.library.id : null;
  },
  () => broadcast(windows, 'activity:changed', ++activityVersion),
);
const downloads = new DownloadService({
  dir: join(dataDir, 'downloads'),
  fetch: (url, init) => net.fetch(url, init),
  atOnce: () => settings.get().downloadsAtOnce,
  onChanged: () => broadcast(windows, 'downloads:changed', downloads.list()),
  onReady: (item) => void addDownloaded(item),
});
const updates = new Updates({
  version: app.getVersion(),
  dir: join(dataDir, 'updates'),
  platform: process.platform,
  auto: () => settings.get().autoInstallUpdates,
  feed: process.env.TESSERA_UPDATE_FEED || __TESSERA_UPDATE_FEED__,
  fetch: (url, init) => net.fetch(url, init),
  onChanged: () => broadcast(windows, 'updates:changed', updates.get()),
});
let indexVersion = 0;
const library = new LibraryService({
  dataDir,
  jobs,
  siteRules: () => settings.get().siteRules,
  binKeepDays: () => settings.get().binKeepDays,
  onState: (state) => {
    broadcast(windows, 'library:changed', state);
    if (state.status === 'ready') {
      // Note the library (name, folder, when) before anything reads its settings.
      void touchLibrary(settings, dataDir, state.library)
        .catch((e: unknown) => log.warn('library', 'could not note the library', e))
        .finally(() => {
          backups.libraryOpened();
          librariesChanged();
          sync.reconcileSoon();
        });
    } else if (state.status === 'none') {
      backups.libraryOpened();
      sync.reconcileSoon();
    }
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
const mcpHistory = new McpHistory(dataDir);
const mcp = new McpService({
  settings: () => settings.get().mcp,
  context: () => ({
    library,
    projects,
    downloads,
    copySource,
    libraryId,
    note: (text, detail) => activity.add('agent', text, detail),
    settings: () => settings.get(),
    app: {
      libraries: () => librarySummaries(),
      openLibrary: (path) => library.open(path),
      createLibrary: (path, name) => library.create(path, name),
      closeLibrary: async () => {
        library.close();
        await settings.update({ libraryPath: null });
      },
      updateSettings: (patch) => settings.update(patch),
      activity: (limit) => activity.list(limit),
      backUpNow: async () => {
        const done = await backups.backupNow();
        activity.add('backup', 'Backed up this library');
        return done;
      },
      reindex: () => library.reindex(),
    },
  }),
  onChange: () => broadcast(windows, 'mcp:changed', 0),
  onCall: (entry) => {
    mcpHistory.add(entry);
    broadcast(windows, 'mcp:changed', 0);
  },
  onFirstCall: (tool) => {
    log.info('mcp', `an agent called ${tool}`);
    broadcast(windows, 'mcp:changed', 0);
  },
});
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
  secrets: (libraryId) => fileSecret(join(dataDir, 'libraries', libraryId, 'backup', 'password.bin'), () => settings.get().backupPasswordInFile),
  keychain: keychainAvailable,
  jobs,
  library: () => {
    const state = library.getState();
    return state.status === 'ready' ? state.library : null;
  },
  isLibrary: async (path, id) => (await library.inspect(path).catch(() => null)) === 'library' && (await readLibraryInfo(path).catch(() => null))?.id === id,
  rclone: rcloneSetup,
  onChange: () => broadcast(windows, 'backup:changed', ++backupVersion),
});
/** A known library's name, by id. */
const libraryNameOf = (id: string) => recordOf(settings, id)?.name ?? null;

/** The open library's record (its own settings), or null. */
/**
 * A download finished. Unless the library is set to leave them to the user, it is added like any
 * other pack: what the pack says (and any rule for its site) decides whether it waits in Review.
 */
async function addDownloaded(item: DownloadItem): Promise<void> {
  const record = openRecord();
  const after = settings.get().afterDownload;
  // "Leave it to me": the row waits in Downloads with an Add button.
  if (!record || after === 'ask' || !item.file) return;
  try {
    const planned = await library.planImport([item.file], 'auto');
    const already = planned.find((i) => i.duplicateOf);
    if (already) {
      downloads.done(item.id, already.duplicateOf);
      return;
    }
    const straightIn = after === 'add' && record.skipInboxWhenSure;
    const result = await library.import(planned.map((i) => ({ ...i, url: item.url })), straightIn, false);
    const made = result.added[0];
    downloads.done(item.id, made?.name ?? null);
    if (made) activity.add('downloaded', `Downloaded “${made.name}” from ${item.host}`, made.status === 'inbox' ? 'Waiting in Review for a licence' : undefined);
  } catch (e) {
    log.error('downloads', `could not add ${item.name}`, e);
  }
}

const DOCUMENTS = { licence: 'LICENSE', changelog: 'CHANGELOG.md', privacy: 'PRIVACY.md' } as const;

/** One of Tessera's own documents: beside the packaged app, or in the project while developing. */
async function readDocument(name: keyof typeof DOCUMENTS): Promise<string> {
  const file = DOCUMENTS[name];
  for (const place of [join(process.resourcesPath, file), join(app.getAppPath(), file), join(app.getAppPath(), '..', file)]) {
    const text = await readFile(place, 'utf8').catch(() => null);
    if (text) return text;
  }
  throw new UserError('no-document', `${file} isn’t in this build.`);
}

function openRecord() {
  const state = library.getState();
  return state.status === 'ready' ? recordOf(settings, state.library.id) : null;
}
let librariesVersion = 0;
const librariesChanged = () => broadcast(windows, 'libraries:changed', ++librariesVersion);

/** Every known library, as the switcher and welcome screen list them. */
async function librarySummaries(): Promise<LibrarySummary[]> {
  const state = library.getState();
  const openId = state.status === 'ready' ? state.library.id : null;
  return Promise.all(
    byRecent(settings.get().libraries).map(async (r) => {
      const info = await readLibraryInfo(r.path).catch(() => null);
      return {
        id: r.id,
        name: r.name,
        path: r.path,
        lastOpenedAt: r.lastOpenedAt,
        open: r.id === openId,
        found: !!info && (info.id === r.id || r.id.startsWith('unread-')),
        backup: { on: !!r.backup, lastBackupAt: r.backup?.lastBackupAt ?? null, failing: !!r.backup?.lastError },
        sync: { on: r.sync.enabled, whileClosed: r.sync.whileClosed },
      };
    }),
  );
}
const restorer = new RestoreService(dataDir, () => findKopia(dataDir), rcloneSetup);
let projectsVersion = 0;
const projectsChanged = () => broadcast(windows, 'projects:changed', ++projectsVersion);

let pageRecords: Promise<void> = Promise.resolve();

/**
 * Keep a record of a pack's download page: a PDF snapshot with its licence proof, and a public
 * copy on archive.org, as asked. Either can fail on its own; the job says what happened.
 */
async function recordPage(id: string, what: { snapshot: boolean; archive: boolean }): Promise<void> {
  const row = library.getState().status === 'ready' ? library.require().queries.pack(id) : null;
  const url = row?.meta.source.url;
  if (!row || !url || !/^https?:\/\//i.test(url) || (!what.snapshot && !what.archive)) return;
  await jobs.run(`Saving the page of “${row.meta.name}”`, async (job) => {
    const done: string[] = [];
    const problems: string[] = [];
    const today = new Date().toISOString().slice(0, 10);
    if (what.snapshot) {
      job.update(null, 'Saving a snapshot of the page');
      try {
        await library.saveProof(id, `Download page ${today}.pdf`, await snapshotPage(url), `Download page saved on ${today}: ${url}`);
        done.push('snapshot saved');
      } catch (e) {
        problems.push(`Snapshot: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (what.archive) {
      job.update(what.snapshot ? 0.5 : null, 'Asking archive.org to keep a copy');
      try {
        const copy = await archivePage(url);
        await library.addLicenceNote(id, `${copy.fresh ? 'Archived' : 'Earlier archived copy'}: ${copy.url}`);
        done.push(copy.fresh ? 'archived' : 'earlier archive found');
      } catch (e) {
        problems.push(`archive.org: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (!done.length) throw new Error(problems.join(' · '));
    job.update(1, [done.join(', '), ...problems].join(' · '));
  });
}

/** What copying into projects reads from the open library. */
function copySource(): CopySource {
  const state = library.getState();
  if (state.status !== 'ready') throw new UserError('no-library', 'No library is open.');
  const { queries, index } = library.require();
  return {
    libraryId: state.library.id,
    libraryName: state.library.name,
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
  registerIpc(context());
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
  await downloads.load();
  updates.startSchedule(() => settings.get().updateCheck);
  if (s.libraryPath) void library.open(s.libraryPath);
  backups.startSchedule();
  // Libraries that sync while not open start syncing even before one is opened.
  sync.reconcileSoon();
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
  await mcp.apply();
  await createWindow();
  app.on('activate', () => {
    if (appWindows.size === 0) void createWindow();
  });
}

/** Everything the handlers are given: the app, put together once, in one place. */
function context(): IpcContext {
  return {
    dataDir,
    platform,
    windows,
    settings,
    library,
    projects,
    downloads,
    thumbs,
    backups,
    restorer,
    rcloneAuth,
    sync,
    updates,
    reports,
    activity,
    jobs,
    mcp,
    mcpHistory,
    indexChanged: () => broadcast(windows, 'index:changed', ++indexVersion),
    librariesChanged,
    projectsChanged,
    backupChanged: () => broadcast(windows, 'backup:changed', ++backupVersion),
    syncChanged: () => broadcast(windows, 'sync:changed', ++syncVersion),
    libraryId,
    libraryNameOf,
    librarySummaries,
    copySource,
    openRecord,
    thumbDir,
    readDocument,
    recordPage: (id, what) => {
      // One at a time, and never in the way of the answer to the window.
      pageRecords = pageRecords.then(() => recordPage(id, what)).catch((e: unknown) => log.warn('pages', 'could not keep a record of a download page', e));
    },
    start,
  };
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
  updates.stop();
  downloads.stopAll();
  reports.dispose();
  renderWindow?.close();
  sync.shutdown();
});
