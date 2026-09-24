/**
 * The list of libraries this computer knows about: what is kept for each, and moving a settings
 * file written by an older Tessera into the shape the app uses now.
 *
 * Getting the move wrong would lose somebody's backup settings, or point a library's backups at
 * another library's store, so it is checked field by field rather than by shape.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => import('./fake-electron'));

import { byRecent, libraryDataDir, migrateLegacy, newRecord, patchRecord, recordOf, touchLibrary } from '../src/main/libraries';
import { createLibrary, readLibraryInfo } from '../src/main/library/layout';
import { SettingsStore } from '../src/main/settings';
import { tempDir } from './helpers';

const later = (iso: string) => new Date(iso).toISOString();

describe('what is kept about a library', () => {
  it('starts with sensible answers rather than nothing', () => {
    const record = newRecord('aaaa', 'My Library', '/libraries/mine');
    expect(record).toMatchObject({ id: 'aaaa', name: 'My Library', path: '/libraries/mine', backup: null });
    expect(record.sync).toMatchObject({ enabled: false });
    expect(record.lastOpenedAt).toBeTruthy();
  });

  it('keeps each library own things apart, by its id', () => {
    expect(libraryDataDir('/data', 'aaaa')).toBe(join('/data', 'libraries', 'aaaa'));
    expect(libraryDataDir('/data', 'bbbb')).not.toBe(libraryDataDir('/data', 'aaaa'));
  });

  it('puts the one opened most recently first', () => {
    const list = {
      old: { ...newRecord('old', 'Old', '/a'), lastOpenedAt: later('2026-01-01T00:00:00.000Z') },
      recent: { ...newRecord('recent', 'Recent', '/b'), lastOpenedAt: later('2026-06-01T00:00:00.000Z') },
      middle: { ...newRecord('middle', 'Middle', '/c'), lastOpenedAt: later('2026-03-01T00:00:00.000Z') },
    };
    expect(byRecent(list).map((r) => r.id)).toEqual(['recent', 'middle', 'old']);
    expect(byRecent({})).toEqual([]);
  });
});

describe('reading and changing one of them', () => {
  it('finds one by id, and says nothing for an id that is not there', async () => {
    const dataDir = tempDir();
    const settings = new SettingsStore(dataDir);
    await settings.load();
    await touchLibrary(settings, dataDir, { id: 'aaaa', name: 'Mine', path: '/libraries/mine' });

    expect(recordOf(settings, 'aaaa')?.name).toBe('Mine');
    expect(recordOf(settings, 'not-there')).toBeNull();
    expect(recordOf(settings, null)).toBeNull();
    expect(recordOf(settings, undefined)).toBeNull();
  });

  it('remembers a library, and brings it to the front when it is opened again', async () => {
    const dataDir = tempDir();
    const settings = new SettingsStore(dataDir);
    await settings.load();

    await touchLibrary(settings, dataDir, { id: 'aaaa', name: 'First', path: '/a' });
    const before = recordOf(settings, 'aaaa')!.lastOpenedAt;
    await new Promise((r) => setTimeout(r, 5));

    // Opening it again keeps everything else and only moves it up the list.
    await patchRecord(settings, 'aaaa', { sync: { enabled: true, mode: 'full', whileClosed: true } });
    await touchLibrary(settings, dataDir, { id: 'aaaa', name: 'Renamed', path: '/a' });

    const after = recordOf(settings, 'aaaa')!;
    expect(after.name).toBe('Renamed');
    expect(after.sync.enabled).toBe(true);
    expect(after.lastOpenedAt >= before).toBe(true);
  });

  it('changes one with a patch, or with a function that sees what is there', async () => {
    const dataDir = tempDir();
    const settings = new SettingsStore(dataDir);
    await settings.load();
    await touchLibrary(settings, dataDir, { id: 'aaaa', name: 'Mine', path: '/a' });

    await patchRecord(settings, 'aaaa', { name: 'By patch' });
    expect(recordOf(settings, 'aaaa')?.name).toBe('By patch');

    await patchRecord(settings, 'aaaa', (r) => ({ name: `${r.name} again` }));
    expect(recordOf(settings, 'aaaa')?.name).toBe('By patch again');
  });

  it('does nothing, rather than breaking, over an id that is not there', async () => {
    const dataDir = tempDir();
    const settings = new SettingsStore(dataDir);
    await settings.load();
    await patchRecord(settings, 'never-existed', { name: 'x' });
    expect(recordOf(settings, 'never-existed')).toBeNull();
  });
});

describe('settings written by an older Tessera', () => {
  /** A real library folder, made the way the app makes one. */
  async function oldLibrary(where: string, name: string): Promise<string> {
    await createLibrary(where, name);
    return where;
  }

  it('moves the open library, the ones before it, and the one backup there was', async () => {
    const dataDir = tempDir();
    const dir = tempDir();
    const work = await oldLibrary(join(dir, 'Work'), 'Work');
    const home = await oldLibrary(join(dir, 'Home'), 'Home');
    const idOf = async (path: string) => (await readLibraryInfo(path)).id;
    const [workId, homeId] = [await idOf(work), await idOf(home)];
    // The app used to keep one Kopia connection for itself; it becomes the open library's.
    mkdirSync(join(dataDir, 'kopia'), { recursive: true });
    writeFileSync(join(dataDir, 'kopia', 'repository.config'), '{}');

    const moved = await migrateLegacy(
      {
        libraryPath: work,
        recentLibraries: [work, home],
        backupRepo: '/backups',
        backupIntervalHours: 12,
        lastBackupAt: '2026-02-02T00:00:00.000Z',
        syncEnabled: true,
        syncMode: 'push',
      },
      dataDir,
    );

    expect(moved).toBeTruthy();
    expect(Object.keys(moved!).sort()).toEqual([workId, homeId].sort());
    expect(moved![workId]!.name).toBe('Work');
    // The open library is first, keeps the backup, and keeps how it was syncing.
    expect(moved![workId]!.lastOpenedAt >= moved![homeId]!.lastOpenedAt).toBe(true);
    expect(moved![workId]!.backup?.intervalHours).toBe(12);
    expect(moved![workId]!.sync).toMatchObject({ enabled: true, mode: 'push' });
    // The other one had no backup of its own, and does not inherit somebody else's.
    expect(moved![homeId]!.backup).toBeNull();
    // The Kopia connection moved under the library it belongs to, rather than staying app-wide.
    expect(existsSync(join(libraryDataDir(dataDir, workId), 'backup', 'kopia'))).toBe(true);
    expect(existsSync(join(dataDir, 'kopia'))).toBe(false);
  });

  it('keeps a library known when only its backup settings mention it', async () => {
    const dataDir = tempDir();
    const moved = await migrateLegacy(
      {
        libraryBackups: {
          cccc: { repo: '/backups/gone', target: { provider: 'folder', values: { path: '/backups/gone' } }, intervalHours: 24, lastBackupAt: null, lastError: null, libraryName: 'Gone', libraryPath: '/libraries/gone' },
        },
      },
      dataDir,
    );
    expect(moved!.cccc!.name).toBe('Gone');
    expect(moved!.cccc!.backup?.repo).toBe('/backups/gone');
  });

  it('gives a library it could not read a name from its folder', async () => {
    const dataDir = tempDir();
    const dir = join(tempDir(), 'Unreadable');
    mkdirSync(dir, { recursive: true });
    const moved = await migrateLegacy({ recentLibraries: [dir] }, dataDir);
    const only = Object.values(moved!)[0]!;
    expect(only.name).toBe('Unreadable');
    expect(only.path).toBe(dir);
  });

  it('leaves settings that are already in the current shape alone', async () => {
    expect(await migrateLegacy({ libraries: { aaaa: newRecord('aaaa', 'Mine', '/a') } }, tempDir())).toBeNull();
    expect(await migrateLegacy({}, tempDir())).toBeNull();
  });

  it('ignores entries in the list that are not paths', async () => {
    const moved = await migrateLegacy({ recentLibraries: [{ nothing: 'useful' }, null, 42] }, tempDir());
    expect(moved).toEqual({});
  });
});
