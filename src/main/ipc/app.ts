/**
 * The app itself: what it is, its settings, folders, documents, updates, problem reports
 * and the work it has in hand.
 *
 * Every handler here answers one channel of the contract in src/shared/ipc.ts. What it needs is
 * given to it; nothing in this file reaches for a service of its own.
 */
import { BrowserWindow, app, dialog, shell } from 'electron';
import { basename, join, sep } from 'node:path';
import { stat, writeFile } from 'node:fs/promises';
import { UserError, handle } from '../ipc';
import { describeFolder } from '../library/locate';
import type { Settings } from '@shared/types';
import type { IpcContext } from './context';

type Deps = Pick<IpcContext, 'activity' | 'dataDir' | 'jobs' | 'platform' | 'readDocument' | 'reports' | 'settings' | 'updates' | 'windows'>;

export function registerAppIpc(c: Deps): void {
  const { activity, dataDir, jobs, platform, readDocument, reports, settings, updates, windows } = c;
  handle('app:info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform,
    versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
  }));
  handle('settings:get', () => settings.get());
  handle('settings:update', (patch) => {
    // Backups change only through their own calls.
    const { libraries: _l, ...rest } = patch as Partial<Settings>;
    return settings.update(rest);
  });
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
  handle('app:showLogs', () => void shell.openPath(join(dataDir, 'logs')));

  handle('fs:files', async (paths) => {
    const out: { path: string; name: string; size: number; isFolder: boolean }[] = [];
    for (const path of paths) {
      const s = await stat(path).catch(() => null);
      if (!s) continue;
      out.push({ path, name: basename(path), size: s.isDirectory() ? 0 : s.size, isFolder: s.isDirectory() });
    }
    return out;
  });

  handle('jobs:list', () => jobs.list());

  handle('dialog:file', async (title) => {
    const win = BrowserWindow.getFocusedWindow() ?? windows()[0];
    const options: Electron.OpenDialogOptions = { title, message: title, properties: ['openFile', 'showHiddenFiles'] };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  handle('fs:reveal', (path) => shell.showItemInFolder(path));
  handle('app:openExternal', (url) => {
    // Only the local sign-in pages rclone serves, and the web.
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  });
  handle('activity:list', (limit) => activity.list(limit ?? 20));
  handle('updates:status', () => updates.get());
  handle('updates:check', () => updates.check());
  handle('app:document', (name) => readDocument(name));
  handle('updates:download', () => updates.download());
  handle('updates:openInstaller', () => {
    const file = updates.get().installer;
    if (!file) throw new UserError('no-installer', 'There is no installer to open yet.');
    shell.showItemInFolder(file);
  });

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
