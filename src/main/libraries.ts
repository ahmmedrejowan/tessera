import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { StorageTarget } from '@shared/storage';
import type { LibraryBackup, LibraryRecord } from '@shared/types';
import { readLibraryInfo } from './library/layout';
import { log } from './log';
import type { SettingsStore } from './settings';

/** Libraries kept in the list when nothing else holds them there (backups or sync do). */
const KEEP_RECENT = 12;

/** A library's own settings when it's first seen. */
export const newRecord = (id: string, name: string, path: string): LibraryRecord => ({
  id,
  name,
  path,
  lastOpenedAt: new Date().toISOString(),
  skipInboxWhenSure: true,
  sync: { enabled: false, mode: 'full', whileClosed: true },
  backup: null,
});

/** A place holder id for a library that couldn't be read (its drive away, say) until it opens. */
const unreadId = (path: string) => `unread-${createHash('sha1').update(path).digest('hex').slice(0, 16)}`;

/** Where Tessera keeps its own files for one library (previews, backup connection). */
export const libraryDataDir = (dataDir: string, id: string) => join(dataDir, 'libraries', id);

/**
 * Settings from before libraries had their own: a list of recent folders and one set of sync,
 * import and backup settings for the whole app. They become records, one per library; the
 * app-wide ones belong to the library that was open.
 */
export async function migrateLegacy(raw: Record<string, unknown>, dataDir: string): Promise<Record<string, LibraryRecord> | null> {
  if (raw.libraries || !(Array.isArray(raw.recentLibraries) || raw.libraryPath || raw.backupRepo || raw.libraryBackups || raw.unclaimedBackup)) return null;
  const open = typeof raw.libraryPath === 'string' ? raw.libraryPath : null;
  const recent = Array.isArray(raw.recentLibraries) ? raw.recentLibraries.filter((p): p is string => typeof p === 'string') : [];
  const paths = [...new Set([...(open ? [open] : []), ...recent])];
  type OldBackup = LibraryBackup & { libraryName?: string; libraryPath?: string };
  const perLibrary = (raw.libraryBackups ?? {}) as Record<string, OldBackup>;
  const unclaimed = (raw.unclaimedBackup ?? null) as OldBackup | null;
  // The oldest form: one backup for the app, named by the folder it went to.
  const oldest: OldBackup | null =
    typeof raw.backupRepo === 'string' && raw.backupRepo
      ? {
          repo: raw.backupRepo,
          target: (raw.backupTarget as StorageTarget | null) ?? { provider: 'folder', values: { path: raw.backupRepo } },
          intervalHours: typeof raw.backupIntervalHours === 'number' ? raw.backupIntervalHours : 24,
          lastBackupAt: (raw.lastBackupAt as string | null) ?? null,
          lastError: (raw.lastBackupError as string | null) ?? null,
          libraryPath: open ?? '',
        }
      : null;
  const appBackup = unclaimed ?? oldest;
  const plain = (b: OldBackup): LibraryBackup => ({ repo: b.repo, target: b.target, intervalHours: b.intervalHours ?? 24, lastBackupAt: b.lastBackupAt ?? null, lastError: b.lastError ?? null });

  const records: Record<string, LibraryRecord> = {};
  const now = Date.now();
  for (const [i, path] of paths.entries()) {
    const info = await readLibraryInfo(path).catch(() => null);
    const id = info?.id ?? unreadId(path);
    const r = newRecord(id, info?.name ?? path.split(/[\\/]/).filter(Boolean).at(-1) ?? path, path);
    // Newest first, a second apart, in the order they were listed.
    r.lastOpenedAt = new Date(now - i * 1000).toISOString();
    if (typeof raw.skipInboxWhenSure === 'boolean') r.skipInboxWhenSure = raw.skipInboxWhenSure;
    if (path === open && raw.syncEnabled === true) r.sync = { enabled: true, mode: (raw.syncMode as LibraryRecord['sync']['mode']) ?? 'full', whileClosed: true };
    const own = info ? perLibrary[info.id] : undefined;
    if (own) r.backup = plain(own);
    else if (appBackup && (appBackup.libraryPath ? appBackup.libraryPath === path : path === open)) r.backup = plain(appBackup);
    records[id] = r;
  }
  // Backups of libraries no longer in the recent list keep their library known.
  for (const [id, b] of Object.entries(perLibrary)) {
    if (records[id] || !b.libraryPath) continue;
    records[id] = { ...newRecord(id, b.libraryName ?? id, b.libraryPath), lastOpenedAt: new Date(now - paths.length * 1000).toISOString(), backup: plain(b) };
  }
  // The app-wide backup's Kopia connection and password become its library's.
  const owner = Object.values(records).find((r) => r.backup && appBackup && r.backup.repo === appBackup.repo && !perLibrary[r.id]);
  if (owner) {
    const to = join(libraryDataDir(dataDir, owner.id), 'backup');
    await mkdir(to, { recursive: true });
    if (existsSync(join(dataDir, 'kopia'))) await rename(join(dataDir, 'kopia'), join(to, 'kopia'));
    if (existsSync(join(dataDir, 'kopia-password.bin'))) await rename(join(dataDir, 'kopia-password.bin'), join(to, 'password.bin'));
  }
  log.info('settings', `libraries now keep their own settings (${Object.keys(records).length} known)`);
  return records;
}

/** The known libraries, most recently opened first. */
export const byRecent = (libraries: Record<string, LibraryRecord>) => Object.values(libraries).sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));

/** A library's record, or null. */
export const recordOf = (settings: SettingsStore, id: string | null | undefined): LibraryRecord | null => (id ? (settings.get().libraries[id] ?? null) : null);

/** Change a library's record (nothing happens when it isn't known). */
export async function patchRecord(settings: SettingsStore, id: string, patch: Partial<LibraryRecord> | ((r: LibraryRecord) => Partial<LibraryRecord>)): Promise<void> {
  const r = settings.get().libraries[id];
  if (!r) return;
  const next = { ...r, ...(typeof patch === 'function' ? patch(r) : patch), id };
  await settings.update({ libraries: { ...settings.get().libraries, [id]: next } });
}

/**
 * A library opened: note it (name, folder, when), making a record the first time. A record kept
 * for the same folder before its library could be read passes its settings and files on.
 */
export async function touchLibrary(settings: SettingsStore, dataDir: string, lib: { id: string; name: string; path: string }): Promise<LibraryRecord> {
  const all = { ...settings.get().libraries };
  let record = all[lib.id];
  for (const other of Object.values(all)) {
    if (other.id === lib.id || other.path !== lib.path || !other.id.startsWith('unread-')) continue;
    record ??= { ...other, id: lib.id };
    const from = libraryDataDir(dataDir, other.id);
    const to = libraryDataDir(dataDir, lib.id);
    if (existsSync(from) && !existsSync(to)) {
      await mkdir(dirname(to), { recursive: true });
      await rename(from, to);
    }
    delete all[other.id];
  }
  record = { ...(record ?? newRecord(lib.id, lib.name, lib.path)), name: lib.name, path: lib.path, lastOpenedAt: new Date().toISOString() };
  all[lib.id] = record;
  // Keep the list short, but never drop a library whose backups or sync are on.
  const spare = byRecent(all).filter((r) => !r.backup && !r.sync.enabled);
  for (const r of spare.slice(KEEP_RECENT)) delete all[r.id];
  await settings.update({ libraries: all, libraryPath: lib.path });
  return record;
}
