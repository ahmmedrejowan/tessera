/**
 * Keeping a library safe: backups, restoring one, syncing between computers, and the helper
 * programs those need.
 *
 * Every handler here answers one channel of the contract in src/shared/ipc.ts. What it needs is
 * given to it; nothing in this file reaches for a service of its own.
 */
import { BrowserWindow, app, dialog, net, systemPreferences } from 'electron';
import { join } from 'node:path';
import { describeTarget, providerInfo } from '@shared/storage';
import { writeRecoveryKit } from '../backup/kit';
import { generatePassword, saveToKeychain } from '../backup/password';
import { backupPlaces, findBackups, storeAt } from '../backup/restore';
import { hostKeys, keyFileNeedsPassphrase } from '../backup/ssh';
import { UserError, broadcast, handle } from '../ipc';
import { readLibraryInfo } from '../library/layout';
import { findTool } from '../tools/find';
import { installTool } from '../tools/install';
import type { JobHandle } from '../jobs';
import type { IpcContext } from './context';

type Deps = Pick<IpcContext, 'activity' | 'backupChanged' | 'backups' | 'dataDir' | 'jobs' | 'librariesChanged' | 'library' | 'libraryId' | 'platform' | 'rcloneAuth' | 'restorer' | 'settings' | 'sync' | 'syncChanged' | 'windows'>;

export function registerSafetyIpc(c: Deps): void {
  const { activity, backupChanged, backups, dataDir, jobs, librariesChanged, library, libraryId, platform, rcloneAuth, restorer, settings, sync, syncChanged, windows } = c;
  handle('backup:status', () => backups.status());
  handle('backup:chooseFolder', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? windows()[0];
    const options: Electron.OpenDialogOptions = { title: 'Choose where to keep backups', buttonLabel: 'Choose', properties: ['openDirectory', 'createDirectory'] };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  handle('backup:setup', (target, password, create) => backups.setup(target, password, create));
  handle('backup:signIn', (provider, client) => rcloneAuth.signIn(providerInfo(provider), (url) => broadcast(windows, 'backup:signInUrl', url), client));
  handle('backup:cancelSignIn', () => rcloneAuth.cancel());
  handle('backup:hostKey', (host, port) => hostKeys(host, port));
  handle('backup:keyNeedsPassphrase', (path) => keyFileNeedsPassphrase(path));
  handle('backup:generatePassword', () => generatePassword());
  handle('backup:revealPassword', async () => {
    // Where the Mac can ask for Touch ID, it does before showing the password.
    if (platform === 'darwin' && process.env.TESSERA_E2E !== '1' && systemPreferences.canPromptTouchID()) {
      await systemPreferences.promptTouchID('show your backup password').catch(() => {
        throw new UserError('not-confirmed', 'The password stays hidden.');
      });
    }
    return backups.password();
  });
  handle('backup:changePassword', (next) => backups.changePassword(next));
  handle('backup:saveKit', async ({ password, target, includeKeys }) => {
    const state = library.getState();
    const where = target ?? backups.target();
    if (!where) throw new UserError('no-backup', 'Backups aren’t set up yet.');
    const win = BrowserWindow.getFocusedWindow() ?? windows()[0];
    const options: Electron.SaveDialogOptions = { title: 'Save the recovery kit', defaultPath: join(app.getPath('documents'), 'Tessera recovery kit.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] };
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    await writeRecoveryKit(result.filePath, { library: state.status === 'ready' ? state.library.name : 'Your library', target: where, password: password ?? (await backups.password()), includeKeys: includeKeys && !!target });
    return result.filePath;
  });
  handle('backup:saveToKeychain', async (password) => {
    const state = library.getState();
    const target = backups.target();
    const account = [state.status === 'ready' ? state.library.name : null, target ? describeTarget(target) : null].filter(Boolean).join(' · ') || 'Tessera';
    await saveToKeychain(account, password ?? (await backups.password()));
  });
  handle('backup:now', async () => {
    const done = await backups.backupNow();
    activity.add('backup', 'Backed up this library');
    return done;
  });
  handle('backup:join', (libraryId) => backups.join(libraryId));
  handle('backup:setInterval', (hours) => backups.setInterval(hours));
  handle('backup:snapshots', () => backups.snapshots());
  // Libraries this computer knows, to keep a restored copy from sharing an id with its original.
  const knownLibraries = async () => {
    const state = library.getState();
    const known: { id: string; path: string }[] = state.status === 'ready' ? [{ id: state.library.id, path: state.library.path }] : [];
    for (const { path } of Object.values(settings.get().libraries)) {
      const kind = await library.inspect(path).catch(() => null);
      if (kind === 'library') known.push({ id: (await readLibraryInfo(path)).id, path });
    }
    return known;
  };
  const restoreProgress = (job: JobHandle) => (f: number | null) => {
    job.update(f, 'Putting the files back');
    broadcast(windows, 'restore:progress', f);
  };
  handle('backup:restore', (id, target, size, name) => jobs.run('Restoring a copy of the library', (job) => backups.restore(id, target, size, name, restoreProgress(job), knownLibraries)));
  handle('backup:turnOff', () => backups.turnOff());

  handle('restore:places', () => backupPlaces());
  handle('restore:find', async () => findBackups(await backupPlaces()));
  handle('restore:storeAt', (path) => storeAt(path));
  handle('restore:unlock', (target, password) => restorer.unlock(target, password));
  handle('restore:run', (id, target, size) => jobs.run('Restoring a library', (job) => restorer.restore(id, target, size, restoreProgress(job), knownLibraries)));
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
  handle('sync:setWhileClosed', async (v) => {
    await sync.setWhileClosed(v);
    librariesChanged();
  });
  handle('sync:disable', () => sync.disable());
  handle('sync:addDevice', (id, name) => sync.addDevice(id, name));
  handle('sync:removeDevice', (id) => sync.removeDevice(id));
  handle('sync:receive', () => sync.startForReceiving());
  handle('sync:acceptFolder', (folderId, offeredBy, label, path, mode) => sync.acceptFolder(folderId, offeredBy, label, path, mode));
  handle('sync:folderProgress', (folderId) => sync.folderProgress(folderId));
  handle('tools:install', async (tool) => {
    const version = await installTool(tool, dataDir, (url, init) => net.fetch(url, init), (p) => broadcast(windows, 'tools:installProgress', { tool, ...p }));
    tool === 'syncthing' ? syncChanged() : backupChanged();
    return version;
  });
  handle('tools:packageManagers', () => ['brew', 'winget', 'apt', 'dnf', 'pacman', 'zypper', 'flatpak', 'snap'].filter((tool) => !!findTool(tool)));

  // Three small CC0 packs by Kenney, shipped with the app for a first look (resources/samples).
}
