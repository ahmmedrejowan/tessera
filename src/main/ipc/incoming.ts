/**
 * Things coming in: files and folders chosen here, and links fetched from the web.
 *
 * Every handler here answers one channel of the contract in src/shared/ipc.ts. What it needs is
 * given to it; nothing in this file reaches for a service of its own.
 */
import { BrowserWindow, app, dialog } from 'electron';
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { linksIn } from '@shared/links';
import { linksInFiles } from '../downloads/service';
import { UserError, handle } from '../ipc';
import type { IpcContext } from './context';

type Deps = Pick<IpcContext, 'activity' | 'downloads' | 'library' | 'openRecord' | 'windows'>;

export function registerIncomingIpc(c: Deps): void {
  const { activity, downloads, library, openRecord, windows } = c;
  handle('import:samples', async () => {
    const dir = app.isPackaged ? join(process.resourcesPath, 'samples') : join(app.getAppPath(), 'resources', 'samples');
    const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.zip')).sort();
    if (!files.length) throw new UserError('no-samples', 'The sample packs aren’t in this copy of Tessera.');
    return files.map((f) => join(dir, f));
  });
  handle('import:choose', async (what) => {
    const win = BrowserWindow.getFocusedWindow() ?? windows()[0];
    const options: Electron.OpenDialogOptions =
      what === 'files'
        ? { title: 'Add packs', buttonLabel: 'Add', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Downloads and assets', extensions: ['*'] }] }
        : { title: what === 'folder' ? 'Add a folder as one pack' : 'Add a folder of packs', buttonLabel: 'Add', properties: ['openDirectory', 'multiSelections'] };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled || !result.filePaths.length ? null : result.filePaths;
  });
  handle('downloads:list', () => downloads.list());
  handle('downloads:add', (text) => downloads.add(linksIn(text)));
  handle('downloads:linksIn', (paths) => linksInFiles(paths));
  handle('downloads:pause', (id) => downloads.pause(id));
  handle('downloads:again', (id) => downloads.again(id));
  handle('downloads:remove', (id) => downloads.remove(id));
  handle('downloads:pauseAll', () => downloads.pauseAll());
  handle('downloads:resumeAll', () => downloads.resumeAll());
  handle('downloads:retryFailed', () => downloads.retryFailed());
  handle('downloads:resume', (id) => downloads.resume(id));
  handle('downloads:cancel', (id) => downloads.cancel(id));
  handle('downloads:clear', () => downloads.clear());
  handle('downloads:files', (ids) => ids.flatMap((id) => {
    const path = downloads.fileOf(id);
    const url = downloads.urlOf(id);
    return path && url ? [{ id, path, url }] : [];
  }));
  handle('downloads:done', (ids) => { for (const id of ids) void downloads.done(id, null); });

  handle('import:plan', (paths, eachInside) => library.planImport(paths, eachInside));
  handle('import:run', async (items, opts) => {
    const result = await library.import(items, openRecord()?.skipInboxWhenSure ?? true, !!opts?.stage);
    const added = result.added.filter((a) => a.status === 'library');
    const waiting = result.added.filter((a) => a.status === 'inbox');
    if (added.length) activity.add('added', added.length === 1 ? `Added “${added[0]!.name}”` : `Added ${added.length} packs`, added.map((a) => a.name).slice(0, 6).join(', '));
    if (waiting.length && !opts?.stage) activity.add('added', waiting.length === 1 ? `“${waiting[0]!.name}” is waiting in Review` : `${waiting.length} packs are waiting in Review`);
    return result;
  });
}
